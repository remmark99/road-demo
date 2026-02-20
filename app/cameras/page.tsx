"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { DataTable } from "@/components/cameras/data-table"
import { getColumns } from "@/components/cameras/columns"
import { fetchCameraRows, CameraRow } from "@/lib/api/cameras"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

export default function CamerasPage() {
    const [data, setData] = useState<CameraRow[]>([])
    const [loading, setLoading] = useState(true)

    const loadData = useCallback(async () => {
        try {
            const rows = await fetchCameraRows()
            setData(rows)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    const columns = useMemo(() => getColumns(loadData), [loadData])

    return (
        <main className="min-h-screen bg-background pb-10">
            <Navigation />
            <div className="pt-14 px-4 md:px-8 max-w-[90%] mx-auto">
                <div className="flex items-center justify-between mb-6 mt-6">
                    <div>
                        <h1 className="text-2xl font-semibold">Камеры</h1>
                        <p className="text-muted-foreground">Управление списком камер и их параметрами</p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Список камер</CardTitle>
                        <CardDescription>
                            Редактируйте параметры камер прямо в таблице. Изменения сохраняются автоматически при потере фокуса.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <DataTable columns={columns} data={data} searchKey="name" />
                        )}
                    </CardContent>
                </Card>
            </div>
        </main>
    )
}
