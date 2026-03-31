"use client"

import React, { createContext, useContext, useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

const ACTIVE_MODULES_KEY = "road-demo-active-modules"

interface ModuleContextType {
    /** All modules assigned by admin (from DB) */
    allModules: string[]
    /** Currently active/visible modules (user preference, subset of allModules) */
    modules: string[]
    role: string
    loading: boolean
    /** Checks if a module is currently active for display */
    hasModule: (module: string) => boolean
    /** Toggle a module on/off for display */
    toggleModule: (module: string) => void
    /** Set all active modules at once */
    setActiveModules: (modules: string[]) => void
}

const ModuleContext = createContext<ModuleContextType>({
    allModules: [],
    modules: [],
    role: 'user',
    loading: true,
    hasModule: () => false,
    toggleModule: () => { },
    setActiveModules: () => { },
})

export function ModuleProvider({ children }: { children: React.ReactNode }) {
    const [allModules, setAllModules] = useState<string[]>([])
    const [activeModules, setActiveModulesState] = useState<string[] | null>(null)
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
                        const dbModules: string[] = data.modules || []
                        setAllModules(dbModules)
                        setRole(data.role || 'user')

                        // Load saved active modules from localStorage
                        try {
                            const saved = localStorage.getItem(ACTIVE_MODULES_KEY)
                            if (saved) {
                                const parsed = JSON.parse(saved)
                                if (Array.isArray(parsed)) {
                                    const valid = parsed.filter(
                                        (module): module is string =>
                                            typeof module === "string" && dbModules.includes(module)
                                    )

                                    setActiveModulesState(
                                        parsed.length === 0
                                            ? []
                                            : valid.length > 0
                                                ? valid
                                                : dbModules
                                    )
                                } else {
                                    setActiveModulesState(dbModules)
                                }
                            } else {
                                // First time: all modules active
                                setActiveModulesState(dbModules)
                            }
                        } catch {
                            setActiveModulesState(dbModules)
                        }
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

    const modules = activeModules ?? allModules

    const hasModule = useCallback(
        (module: string) => modules.includes(module),
        [modules]
    )

    const toggleModule = useCallback((module: string) => {
        setActiveModulesState(prev => {
            const current = prev ?? allModules
            let next: string[]
            if (current.includes(module)) {
                next = current.filter(m => m !== module)
            } else {
                // Only allow toggling on modules the user has access to
                if (!allModules.includes(module)) return current
                next = [...current, module]
            }
            localStorage.setItem(ACTIVE_MODULES_KEY, JSON.stringify(next))
            return next
        })
    }, [allModules])

    const setActiveModules = useCallback((mods: string[]) => {
        const next = mods.filter(m => allModules.includes(m))
        setActiveModulesState(next)
        localStorage.setItem(ACTIVE_MODULES_KEY, JSON.stringify(next))
    }, [allModules])

    return (
        <ModuleContext.Provider value={{
            allModules,
            modules,
            role,
            loading,
            hasModule,
            toggleModule,
            setActiveModules,
        }}>
            {children}
        </ModuleContext.Provider>
    )
}

export const useModuleAccess = () => useContext(ModuleContext)
