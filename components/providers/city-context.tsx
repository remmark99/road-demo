"use client"

import React, { createContext, useContext, useState, useCallback } from "react"

export interface City {
    id: string
    name: string
    lat: number
    lng: number
    zoom: number
}

export const CITIES: City[] = [
    { id: "surgut", name: "Сургут", lat: 61.253954, lng: 73.396344, zoom: 15 },
    { id: "fedorovsky", name: "Фёдоровский", lat: 61.605785, lng: 73.724136, zoom: 14 },
    { id: "bely-yar", name: "Белый Яр", lat: 61.260563, lng: 73.251839, zoom: 14 },
]

const CITY_KEY = "road-demo-city"

interface CityContextType {
    city: City
    setCity: (city: City) => void
}

const CityContext = createContext<CityContextType>({
    city: CITIES[0],
    setCity: () => { },
})

export function CityProvider({ children }: { children: React.ReactNode }) {
    const [city, setCityState] = useState<City>(() => {
        if (typeof window === "undefined") return CITIES[0]
        try {
            const saved = localStorage.getItem(CITY_KEY)
            if (saved) {
                const found = CITIES.find(c => c.id === saved)
                if (found) return found
            }
        } catch { }
        return CITIES[0]
    })

    const setCity = useCallback((c: City) => {
        setCityState(c)
        try {
            localStorage.setItem(CITY_KEY, c.id)
        } catch { }
    }, [])

    return (
        <CityContext.Provider value={{ city, setCity }}>
            {children}
        </CityContext.Provider>
    )
}

export const useCity = () => useContext(CityContext)
