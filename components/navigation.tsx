"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ThemeToggle } from "@/components/theme-toggle"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet"
import {
  Map,
  Bell,
  BarChart3,
  Camera,
  Settings,
  Bot,
  ExternalLink,
  Thermometer,
  LogOut,
  User,
  Menu,
  Shield,
  LayoutGrid,
  Eye,
  EyeOff,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { useModuleAccess } from "@/components/providers/module-context"

const navItems = [
  { href: "/", label: "Карта", icon: Map },
  { href: "/notifications", label: "Уведомления", icon: Bell },
  { href: "/dashboard", label: "Аналитика", icon: BarChart3 },
  { href: "/ai-assistant", label: "ИИ-Ассистент", icon: Bot },
]

const MODULE_LABELS: Record<string, string> = {
  roads: 'Состояние дорог',
  shore: 'Безопасный берег',
  stops: 'Остановки',
  parks: 'Безопасный парк',
  transport: 'Контроль транспорта',
}

export function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { role, allModules, modules: activeModules, toggleModule } = useModuleAccess()

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
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
      <div className="flex h-14 items-center px-4 justify-between lg:justify-start lg:gap-6">

        {/* === LEFT SIDE === */}
        <div className="flex items-center gap-2 lg:gap-6">
          {/* Mobile Burger Menu (<1024px) */}
          <div className="lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Открыть меню">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 flex flex-col">
                <SheetHeader className="px-4 pt-4 pb-2 border-b">
                  <SheetTitle className="flex items-center gap-2 text-primary">
                    <Camera className="h-5 w-5" />
                    Вектор Города
                  </SheetTitle>
                </SheetHeader>

                <div className="flex flex-col py-2 px-2 gap-1 overflow-y-auto">
                  {/* Nav Links */}
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Разделы
                  </div>
                  {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.href
                    return (
                      <SheetClose key={item.href} asChild>
                        <Button
                          variant={isActive ? "secondary" : "ghost"}
                          className="justify-start gap-3 h-10 w-full"
                          asChild
                        >
                          <Link href={item.href}>
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </Link>
                        </Button>
                      </SheetClose>
                    )
                  })}

                  <Separator className="my-2" />

                  {/* Tools */}
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Инструменты
                  </div>
                  <Button
                    variant="ghost"
                    className="justify-start gap-3 h-10 w-full text-sky-600 dark:text-sky-400"
                    asChild
                  >
                    <a
                      href="https://meteor.admsurgut.ru/ru/meteogram"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Thermometer className="h-4 w-4" />
                      Метеомониторинг
                      <ExternalLink className="h-3 w-3 opacity-60 ml-auto" />
                    </a>
                  </Button>
                  <SheetClose asChild>
                    <Button
                      variant={pathname === "/settings" ? "secondary" : "ghost"}
                      className="justify-start gap-3 h-10 w-full"
                      asChild
                    >
                      <Link href="/settings">
                        <Settings className="h-4 w-4" />
                        Настройки
                      </Link>
                    </Button>
                  </SheetClose>
                  {role === 'admin' && (
                    <SheetClose asChild>
                      <Button
                        variant={pathname === "/admin" ? "secondary" : "ghost"}
                        className="justify-start gap-3 h-10 w-full text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30"
                        asChild
                      >
                        <Link href="/admin">
                          <Shield className="h-4 w-4" />
                          Админ-панель
                        </Link>
                      </Button>
                    </SheetClose>
                  )}
                </div>

                <div className="mt-auto">
                  {/* Status */}
                  <div className="border-t border-border px-4 py-3 flex items-center gap-2 bg-muted/30">
                    <Badge variant="outline" className="gap-1.5 bg-background">
                      <span className="h-2 w-2 rounded-full bg-road-clean animate-pulse" />
                      Система активна
                    </Badge>
                    <Badge variant="secondary">Сургут</Badge>
                  </div>

                  {/* User Profile */}
                  {authLoading ? (
                    <div className="border-t border-border px-4 py-3 bg-muted/10">
                      <Skeleton className="h-5 w-[200px] mb-3" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : user && (
                    <div className="border-t border-border px-4 py-3 bg-muted/10">
                      <div className="flex items-center gap-2 text-sm text-foreground mb-3 font-medium">
                        <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{user.email}</span>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full gap-2"
                        onClick={handleSignOut}
                      >
                        <LogOut className="h-4 w-4" />
                        Выход
                      </Button>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Camera className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg hover:opacity-80 transition-opacity">
              Вектор Города
            </span>
          </Link>

          <Separator orientation="vertical" className="h-6 hidden lg:block" />

          {/* Desktop Nav Links (≥1024px) */}
          <div className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Button
                  key={item.href}
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  className={isActive ? "bg-primary/10 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:text-primary dark:hover:bg-primary/30" : ""}
                  asChild
                >
                  <Link href={item.href} className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </Button>
              )
            })}
          </div>
        </div>

        {/* === RIGHT SIDE === */}
        <div className="flex items-center gap-2 xl:gap-3 lg:ml-auto">

          {/* Theme toggle (visible on all screens) */}
          <ThemeToggle />

          {/* Module visibility toggle */}
          {allModules.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  title="Модули"
                >
                  <LayoutGrid className="h-4 w-4" />
                  {activeModules.length < allModules.length && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 border-2 border-background" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-3">
                <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4 text-primary" />
                  Отображение модулей
                </div>
                <div className="space-y-2">
                  {allModules.map((moduleId) => {
                    const isActive = activeModules.includes(moduleId)
                    return (
                      <div
                        key={moduleId}
                        className={`group flex items-center justify-between py-1.5 px-2 rounded-md transition-colors ${
                          "hover:bg-accent/60"
                        } ${isActive ? "" : "opacity-50"}`}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          {isActive ? (
                            <Eye className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {MODULE_LABELS[moduleId] || moduleId}
                        </div>
                        <Switch
                          checked={isActive}
                          onCheckedChange={() => toggleModule(moduleId)}
                          className={cn(
                            "scale-90 transition-all",
                            "group-hover:ring-4 group-hover:ring-primary/10 group-hover:shadow-sm"
                          )}
                        />
                      </div>
                    )
                  })}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Можно скрыть все модули и вернуть их позже в этом же меню.
                </p>
              </PopoverContent>
            </Popover>
          )}

          {/* Desktop Right Side (≥1024px) */}
          <div className="hidden lg:flex items-center gap-2 xl:gap-3">
            <Separator orientation="vertical" className="h-6" />

            {/* Meteomonitoring Link */}
            <Button
              variant="ghost"
              size="sm"
              className="text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/30 hidden 2xl:flex"
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
            {/* Show only icon on lg and xl to save space */}
            <Button
              variant="ghost"
              size="icon"
              className="text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/30 lg:flex 2xl:hidden"
              asChild
              title="Метеомониторинг"
            >
              <a
                href="https://meteor.admsurgut.ru/ru/meteogram"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Thermometer className="h-4 w-4" />
              </a>
            </Button>

            {/* Status (Pulse dot on lg/xl, full badge on 2xl) */}
            <div className="flex items-center gap-2">
              <span className="flex 2xl:hidden h-2.5 w-2.5 rounded-full bg-road-clean animate-pulse" title="Система активна" />
              <Badge variant="outline" className="gap-1.5 hidden 2xl:flex text-xs">
                <span className="h-2 w-2 rounded-full bg-road-clean animate-pulse" />
                Система активна
              </Badge>
              <Badge variant="secondary" className="hidden 2xl:flex text-xs">Сургут</Badge>
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* User Dropdown Profile (≥1024px) */}
            {authLoading ? (
              <Skeleton className="h-9 w-24 rounded-md hidden lg:block" />
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 px-2 hover:bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium hidden xl:inline-block max-w-[120px] truncate">
                      {user.email?.split("@")[0]}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">Профиль</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="cursor-pointer gap-2">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <span>Настройки</span>
                    </Link>
                  </DropdownMenuItem>
                  {role === 'admin' && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="cursor-pointer gap-2 text-teal-600 dark:text-teal-400 focus:text-teal-700 dark:focus:text-teal-300">
                        <Shield className="h-4 w-4" />
                        <span>Админ-панель</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                    onClick={handleSignOut}
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Выйти</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Войти</Link>
              </Button>
            )}
          </div>
        </div>

      </div>
    </nav>
  )
}
