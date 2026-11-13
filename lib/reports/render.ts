import { reportFileName, type ReportDocument, type ReportFormat } from './document'
import { renderReportDocx } from './render-docx'
import { renderReportPdf } from './render-pdf'
import { renderReportXlsx } from './render-xlsx'

const CONTENT_TYPES: Record<ReportFormat, string> = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export function renderReport(report: ReportDocument, format: ReportFormat) {
    const body = format === 'pdf' ? renderReportPdf(report) : format === 'xlsx' ? renderReportXlsx(report) : renderReportDocx(report)
    return { body, contentType: CONTENT_TYPES[format], fileName: reportFileName(report, format) }
}

/** Ответ-файл: имя по-русски через filename*, запасное ASCII-имя для старых клиентов. */
export function reportResponse(report: ReportDocument, format: ReportFormat) {
    const file = renderReport(report, format)
    return new Response(new Blob([file.body as BlobPart], { type: file.contentType }), {
        headers: {
            'Content-Type': file.contentType,
            'Content-Disposition': `attachment; filename="vector-report.${format}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
            'Cache-Control': 'no-store',
        },
    })
}
