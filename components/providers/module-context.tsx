"use client"

import React, { createContext, useContext, useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

const ACTIVE_MODULES_KEY = "road-demo-active-modules"

/** Postgres: column does not exist — the profile contact migration is not applied yet. */
const UNDEFINED_COLUMN = "42703"

interface ProfileRow {
    role: string | null
    modules: string[] | null
    full_name?: string | null
    phone?: string | null
}

interface ModuleContextType {
    /** All modules assigned by admin (from DB) */
    allModules: string[]
    /** Currently active/visible modules (user preference, subset of allModules) */
    modules: string[]
    role: string
    /** Optional ФИО from the profile, null when the user has not set it */
    fullName: string | null
    /** Optional contact phone from the profile */
    phone: string | null
    loading: boolean
    /** Re-reads the profile after the user edits it in settings */
    refreshProfile: () => Promise<void>
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
    fullName: null,
    phone: null,
    loading: true,
    refreshProfile: async () => { },
    hasModule: () => false,
    toggleModule: () => { },
    setActiveModules: () => { },
})

export function ModuleProvider({ children }: { children: React.ReactNode }) {
    const [allModules, setAllModules] = useState<string[]>([])
    const [activeModules, setActiveModulesState] = useState<string[] | null>(null)
    const [role, setRole] = useState('user')
    const [fullName, setFullName] = useState<string | null>(null)
    const [phone, setPhone] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let mounted = true

        const fetchProfile = async () => {
            try {
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()

                if (user && mounted) {
                    let { data, error } = await supabase
                        .from('profiles')
                        .select('role, modules, full_name, phone')
                        .eq('id', user.id)
                        .single<ProfileRow>()

                    // Contact columns are optional: fall back to the base
                    // columns so module access keeps working before the
                    // profile_contact_fields migration is applied.
                    if (error?.code === UNDEFINED_COLUMN) {
                        ({ data, error } = await supabase
                            .from('profiles')
                            .select('role, modules')
                            .eq('id', user.id)
                            .single<ProfileRow>())
                    }

                    if (data && !error && mounted) {
                        let dbModules: string[] = data.modules || []

                        // Fetch system signed license from /api/license
                        try {
                            const licRes = await fetch('/api/license')
                            if (licRes.ok) {
                                const licData = await licRes.json()
                                if (licData.valid && Array.isArray(licData.modules)) {
                                    dbModules = dbModules.filter(m => licData.modules.includes(m))
                                }
                            }
                        } catch (licErr) {
                            console.error("Failed to check license API:", licErr)
                        }

                        setAllModules(dbModules)
                        setRole(data.role || 'user')
                        setFullName(data.full_name || null)
                        setPhone(data.phone || null)

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

    const refreshProfile = useCallback(async () => {
        try {
            const response = await fetch('/api/settings/profile', { cache: 'no-store' })
            if (!response.ok) return
            const data = await response.json() as { fullName?: string | null; phone?: string | null }
            setFullName(data.fullName || null)
            setPhone(data.phone || null)
        } catch (err) {
            console.error("Failed to refresh profile:", err)
        }
    }, [])

    return (
        <ModuleContext.Provider value={{
            allModules,
            modules,
            role,
            fullName,
            phone,
            loading,
            refreshProfile,
            hasModule,
            toggleModule,
            setActiveModules,
        }}>
            {children}
        </ModuleContext.Provider>
    )
}

export const useModuleAccess = () => useContext(ModuleContext)
