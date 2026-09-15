export function mapReportFilename(from: string, to: string) {
    const date = (value: string) => value.split('-').reverse().join('.')
    return `Отчёт об остановках с ${date(from)} по ${date(to)}.xlsx`
}
