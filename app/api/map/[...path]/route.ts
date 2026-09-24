import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import nodePath from 'node:path'

// Локальная подложка карты: тайлы, глифы и спрайты, зеркалённые с OpenFreeMap
// скриптом scripts/fetch-map-tiles.mjs. Нужна потому, что у части клиентов
// браузер не вытягивает tiles.openfreemap.org напрямую.

const MAP_DIR = nodePath.join(process.cwd(), 'public', 'map')
// Запятая — легальный разделитель шрифтов внутри фонтстека MapLibre
// («Noto Sans Bold,Noto Sans Regular»), пробел — часть имени шрифта.
const SEGMENT_PATTERN = /^[\w@.,-]+$/
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

const CONTENT_TYPES: Record<string, string> = {
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.pbf': 'application/x-protobuf',
}

function contentTypeFor(relPath: string) {
    // Тайлы и глифы оба .pbf, но MapLibre ждёт для тайлов свой MIME.
    if (relPath.startsWith('tiles/')) return 'application/vnd.mapbox-vector-tile'
    return CONTENT_TYPES[nodePath.extname(relPath)] ?? 'application/octet-stream'
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path: segments } = await params

    // Имена фонтстеков содержат пробелы («Noto Sans Regular»), остальное — строго
    // безопасный набор символов, чтобы не выпустить чтение за пределы public/map.
    const clean = segments.map(s => decodeURIComponent(s))
    if (!clean.length || clean.some(s => !SEGMENT_PATTERN.test(s.replace(/ /g, '_')))) {
        return NextResponse.json({ error: 'Invalid map asset path' }, { status: 400 })
    }

    const relPath = clean.join('/')
    const absPath = nodePath.join(MAP_DIR, ...clean)
    if (!absPath.startsWith(MAP_DIR + nodePath.sep)) {
        return NextResponse.json({ error: 'Invalid map asset path' }, { status: 400 })
    }

    // Скрипт кладёт сжимаемое как <имя>.gz — отдаём его как есть с Content-Encoding.
    for (const [candidate, encoding] of [[`${absPath}.gz`, 'gzip'], [absPath, null]] as const) {
        try {
            const body = await fs.readFile(candidate)
            const headers: Record<string, string> = {
                'Content-Type': contentTypeFor(relPath),
                'Cache-Control': CACHE_CONTROL,
            }
            if (encoding) headers['Content-Encoding'] = encoding
            return new NextResponse(new Uint8Array(body), { headers })
        } catch (error) {
            const code = typeof error === 'object' && error && 'code' in error
                ? String((error as { code?: string }).code)
                : ''
            if (code !== 'ENOENT') {
                console.error('map asset read failed', relPath, error)
                return NextResponse.json({ error: 'Map asset unavailable' }, { status: 500 })
            }
        }
    }

    // Внутри бокса дырки нормальны: там, где в OSM ничего нет, апстрим тоже отдаёт
    // пусто. 204 вместо 404 — чтобы MapLibre не сыпал ошибками в консоль.
    if (relPath.startsWith('tiles/')) {
        return new NextResponse(null, { status: 204, headers: { 'Cache-Control': CACHE_CONTROL } })
    }
    return NextResponse.json({ error: 'Map asset not found' }, { status: 404 })
}
