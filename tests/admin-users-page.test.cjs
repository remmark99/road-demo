const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

// Render the real page with deterministic hook state; no browser, mounted
// providers, network calls or account mutations are needed for list states.
// Walk the returned React element tree so handlers on interactive elements can
// be invoked directly, without a browser or a DOM.
function collect(node, predicate, out = []) {
    if (node == null) return out
    if (Array.isArray(node)) { for (const child of node) collect(child, predicate, out); return out }
    if (typeof node !== 'object' || !React.isValidElement(node)) return out
    if (predicate(node)) out.push(node)
    collect(node.props?.children, predicate, out)
    return out
}

// Реальный lib/license-modules.ts: каталог, урезанный лицензией, — поведение,
// которое здесь проверяется, живёт именно там.
function loadLicenseModules() {
    const shim = { exports: {} }
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/license-modules.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    new Function('require', 'module', 'exports', code)(id => { throw new Error(`Unexpected import: ${id}`) }, shim, shim.exports)
    return shim.exports
}
const licenseModulesLib = loadLicenseModules()

function page({ currentUserId = 'verified-user', writeResponse = { ok: true, data: { success: true } }, license = { valid: true, modules: ['stops', 'roads', 'shore', 'transport', 'parks', 'asr'] } } = {}) {
    const state = [], effects = []
    let cursor = 0
    let response = { ok: false, data: { error: 'Users service unavailable' } }
    const calls = []
    const hooks = {
        useState(initial) {
            const index = cursor++
            if (!(index in state)) state[index] = initial
            return [state[index], value => { state[index] = value }]
        },
        useEffect(effect) { effects.push(effect) },
    }
    const passthrough = ({ children }) => React.createElement('div', null, children)
    const Dialog = ({ open, children }) => open ? React.createElement('div', { 'data-dialog': 'open' }, children) : null
    const dialogModule = new Proxy({ Dialog }, { get: (target, key) => (key in target ? target[key] : passthrough) })
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/admin/page.tsx'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText
    const module = { exports: {} }
    new Function('require', 'module', 'exports', 'fetch', code)(id => {
        if (id === 'react') return hooks
        if (id === 'react/jsx-runtime') return require(id)
        if (id === '@/components/providers/module-context') return { useModuleAccess: () => ({ role: 'admin', loading: false }) }
        if (id === '@/components/ui/dialog') return dialogModule
        if (id === '@/lib/supabase/client') return { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: currentUserId } } }) } }) }
        if (id === '@/lib/license-modules') return licenseModulesLib
        if (id.startsWith('@/components/') || id === 'lucide-react') return new Proxy({}, { get: () => passthrough })
        throw new Error(`Unexpected import: ${id}`)
    }, module, module.exports, async (url, options) => {
        if (url === '/api/license') {
            if (license === null) throw new Error('license endpoint unreachable')
            return { ok: true, json: async () => license }
        }
        assert.equal(url, '/api/admin/users')
        calls.push({ url, options })
        if (!options) return { ok: response.ok, json: async () => response.data }
        return { ok: writeResponse.ok, json: async () => writeResponse.data }
    })
    return {
        Dialog,
        calls,
        buttonWithText(text) {
            return collect(this.element(), node =>
                typeof node.props?.onClick === 'function' &&
                [].concat(node.props.children ?? []).some(child => typeof child === 'string' && child.trim() === text)
            )[0]
        },
        element() {
            cursor = 0
            return module.exports.default()
        },
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
        async settle() {
            await new Promise(resolve => setImmediate(resolve))
        },
        deleteButtons() {
            return collect(this.element(), node => node.props?.['aria-label'] === 'Удалить пользователя')
        },
        openDialog() {
            return collect(this.element(), node => node.type === Dialog && node.props.open)[0]
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

const users = [
    { id: 'user-one', email: 'one@example.test', role: 'user', modules: [] },
    { id: 'admin-two', email: 'two@example.test', role: 'admin', modules: [] },
]

test('every user row carries a delete control', async () => {
    const ui = page()
    ui.render()
    await ui.load({ ok: true, data: users })
    assert.equal(ui.deleteButtons().length, users.length)
})

test('the signed-in admin own row delete control is disabled with an explanation', async () => {
    const ui = page({ currentUserId: 'admin-two' })
    ui.render()
    await ui.load({ ok: true, data: users })
    const buttons = ui.deleteButtons()
    assert.equal(buttons[0].props.disabled, false)
    assert.equal(buttons[1].props.disabled, true)
    assert.match(buttons[1].props.title, /себя|собственн/i)
})

test('the last remaining admin row delete control is disabled with an explanation', async () => {
    const ui = page({ currentUserId: 'someone-else' })
    ui.render()
    await ui.load({ ok: true, data: users })
    const buttons = ui.deleteButtons()
    assert.equal(buttons[0].props.disabled, false)
    assert.equal(buttons[1].props.disabled, true)
    assert.match(buttons[1].props.title, /последн/i)
})

test('opening the delete dialog shows the target email, the irreversible warning and the acknowledgement checkbox', async () => {
    const ui = page({ currentUserId: 'someone-else' })
    ui.render()
    await ui.load({ ok: true, data: users })
    ui.deleteButtons()[0].props.onClick()
    const html = ui.render()
    assert.match(html, /one@example\.test/)
    assert.match(html, /необратим/i)
    assert.match(html, /Понимаю, что действие необратимо/)
    assert.equal(collect(ui.openDialog(), node => node.props?.type === 'checkbox').length, 1)
})

test('the confirm button stays disabled until the acknowledgement checkbox is ticked', async () => {
    const ui = page({ currentUserId: 'someone-else' })
    ui.render()
    await ui.load({ ok: true, data: users })
    ui.deleteButtons()[0].props.onClick()

    const confirmLabel = node => typeof node.props?.children === 'string' && node.props.children.trim() === 'Удалить'
    const before = collect(ui.openDialog(), confirmLabel)
    assert.equal(before.length, 1)
    assert.equal(before[0].props.disabled, true)

    collect(ui.openDialog(), node => node.props?.type === 'checkbox')[0].props.onChange({ target: { checked: true } })

    assert.equal(collect(ui.openDialog(), confirmLabel)[0].props.disabled, false)
})

test('confirming sends DELETE (not POST/PUT) with the target id, closes the dialog and reloads the list', async () => {
    const ui = page({ currentUserId: 'someone-else' })
    ui.render()
    await ui.load({ ok: true, data: users })
    ui.deleteButtons()[0].props.onClick()
    collect(ui.openDialog(), node => node.props?.type === 'checkbox')[0].props.onChange({ target: { checked: true } })

    const confirm = collect(ui.openDialog(), node => typeof node.props?.children === 'string' && node.props.children.trim() === 'Удалить')[0]
    await confirm.props.onClick()
    await ui.settle()

    const writes = ui.calls.filter(call => call.options)
    assert.equal(writes.length, 1)
    assert.equal(writes[0].options.method, 'DELETE')
    assert.deepEqual(JSON.parse(writes[0].options.body), { id: 'user-one' })
    assert.equal(ui.calls.at(-1).options, undefined)
    assert.doesNotMatch(ui.render(), /Понимаю, что действие необратимо/)
})

// --- Доступы выдаются в пределах купленной лицензии -------------------------
//
// Список модулей в админке — это каталог платформы, урезанный составом лицензии.
// Клиентская отсечка нужна, чтобы админ не выбирал недоступное; серверная (см.
// admin-users-api.test.cjs) остаётся обязательной: интерфейс обходится запросом.

const CUSTOMER_LICENSE = { valid: true, modules: ['stops'] }

test('the page states which modules the license allows', async () => {
    const ui = page({ license: CUSTOMER_LICENSE })
    ui.render()
    await ui.load({ ok: true, data: [] })
    assert.match(ui.render(), /Лицензия разрешает: Остановочные павильоны/)
})

test('the create dialog offers only the modules the license covers', async () => {
    const ui = page({ license: CUSTOMER_LICENSE })
    ui.render()
    await ui.load({ ok: true, data: [] })
    ui.buttonWithText('Создать пользователя').props.onClick()
    const html = renderToStaticMarkup(ui.openDialog())
    assert.match(html, /Остановочные павильоны/)
    assert.doesNotMatch(html, /Состояние дорог/)
    assert.doesNotMatch(html, /Площадки ТКО/)
})

test('an assigned module outside the license is marked as such, not hidden', async () => {
    // Доступ выдан раньше или мимо админки. Скрыть его значило бы соврать о
    // фактических правах; показать с пометкой — дать админу его снять.
    const ui = page({ license: CUSTOMER_LICENSE })
    ui.render()
    await ui.load({ ok: true, data: [{ id: 'user-one', email: 'one@example.test', role: 'user', modules: ['stops', 'roads'] }] })
    const html = ui.render()
    assert.match(html, /Остановочные павильоны/)
    assert.match(html, /Состояние дорог/)
    assert.match(html, /не входит в купленную лицензию/)
})

test('an invalid license offers nothing to assign', async () => {
    const ui = page({ license: { valid: false, modules: [] } })
    ui.render()
    await ui.load({ ok: true, data: [] })
    const html = ui.render()
    assert.match(html, /нет действующей лицензии/)
    assert.doesNotMatch(html, /Остановочные павильоны/)
})

test('an unreachable license endpoint leaves the full catalogue to the server gate', async () => {
    // Транзиентный сбой не должен отбирать у админа возможность работать: список
    // остаётся полным, а отказ придёт от API.
    const ui = page({ license: null })
    ui.render()
    await ui.load({ ok: true, data: [] })
    const html = ui.render()
    assert.doesNotMatch(html, /Лицензия разрешает/)
    ui.buttonWithText('Создать пользователя').props.onClick()
    assert.match(renderToStaticMarkup(ui.openDialog()), /Состояние дорог/)
})

test('a failed delete keeps the dialog open and surfaces the error', async () => {
    const ui = page({ currentUserId: 'someone-else', writeResponse: { ok: false, data: { error: 'Deletion refused' } } })
    ui.render()
    await ui.load({ ok: true, data: users })
    ui.deleteButtons()[0].props.onClick()
    collect(ui.openDialog(), node => node.props?.type === 'checkbox')[0].props.onChange({ target: { checked: true } })

    const confirm = collect(ui.openDialog(), node => typeof node.props?.children === 'string' && node.props.children.trim() === 'Удалить')[0]
    await confirm.props.onClick()
    await ui.settle()

    const html = ui.render()
    assert.match(html, /Deletion refused/)
    assert.match(html, /Понимаю, что действие необратимо/)
})
