import type { User } from "@supabase/supabase-js"

/**
 * Учётка подрядчика по датчикам остановок (Телеплюс): видит только карту
 * с остановками, где стоят контроллеры, и их текущий статус. Флаг лежит в
 * auth app_metadata — пользователь не может изменить его сам, а middleware
 * читает его без лишнего запроса к profiles.
 */
export const STOP_SENSORS_SCOPE = "stop_sensors"

/** API, нужные карте в режиме «только датчики»; остальное middleware закрывает. */
export const STOP_SENSORS_API_PREFIXES = [
    "/api/license",
    "/api/bus-stops",
    "/api/stop-activity",
    "/api/stop-sensor-history",
]

export function isStopSensorsOnly(user: Pick<User, "app_metadata"> | null | undefined): boolean {
    return user?.app_metadata?.access_scope === STOP_SENSORS_SCOPE
}
