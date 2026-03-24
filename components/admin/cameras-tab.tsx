"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { DataTable } from "@/components/cameras/data-table"
import { getColumns } from "@/components/cameras/columns"
import { fetchCameraRows, CameraRow } from "@/lib/api/cameras"
import { useModuleAccess } from "@/components/providers/module-context"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

export function CamerasTab() {
    const { modules, loading: modulesLoading } = useModuleAccess()
    const [data, setData] = useState<CameraRow[]>([])
    const [loading, setLoading] = useState(true)

    const loadData = useCallback(async () => {
        if (modulesLoading) return
        try {
            setLoading(true)
            const rows = await fetchCameraRows(modules)
            setData(rows)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [modules, modulesLoading])

    useEffect(() => {
        if (!modulesLoading) {
            loadData()
        }
    }, [loadData, modulesLoading])

    const columns = useMemo(() => getColumns(loadData), [loadData])

    return (
        <div className="space-y-6">
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
    )
}
