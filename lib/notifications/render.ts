import type { NotificationEventPayload } from "./types"
import { getNotificationEventTypeLabel } from "./catalog"

const SURGUT_TIME_ZONE = "Asia/Yekaterinburg"

const MODULE_LABELS: Record<string, string> = {
  roads: "Состояние дорог",
  shore: "Безопасный берег",
  stops: "Остановки",
  parks: "Безопасный парк",
  transport: "Контроль транспорта",
  asr: "Площадки ТКО",
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function escapeMarkdown(value: string) {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1")
}

export function getEventLink(payload: NotificationEventPayload) {
  const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "")
  if (!baseUrl) return null

  const params = payload.source === "alerts"
    ? `?alertId=${encodeURIComponent(payload.event_id)}`
    : ""
  return `${baseUrl}/notifications${params}`
}

export function getModuleLabel(moduleName: string) {
  return MODULE_LABELS[moduleName] ?? moduleName
}

export function formatEventTime(timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: SURGUT_TIME_ZONE,
  }).format(date)
}

export function renderEmailEvent(payload: NotificationEventPayload) {
  const moduleLabel = getModuleLabel(payload.module_name)
  const eventTypeLabel = getNotificationEventTypeLabel(
    payload.source,
    payload.module_name,
    payload.event_type,
  )
  const eventTime = formatEventTime(payload.timestamp)
  const link = getEventLink(payload)
  const subject = `[Вектор Города] ${moduleLabel}: ${eventTypeLabel}`
    .replace(/[\r\n]+/g, " ")
    .slice(0, 200)
  const text = [
    "Вектор Города — новое событие",
    "",
    `Модуль: ${moduleLabel}`,
    `Тип: ${eventTypeLabel}`,
    `Важность: ${payload.severity}`,
    `Время: ${eventTime}`,
    `Описание: ${payload.message}`,
    link ? `Открыть: ${link}` : null,
  ].filter(Boolean).join("\n")

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#172033">
      <h1 style="font-size:22px;color:#0f766e">Вектор Города</h1>
      <h2 style="font-size:18px">Новое событие</h2>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:6px 0;color:#64748b">Модуль</td><td>${escapeHtml(moduleLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Тип</td><td>${escapeHtml(eventTypeLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Важность</td><td>${escapeHtml(payload.severity)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Время</td><td>${escapeHtml(eventTime)}</td></tr>
      </table>
      <p style="padding:14px;background:#f1f5f9;border-radius:8px">${escapeHtml(payload.message)}</p>
      ${link ? `<p><a href="${escapeHtml(link)}" style="color:#0f766e">Открыть событие на сайте</a></p>` : ""}
      <p style="margin-top:28px;color:#64748b;font-size:12px">Автоматическое уведомление системы мониторинга.</p>
    </div>
  `

  return { subject, text, html }
}

export function renderMaxEvent(payload: NotificationEventPayload) {
  const moduleLabel = getModuleLabel(payload.module_name)
  const eventTypeLabel = getNotificationEventTypeLabel(
    payload.source,
    payload.module_name,
    payload.event_type,
  )
  const message = [
    "**Вектор Города — новое событие**",
    "",
    `**Модуль:** ${escapeMarkdown(moduleLabel)}`,
    `**Тип:** ${escapeMarkdown(eventTypeLabel)}`,
    `**Важность:** ${escapeMarkdown(payload.severity)}`,
    `**Время:** ${escapeMarkdown(formatEventTime(payload.timestamp))}`,
    "",
    escapeMarkdown(payload.message),
  ].join("\n")

  return message.length <= 3800 ? message : `${message.slice(0, 3797)}...`
}
