export const SUPPORT_TOPICS = [
  {
    value: "data_change",
    label: "Изменение данных",
    description: "Добавление, изменение или удаление объектов",
  },
  {
    value: "bug",
    label: "Баг-репорт",
    description: "Что-то работает не так, как должно",
  },
  {
    value: "feature",
    label: "Пожелание",
    description: "Идея по улучшению платформы",
  },
  {
    value: "access",
    label: "Доступ и права",
    description: "Проблемы со входом, ролями или правами",
  },
  {
    value: "other",
    label: "Другое",
    description: "Всё остальное",
  },
] as const

export type SupportTopic = (typeof SUPPORT_TOPICS)[number]["value"]

export function isSupportTopic(value: string): value is SupportTopic {
  return SUPPORT_TOPICS.some((topic) => topic.value === value)
}

export function getSupportTopicLabel(value: SupportTopic) {
  return SUPPORT_TOPICS.find((topic) => topic.value === value)?.label ?? value
}
