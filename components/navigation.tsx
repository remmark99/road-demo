"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ThemeToggle } from "@/components/theme-toggle"
import { Map, Bell, BarChart3, Camera, Settings, Bot, ExternalLink, Thermometer, LogOut, User } from "lucide-react"
import { SensorPopover } from "@/components/sensors/sensor-readings"
import { createClient } from "@/lib/supabase/client"
import type { User as SupabaseUser } from "@supabase/supabase-js"

const navItems = [
  { href: "/", label: "Карта", icon: Map },
  { href: "/notifications", label: "Уведомления", icon: Bell },
  { href: "/dashboard", label: "Аналитика", icon: BarChart3 },
  { href: "/cameras", label: "Камеры", icon: Camera },
  { href: "/ai-assistant", label: "AI-ассистент", icon: Bot },
]

export function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<SupabaseUser | null>(null)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 gap-6">
        <Link href="/" className="flex items-center gap-2">
          <Camera className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg">СургутДороги</span>
        </Link>

        <Separator orientation="vertical" className="h-6" />

        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Button
                key={item.href}
                variant={isActive ? "default" : "ghost"}
                size="sm"
                asChild
              >
                <Link href={item.href} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </Button>
            )
          })}

          <Separator orientation="vertical" className="h-6 mx-2" />

          <Button
            variant="ghost"
            size="sm"
            className="text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/30"
            asChild
          >
            <a
              href="https://meteor.admsurgut.ru/ru/meteogram"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <Thermometer className="h-4 w-4" />
              <span>Метеомониторинг</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          </Button>

          <SensorPopover />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <Badge variant="outline" className="gap-1.5">
            <span className="h-2 w-2 rounded-full bg-road-clean animate-pulse" />
            Система активна
          </Badge>
          <Badge variant="secondary">Сургут</Badge>

          {user && (
            <>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span className="max-w-[150px] truncate">{user.email}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                title="Выйти"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}

          <Separator orientation="vertical" className="h-6" />
          <Button
            variant={pathname === "/settings" ? "default" : "ghost"}
            size="icon"
            asChild
          >
            <Link href="/settings">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}

