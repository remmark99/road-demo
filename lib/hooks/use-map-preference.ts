"use client"

import { useCallback, useMemo, useSyncExternalStore, type Dispatch, type SetStateAction } from "react"

const CHANGE_EVENT = "road-demo-gis-preference"
const memory = new Map<string, string>()

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!
  try {
    return localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

// Accept only values matching the defaults; ignore damaged or old storage.
function matchesDefault(value: unknown, fallback: unknown): boolean {
  if (Array.isArray(fallback)) {
    return Array.isArray(value) && value.every(item => fallback.includes(item))
  }
  if (fallback !== null && typeof fallback === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.entries(fallback).every(([key, item]) =>
        matchesDefault((value as Record<string, unknown>)[key], item))
  }
  return typeof value === typeof fallback
}

function parse<T>(saved: string | null, fallback: T): T {
  try {
    const value: unknown = saved === null ? null : JSON.parse(saved)
    return matchesDefault(value, fallback) ? value as T : fallback
  } catch {
    return fallback
  }
}

export function useMapPreference<T>(name: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const key = `road-demo-gis-v1:${name}`
  // Stable defaults keep object/array preferences stable between renders.
  const defaultsJson = JSON.stringify(defaultValue)
  const fallback = useMemo(() => JSON.parse(defaultsJson) as T, [defaultsJson])
  const getSnapshot = useCallback(() => read(key), [key])
  const saved = useSyncExternalStore(subscribe, getSnapshot, () => null)
  const value = useMemo(() => parse(saved, fallback), [saved, fallback])
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(update => {
    const previous = parse(read(key), fallback)
    const next = typeof update === "function" ? (update as (value: T) => T)(previous) : update
    const serialized = JSON.stringify(next)
    try {
      localStorage.setItem(key, serialized)
      memory.delete(key)
    } catch {
      // Keep controls functional when storage is blocked or its quota is full.
      memory.set(key, serialized)
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [key, fallback])

  return [value, setValue]
}
