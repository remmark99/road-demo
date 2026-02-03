import type { Camera, RoadSegment, Notification, RoadStatusHistory, RoadStatus } from "./types"
import geojson from "../map.json";
import roadsGeoJson from "../roads.json";

// Камеры на перекрестках в Сургуте (район пр. Ленина и ул. 30 лет Победы)
// export const cameras: Camera[] = [
//   {
//     id: "cam-1",
//     name: "Камера #1",
//     location: "пр. Ленина / ул. 30 лет Победы",
//     lat: 61.2540,
//     lng: 73.4016,
//     rtspUrl: "rtsp://placeholder:554/stream1",
//     status: "online"
//   },
//   {
//     id: "cam-2",
//     name: "Камера #2",
//     location: "пр. Ленина / ул. Энергетиков",
//     lat: 61.2535,
//     lng: 73.4080,
//     rtspUrl: "rtsp://placeholder:554/stream2",
//     status: "online"
//   },
//   {
//     id: "cam-3",
//     name: "Камера #3",
//     location: "пр. Ленина / ул. Маяковского",
//     lat: 61.2530,
//     lng: 73.4140,
//     rtspUrl: "rtsp://placeholder:554/stream3",
//     status: "offline"
//   }
// ]

// Камеры теперь хранятся в Supabase - см. lib/api/cameras.ts
// Старый код закомментирован выше для справки


// Сегменты дорог между камерами
// export const roadSegments: RoadSegment[] = [
//   {
//     id: "seg-1",
//     name: "пр. Ленина (участок 1)",
//     startCameraId: "cam-1",
//     endCameraId: "cam-2",
//     coordinates: [
//       [73.4016, 61.2540],
//       [73.4048, 61.2538],
//       [73.4080, 61.2535]
//     ],
//     currentStatus: "clean"
//   },
//   {
//     id: "seg-2",
//     name: "пр. Ленина (участок 2)",
//     startCameraId: "cam-2",
//     endCameraId: "cam-3",
//     coordinates: [
//       [73.4080, 61.2535],
//       [73.4110, 61.2533],
//       [73.4140, 61.2530]
//     ],
//     currentStatus: "dirty"
//   }
// ]

// Existing manual segment
const manualSegments: RoadSegment[] = [
  {
    id: "seg-1",
    name: "Дорога 1",
    startCameraId: "cam-1",
    endCameraId: "cam-2",
    coordinates: [
      [
        73.43424325940407,
        61.25476187231312
      ],
      [
        73.43360221144954,
        61.25505772233131
      ],
      [
        73.43287801501546,
        61.25536648857581
      ],
      [
        73.43165760991367,
        61.25572821921895
      ],
      [
        73.43166029212261,
        61.25572951105257
      ],
      [
        73.43000268695138,
        61.25597755249516
      ],
      [
        73.42516398188852,
        61.25652530373478
      ],
      [
        73.42083489653842,
        61.25703429040521
      ],
      [
        73.41761088130252,
        61.25739341815342
      ]
    ],
    currentStatus: "clean"
  }
]

// Generate segments from roads.json GeoJSON
const statuses: RoadStatus[] = ["clean", "dirty", "warning", "clean"]
const geoJsonSegments: RoadSegment[] = roadsGeoJson.features
  .filter(feature => feature.geometry.type === "LineString")
  .map((feature, index) => ({
    id: `road-${feature.id ?? index}`,
    name: `Участок ${(feature.id as number ?? index) + 1}`,
    startCameraId: null,
    endCameraId: null,
    coordinates: feature.geometry.coordinates as [number, number][],
    currentStatus: statuses[index % statuses.length]
  }))

// Combine all road segments
export const roadSegments: RoadSegment[] = [...manualSegments, ...geoJsonSegments]

// Генерация истории статусов для таймлайна
export function generateStatusHistory(hours: number = 24): RoadStatusHistory[] {
  const history: RoadStatusHistory[] = []
  const statuses: RoadStatus[] = ["clean", "dirty", "warning", "clean", "dirty"]
  const now = new Date()

  for (const segment of roadSegments) {
    for (let i = 0; i < hours * 2; i++) {
      const timestamp = new Date(now.getTime() - i * 30 * 60 * 1000)
      const statusIndex = Math.floor(Math.random() * statuses.length)
      history.push({
        timestamp,
        status: statuses[statusIndex],
        segmentId: segment.id
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
  return roadSegments.map(segment => ({
    name: segment.name,
    cleanPercentage: Math.floor(Math.random() * 40 + 50),
    avgCleanTime: Math.floor(Math.random() * 120 + 60),
    incidents: Math.floor(Math.random() * 10 + 1)
  }))
}
