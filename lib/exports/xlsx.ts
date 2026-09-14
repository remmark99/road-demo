import { strToU8, zipSync } from 'fflate'

export type Cell = string | number | null
export interface Sheet { name: string; rows: Cell[][]; columnWidths?: number[]; wrapColumns?: number[] }
const xml = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
function column(index: number): string {
    let name = ''
    for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name
    return name
}

/** Plain rectangular sheets: numeric counts, ISO local times, no formulas/merged cells. */
export function createXlsx(sheets: Sheet[]): Uint8Array {
    const files: Record<string, Uint8Array> = {}
    const add = (name: string, content: string) => { files[name] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + content) }
    add('[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)
    add('_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`)
    add('xl/workbook.xml', `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`)
    add('xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i+1}" Type="${rel}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="${rel}/styles" Target="styles.xml"/></Relationships>`)
    add('xl/styles.xml', `<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/><xf xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`)
    sheets.forEach((sheet, i) => {
        const width = Math.max(1, ...sheet.rows.map(r => r.length))
        add(`xl/worksheets/sheet${i+1}.xml`, `<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${Array.from({ length: width }, (_, c) => `<col min="${c+1}" max="${c+1}" width="${sheet.columnWidths?.[c] ?? 26}" customWidth="1"/>`).join('')}</cols><sheetData>${sheet.rows.map((row, r) => `<row r="${r+1}"${sheet.wrapColumns?.length && r > 0 ? ` ht="${Math.max(1, ...sheet.wrapColumns.map(c => String(row[c] ?? '').split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / (sheet.columnWidths?.[c] ?? 26))), 0))) * 16}" customHeight="1"` : ''}>${row.map((cell, c) => {
            const ref = `${column(c)}${r+1}`, style = r === 0 ? ' s="1"' : sheet.wrapColumns?.includes(c) ? ' s="2"' : ''
            if (cell === null) return `<c r="${ref}"/>`
            if (typeof cell === 'number' && Number.isFinite(cell)) return `<c r="${ref}"${style}><v>${cell}</v></c>`
            // Explicit inlineStr prevents names beginning with =, +, - or @ becoming formulas.
            return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(String(cell))}</t></is></c>`
        }).join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:${column(width-1)}${Math.max(1, sheet.rows.length)}"/></worksheet>`)
    })
    return zipSync(files, { level: 6 })
}
