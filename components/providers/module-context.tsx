"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

interface ModuleContextType {
    modules: string[]
    role: string
    loading: boolean
    hasModule: (module: string) => boolean
}

const ModuleContext = createContext<ModuleContextType>({
    modules: [],
    role: 'user',
    loading: true,
    hasModule: () => false,
})

export function ModuleProvider({ children }: { children: React.ReactNode }) {
    const [modules, setModules] = useState<string[]>([])
    const [role, setRole] = useState('user')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let mounted = true

        const fetchProfile = async () => {
            try {
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()

                if (user && mounted) {
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('role, modules')
                        .eq('id', user.id)
                        .single()

                    if (data && !error && mounted) {
                        setModules(data.modules || [])
                        setRole(data.role || 'user')
                    }
                }
            } catch (err) {
                console.error("Failed to fetch user modules:", err)
            } finally {
                if (mounted) setLoading(false)
            }
        }

        fetchProfile()

        return () => {
            mounted = false
        }
    }, [])

    const hasModule = (module: string) => modules.includes(module)

    return (
        <ModuleContext.Provider value={{ modules, role, loading, hasModule }}>
            {children}
        </ModuleContext.Provider>
    )
}

export const useModuleAccess = () => useContext(ModuleContext)
