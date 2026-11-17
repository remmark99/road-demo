import { NextResponse } from "next/server"
import { parseSokolTemperature } from "@/lib/sokol-temperature"

export async function GET() {
    try {
        const response = await fetch("https://api-meteor.admsurgut.ru/api/v2/indicators", {
            next: { revalidate: 300 },
            signal: AbortSignal.timeout(5000),
        })
        if (!response.ok) throw new Error("Meteorology unavailable")
        const reading = parseSokolTemperature(await response.json())
        if (!reading) throw new Error("Invalid Sokol reading")
        return NextResponse.json(reading)
    } catch {
        return NextResponse.json({ error: "Температура Сокола недоступна" }, { status: 503 })
    }
}
