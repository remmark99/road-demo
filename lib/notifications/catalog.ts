import type { NotificationSource } from "@/lib/notifications/types"

export interface NotificationEventTypeOption {
  key: string
  source: NotificationSource
  module: string
  moduleLabel: string
  type: string
  label: string
}

const MODULE_LABELS: Record<string, string> = {
  roads: "Состояние дорог",
  shore: "Безопасный берег",
  stops: "Остановки",
  parks: "Безопасный парк",
  transport: "Контроль транспорта",
  asr: "Площадки ТКО",
}

function option(
  source: NotificationSource,
  module: string,
  type: string,
  label: string,
): NotificationEventTypeOption {
  return {
    key: `${source}:${module}:${type}`,
    source,
    module,
    moduleLabel: MODULE_LABELS[module] ?? module,
    type,
    label,
  }
}

export const NOTIFICATION_EVENT_TYPES: readonly NotificationEventTypeOption[] = [
  option("alerts", "roads", "snowplow", "Спецтехника"),
  option("alerts", "roads", "snow_slush", "Снежная каша"),
  option("alerts", "roads", "canny", "Заснеженность"),
  option("alerts", "roads", "snow_windrow", "Снежный вал"),
  option("alerts", "roads", "snow_pile", "Снежная гора"),
  option("alerts", "roads", "puddle", "Подтопление дороги"),
  option("alerts", "roads", "dirt", "Грязь на дороге"),
  option("alerts", "roads", "open_manhole", "Открытый люк"),
  option("alerts", "roads", "tilted_sign", "Покосившийся знак"),
  option("alerts", "roads", "dirty_sign", "Загрязнённый знак"),
  option("alerts", "roads", "broken_light", "Неработающее освещение"),
  option("alerts", "roads", "worn_marking", "Стёртая разметка"),
  option("alerts", "roads", "pothole", "Ямы"),
  option("alerts", "roads", "camera_obstruction", "Загрязнение камеры"),
  option("alerts", "shore", "line_cross", "Пересечение линии"),
  option("alerts", "shore", "person_detect", "Проход человека"),
  option("alerts", "shore", "vehicle_detect", "Проезд автомобиля"),
  option("alerts", "shore", "restricted_zone", "Запретная зона (вода/лёд)"),
  option("alerts", "shore", "unaccompanied_child", "Дети без сопровождения"),
  option("alerts", "shore", "water_fall", "Падение в воду"),
  option("alerts", "shore", "fire_detect", "Детекция огня"),
  option("alerts", "parks", "park_left_item", "Оставленный предмет"),
  option("alerts", "parks", "park_person_down", "Лежачий человек"),
  option("alerts", "parks", "park_fight", "Драка"),
  option("alerts", "parks", "park_fire", "Возгорание"),
  option("alerts", "parks", "park_trash_overflow", "Переполненная урна"),
  option("alerts", "parks", "park_camera_obstruction", "Камера перекрыта"),
  option("alerts", "parks", "park_light_off", "Неработающее освещение"),
  option("alerts", "parks", "park_vehicle_detect", "Проезд автомобиля"),
  option("alerts", "parks", "park_dirty_road", "Неубранная дорога"),
  option("alerts", "transport", "transport_route_deviation", "Отклонение от маршрута"),
  option("alerts", "transport", "transport_wait_overrun", "Превышение ожидания"),
  option("alerts", "transport", "transport_doors_not_opened", "Неоткрытые двери"),
  option("alerts", "stops", "smoking", "Курение"),
  option("alerts", "stops", "lying_person", "Лежачий человек"),
  option("alerts", "stops", "abandoned_object", "Оставленный предмет"),
  option("alerts", "stops", "dogs_without_people", "Бездомные собаки"),
  option("alerts", "stops", "bin_full", "Переполненная урна"),
  option("controller_alerts", "stops", "temperature", "Температура"),
  option("controller_alerts", "stops", "humidity", "Влажность"),
  option("controller_alerts", "stops", "digital input", "Напряжение"),
  option("controller_alerts", "stops", "glass_break", "Разбитие стекла"),
]

const EVENT_TYPE_BY_KEY = new Map(NOTIFICATION_EVENT_TYPES.map((item) => [item.key, item]))

export function getAvailableNotificationEventTypes(modules: readonly string[]) {
  const allowedModules = new Set(modules)
  return NOTIFICATION_EVENT_TYPES.filter((item) => allowedModules.has(item.module))
}

export function getNotificationEventTypeLabel(
  source: NotificationSource,
  module: string,
  type: string,
) {
  return EVENT_TYPE_BY_KEY.get(`${source}:${module}:${type}`)?.label ?? type
}
