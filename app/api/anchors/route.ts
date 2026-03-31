import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { AnchorsGeoJSON, AnchorProperties } from "@/lib/api/anchors"

export const dynamic = "force-dynamic"
export const revalidate = 0

type AnchorRow = AnchorProperties & {
    lat: number | string | null
    lng: number | string | null
    detection_radius?: number | string | null
}

export async function GET() {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from("anchors")
        .select("*")
        .eq("status", "active")

    if (error) {
        console.error("Error fetching anchors:", error)
        return NextResponse.json(
            { type: "FeatureCollection", features: [] },
            { status: 500 }
        )
    }

    const geojson: AnchorsGeoJSON = {
        type: "FeatureCollection",
        features: ((data as AnchorRow[] | null) ?? [])
            .map((anchor) => {
                const lng = Number(anchor.lng)
                const lat = Number(anchor.lat)

                if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
                    return null
                }

                return {
                    type: "Feature" as const,
                    properties: {
                        ...anchor,
                        detection_radius: Number(anchor.detection_radius ?? 0),
                    },
                    geometry: {
                        type: "Point" as const,
                        coordinates: [lng, lat] as [number, number],
                    },
                }
            })
            .filter((feature): feature is AnchorsGeoJSON["features"][number] => feature !== null),
    }

    return NextResponse.json(geojson, {
        headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
            "Surrogate-Control": "no-store",
        },
    })
}
