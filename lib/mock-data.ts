import type { Notification, RoadStatusHistory, RoadStatus } from "./types"

// Камеры теперь хранятся в Supabase - см. lib/api/cameras.ts
// Дороги теперь загружаются из Supabase - см. lib/api/roads.ts

// Генерация истории статусов для таймлайна (используется для демо)
export function generateStatusHistory(hours: number = 24): RoadStatusHistory[] {
  const history: RoadStatusHistory[] = []
  const statuses: RoadStatus[] = ["clean", "dirty", "warning", "clean", "dirty"]
  const now = new Date()

  // Generate history for a set of demo segment IDs
  const demoSegmentIds = ["demo-1", "demo-2", "demo-3"]

  for (const segmentId of demoSegmentIds) {
    for (let i = 0; i < hours * 2; i++) {
      const timestamp = new Date(now.getTime() - i * 30 * 60 * 1000)
      const statusIndex = Math.floor(Math.random() * statuses.length)
      history.push({
        timestamp,
        status: statuses[statusIndex],
        segmentId
      })
    }
  }

  return history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
}

// Уведомления
export const notifications: Notification[] = [
  {
    id: "notif-1",
    timestamp: new Date(Date.now() - 15 * 60 * 1000),
    type: "status_change",
    title: "Изменение состояния дороги",
    description: "пр. Ленина (участок 2) - дорога загрязнена",
    segmentId: "seg-2",
    previousStatus: "clean",
    newStatus: "dirty",
    videoClipUrl: "/placeholder-video.mp4"
  },
  {
    id: "notif-2",
    timestamp: new Date(Date.now() - 45 * 60 * 1000),
    type: "maintenance",
    title: "Проезд спецтехники",
    description: "На участке 1 зафиксирован проезд уборочной техники",
    segmentId: "seg-1",
    videoClipUrl: "/placeholder-video.mp4"
  },
  {
    id: "notif-3",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    type: "status_change",
    title: "Дорога очищена",
    description: "пр. Ленина (участок 1) - дорога очищена",
    segmentId: "seg-1",
    previousStatus: "dirty",
    newStatus: "clean",
    videoClipUrl: "/placeholder-video.mp4"
  },
  {
    id: "notif-4",
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
    type: "alert",
    title: "Внимание: сильное загрязнение",
    description: "На участке 2 зафиксировано сильное загрязнение дороги",
    segmentId: "seg-2",
    previousStatus: "warning",
    newStatus: "dirty",
    videoClipUrl: "/placeholder-video.mp4"
  },
  {
    id: "notif-5",
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
    type: "status_change",
    title: "Ухудшение состояния",
    description: "пр. Ленина (участок 2) - состояние ухудшилось",
    segmentId: "seg-2",
    previousStatus: "clean",
    newStatus: "warning",
    videoClipUrl: "/placeholder-video.mp4"
  },
  {
    id: "notif-6",
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
    type: "alert",
    title: "Обнаружена лужа",
    description: "На участке 1 обнаружена глубокая лужа",
    segmentId: "seg-1",
    videoClipUrl: "/placeholder-video.mp4"
  },
  {
    id: "notif-7",
    timestamp: new Date(Date.now() - 10 * 60 * 60 * 1000),
    type: "alert",
    title: "Обнаружена яма",
    description: "На участке 2 обнаружена яма",
    segmentId: "seg-2",
    videoClipUrl: "/placeholder-video.mp4"
  },
  {
    id: "notif-8",
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
    type: "alert",
    title: "Снежный вал",
    description: "Зафиксирован снежный вал на обочине",
    segmentId: "seg-1",
    videoClipUrl: "/placeholder-video.mp4"
  }
]

// Данные для графиков
export function generateChartData(days: number = 7) {
  const data = []
  const now = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    data.push({
      date: date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
      cleanHours: Math.floor(Math.random() * 12 + 8),
      dirtyHours: Math.floor(Math.random() * 8 + 2),
      warningHours: Math.floor(Math.random() * 4)
    })
  }

  return data
}

export function generateSegmentStats() {
  const demoSegments = [
    "пр. Ленина",
    "ул. 30 лет Победы",
    "ул. Энергетиков",
    "ул. Маяковского",
    "ул. Мелик-Карамова",
  ]
  return demoSegments.map(name => ({
    name,
    cleanPercentage: Math.floor(Math.random() * 40 + 50),
    avgCleanTime: Math.floor(Math.random() * 120 + 60),
    incidents: Math.floor(Math.random() * 10 + 1)
  }))
}
