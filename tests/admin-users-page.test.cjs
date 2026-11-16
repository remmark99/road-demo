const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

// Render the real page with deterministic hook state; no browser, mounted
// providers, network calls or account mutations are needed for list states.
function page() {
    const state = [], effects = []
    let cursor = 0
    let response = { ok: false, data: { error: 'Users service unavailable' } }
    const hooks = {
        useState(initial) {
            const index = cursor++
            if (!(index in state)) state[index] = initial
            return [state[index], value => { state[index] = value }]
        },
        useEffect(effect) { effects.push(effect) },
    }
    const passthrough = ({ children }) => React.createElement('div', null, children)
    const nothing = () => null
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/admin/page.tsx'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText
    const module = { exports: {} }
    new Function('require', 'module', 'exports', 'fetch', code)(id => {
        if (id === 'react') return hooks
        if (id === 'react/jsx-runtime') return require(id)
        if (id === '@/components/providers/module-context') return { useModuleAccess: () => ({ role: 'admin', loading: false }) }
        if (id === '@/components/ui/dialog') return new Proxy({}, { get: () => nothing })
        if (id.startsWith('@/components/') || id === 'lucide-react') return new Proxy({}, { get: () => passthrough })
        throw new Error(`Unexpected import: ${id}`)
    }, module, module.exports, async (url, options) => {
        assert.equal(url, '/api/admin/users')
        assert.equal(options, undefined, 'Only read requests are allowed')
        return { ok: response.ok, json: async () => response.data }
    })
    return {
        render() {
            cursor = 0
            effects.length = 0
            return renderToStaticMarkup(module.exports.default())
        },
        async load(nextResponse = response) {
            response = nextResponse
            effects[0]()
            await new Promise(resolve => setImmediate(resolve))
        },
    }
}

test('failed user fetch displays its error without claiming no users are registered', async () => {
    const ui = page()
    ui.render()
    await ui.load()
    const html = ui.render()
    assert.match(html, /Users service unavailable/)
    assert.doesNotMatch(html, /Нет зарегистрированных пользователей/)
})

test('successful empty user fetch displays the genuine empty state', async () => {
    const ui = page()
    ui.render()
    await ui.load({ ok: true, data: [] })
    assert.match(ui.render(), /Нет зарегистрированных пользователей/)
})

test('successful retry clears the stale user-fetch error', async () => {
    const ui = page()
    ui.render()
    await ui.load()
    assert.match(ui.render(), /Users service unavailable/)
    await ui.load({ ok: true, data: [] })
    const html = ui.render()
    assert.doesNotMatch(html, /Users service unavailable/)
    assert.match(html, /Нет зарегистрированных пользователей/)
})
