"use client"

import { useState, useEffect } from "react"
import { Navigation } from "@/components/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MessageCircle, Send, Mail, Settings, Check, Loader2 } from "lucide-react"

const STORAGE_KEY = "road-demo-user-settings"

interface UserSettings {
  email: string
}

const indicators = [
  "Общая чистота дорог",
  "Динамика состояния",
  "Текущее количество загрязнённых участков",
  "Среднее время простоя в плохих статусах",
  "Самые заснеженные микрорайоны",
  "Средняя загрязненность районов от дней недели",
]

export default function SettingsPage() {
  const [email, setEmail] = useState("")
  const [savedEmail, setSavedEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [error, setError] = useState("")

  // Load settings from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const settings: UserSettings = JSON.parse(stored)
        setEmail(settings.email)
        setSavedEmail(settings.email)
      } catch (e) {
        console.error("Failed to parse settings:", e)
      }
    }
  }, [])

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(email)
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!email.trim()) {
      setError("Введите email")
      return
    }

    if (!validateEmail(email)) {
      setError("Неверный формат email")
      return
    }

    setIsLoading(true)

    try {
      // Save to localStorage
      const settings: UserSettings = { email: email.trim() }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))

      // Send welcome email if this is a new email
      if (email.trim() !== savedEmail) {
        const response = await fetch("/api/settings/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Ошибка при отправке письма")
        }
      }

      setSavedEmail(email.trim())
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка")
    } finally {
      setIsLoading(false)
    }
  }

  const hasChanges = email.trim() !== savedEmail

  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <div className="pt-14">
        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Settings className="h-6 w-6 text-primary" />
              Настройки
            </h1>
            <p className="text-muted-foreground mt-1">
              Управление уведомлениями и персональными настройками
            </p>
          </div>

          {/* Email Settings Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5" />
                Email для уведомлений
              </CardTitle>
              <CardDescription>
                На этот адрес будут приходить уведомления о событиях на дорогах.
                После сохранения мы отправим вам приветственное письмо.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email адрес</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setError("")
                    }}
                    aria-invalid={!!error}
                    className="max-w-md"
                  />
                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    disabled={isLoading || !hasChanges}
                    className="gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Сохранение...
                      </>
                    ) : isSaved ? (
                      <>
                        <Check className="h-4 w-4" />
                        Сохранено!
                      </>
                    ) : (
                      "Сохранить"
                    )}
                  </Button>

                  {savedEmail && (
                    <span className="text-sm text-muted-foreground">
                      Текущий email: {savedEmail}
                    </span>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Report Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-bold">Настройки сводного отчёта</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <div>
                <h3 className="text-lg font-semibold mb-3">Периодичность</h3>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" className="bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200">Раз в день</Button>
                  <Button variant="outline">Раз в неделю</Button>
                  <Button variant="outline">Раз в месяц</Button>
                  <Button variant="outline">Раз в год</Button>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Куда отправить</h3>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon">
                    <MessageCircle className="h-5 w-5" />
                  </Button>
                  <Button variant="outline" size="icon">
                    <Send className="h-5 w-5" />
                  </Button>
                  <Button variant="secondary" size="icon" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                    <Mail className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <div>
                <Select>
                  <SelectTrigger className="w-[280px]">
                    <SelectValue placeholder="Выбрать дату отправки отчёта" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monday">По понедельникам</SelectItem>
                    <SelectItem value="tuesday">По вторникам</SelectItem>
                    <SelectItem value="wednesday">По средам</SelectItem>
                    <SelectItem value="thursday">По четвергам</SelectItem>
                    <SelectItem value="friday">По пятницам</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-8">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-xl font-bold">Настройки информационной панели</h2>
                    <p className="text-muted-foreground">Какие показатели включить в отчёт</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="include-all" />
                    <label
                      htmlFor="include-all"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Включить все
                    </label>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {indicators.map((indicator) => (
                    <Button key={indicator} variant="secondary" className="bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200">
                      {indicator}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}

