"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { CameraRow, updateCamera } from "@/lib/api/cameras"
import { useState, useEffect } from "react"

// Helper for editable cell
const EditableCell = ({
    value: initialValue,
    row,
    column,
    table,
    type = "text",
    onSuccess
}: {
    value: any
    row: any
    column: any
    table: any
    type?: "text" | "number"
    onSuccess?: () => void
}) => {
    const [value, setValue] = useState(initialValue)

    // Sync validation or external changes
    useEffect(() => {
        setValue(initialValue)
    }, [initialValue])

    const onBlur = async () => {
        if (value === initialValue) return

        const cameraIndex = row.original.camera_index
        const id = column.id

        let parsedValue = value
        if (type === "number") {
            parsedValue = parseFloat(value)
            if (isNaN(parsedValue)) return // revert or error?
        }

        const success = await updateCamera(cameraIndex, { [id]: parsedValue })
        if (success) {
            // notify?
            // console.log("Updated", id, parsedValue)
            if (onSuccess) onSuccess()
        } else {
            setValue(initialValue) // Revert on error
        }
    }

    return (
        <Input
            value={value || ""}
            onChange={e => setValue(e.target.value)}
            onBlur={onBlur}
            type={type}
            className="h-8 w-full bg-transparent border-transparent hover:border-input focus:border-input px-2"
        />
    )
}

const SelectCell = ({
    value: initialValue,
    row,
    column,
    onSuccess,
    options
}: {
    value: any
    row: any
    column: any
    onSuccess?: () => void
    options: { label: string; value: string }[]
}) => {
    const onValueChange = async (newValue: string) => {
        if (newValue === initialValue) return

        const cameraIndex = row.original.camera_index
        const id = column.id

        const success = await updateCamera(cameraIndex, { [id]: newValue })
        if (success) {
            if (onSuccess) onSuccess()
        }
    }

    return (
        <Select defaultValue={initialValue} onValueChange={onValueChange}>
            <SelectTrigger className="h-8 w-full border-transparent hover:border-input focus:border-input">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {options.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}


export const getColumns = (onDataChanged?: () => void): ColumnDef<CameraRow>[] => [
    {
        accessorKey: "camera_index",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    ID
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            )
        },
        cell: ({ row }) => <div className="pl-4 font-medium">{row.getValue("camera_index")}</div>,
    },
    {
        accessorKey: "name",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Название
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            )
        },
        cell: ({ row, column, table }) => <EditableCell value={row.getValue("name")} row={row} column={column} table={table} onSuccess={onDataChanged} />,
    },
    {
        accessorKey: "description",
        header: "Описание",
        cell: ({ row, column, table }) => <EditableCell value={row.getValue("description")} row={row} column={column} table={table} onSuccess={onDataChanged} />,
    },
    {
        accessorKey: "status",
        header: "Статус",
        cell: ({ row, column, table }) => (
            <SelectCell
                value={row.getValue("status")}
                row={row}
                column={column}
                onSuccess={onDataChanged}
                options={[
                    { label: "Online", value: "online" },
                    { label: "Offline", value: "offline" }
                ]}
            />
        ),
    },
    {
        accessorKey: "lat",
        header: "Широта",
        cell: ({ row, column, table }) => <EditableCell value={row.getValue("lat")} row={row} column={column} table={table} type="number" onSuccess={onDataChanged} />,
    },
    {
        accessorKey: "lng",
        header: "Долгота",
        cell: ({ row, column, table }) => <EditableCell value={row.getValue("lng")} row={row} column={column} table={table} type="number" onSuccess={onDataChanged} />,
    },
    {
        accessorKey: "fov_angle",
        header: "Угол (FOV)",
        cell: ({ row, column, table }) => <EditableCell value={row.getValue("fov_angle")} row={row} column={column} table={table} type="number" onSuccess={onDataChanged} />,
    },
    {
        accessorKey: "fov_direction",
        header: "Направление",
        cell: ({ row, column, table }) => <EditableCell value={row.getValue("fov_direction")} row={row} column={column} table={table} type="number" onSuccess={onDataChanged} />,
    },
    {
        accessorKey: "fov_distance",
        header: "Дальность",
        cell: ({ row, column, table }) => <EditableCell value={row.getValue("fov_distance")} row={row} column={column} table={table} type="number" onSuccess={onDataChanged} />,
    },
    {
        accessorKey: "rtsp_url",
        header: "RTSP",
        cell: ({ row, column, table }) => <EditableCell value={row.getValue("rtsp_url")} row={row} column={column} table={table} onSuccess={onDataChanged} />,
    },
    {
        accessorKey: "hls_url",
        header: "HLS",
        cell: ({ row, column, table }) => <EditableCell value={row.getValue("hls_url")} row={row} column={column} table={table} onSuccess={onDataChanged} />,
    },
    {
        id: "actions",
        cell: ({ row }) => {
            const camera = row.original

            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Открыть меню</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Действия</DropdownMenuLabel>
                        <DropdownMenuItem
                            onClick={() => navigator.clipboard.writeText(camera.rtsp_url || "")}
                        >
                            Копировать RTSP URL
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>Посмотреть детали</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
    },
]
