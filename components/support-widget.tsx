"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Headset, Phone, Mail, Copy, Check, Loader2, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { SUPPORT_TOPICS, type SupportTopic } from "@/lib/support/topics"

const SUPPORT_PHONE = "+79117907955"
const SUPPORT_PHONE_LABEL = "+7 911 790-79-55"
const SUPPORT_EMAIL = "krammerti@yandex.ru"
const MAIL_SUBJECT = "Обращение в поддержку — Вектор Города"

type ContactRowProps = {
  icon: React.ElementType
  label: string
  value: string
  href: string
  copyValue: string
}

function ContactRow({ icon: Icon, label, value, href, copyValue }: ContactRowProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyValue)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Не удалось скопировать")
    }
  }

  return (
    <div className="group/row flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60">
      <a href={href} className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span className="block truncate text-sm font-medium">{value}</span>
        </span>
      </a>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
        onClick={handleCopy}
        aria-label={`Скопировать: ${value}`}
        title="Скопировать"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  )
}

function SupportRequestForm({ onSent }: { onSent: () => void }) {
  const [topic, setTopic] = useState<SupportTopic | "">("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)

  const canSubmit = topic !== "" && message.trim().length > 0 && !sending

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSending(true)
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, message: message.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || "Не удалось отправить обращение")
      }
      toast.success("Обращение отправлено")
      setTopic("")
      setMessage("")
      onSent()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить обращение")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-2.5">
      <Select value={topic} onValueChange={(value) => setTopic(value as SupportTopic)}>
        <SelectTrigger className="w-full" size="sm">
          <SelectValue placeholder="Тема обращения" />
        </SelectTrigger>
        <SelectContent>
          {SUPPORT_TOPICS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Опишите обращение подробнее..."
        className="min-h-24 resize-none text-sm"
        maxLength={4000}
      />

      <Button
        size="sm"
        className="w-full"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        {sending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        Отправить
      </Button>
    </div>
  )
}

export function SupportWidget() {
  const [open, setOpen] = useState(false)

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label="Связаться с поддержкой"
            className={cn(
              "group h-11 rounded-full px-3 shadow-lg backdrop-blur",
              "bg-background/80 text-muted-foreground hover:bg-background hover:text-primary",
              "hover:border-primary/40",
              open && "bg-background text-primary border-primary/40"
            )}
          >
            <Headset className="h-4 w-4 shrink-0" />
            <span
              className={cn(
                "max-w-0 overflow-hidden whitespace-nowrap text-sm opacity-0",
                "transition-all duration-200 group-hover:ml-0.5 group-hover:max-w-[7rem] group-hover:opacity-100",
                open && "ml-0.5 max-w-[7rem] opacity-100"
              )}
            >
              Поддержка
            </span>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          side="top"
          sideOffset={10}
          className="w-[calc(100vw-2rem)] max-w-96 p-3"
        >
          <div className="flex items-start gap-3 px-1">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Headset className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Техническая поддержка</div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Вопросы по платформе, доступам и модулям — свяжитесь удобным способом.
              </p>
            </div>
          </div>

          <Separator className="my-3" />

          <div className="space-y-1">
            <ContactRow
              icon={Phone}
              label="Телефон"
              value={SUPPORT_PHONE_LABEL}
              href={`tel:${SUPPORT_PHONE}`}
              copyValue={SUPPORT_PHONE_LABEL}
            />
            <ContactRow
              icon={Mail}
              label="Email"
              value={SUPPORT_EMAIL}
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(MAIL_SUBJECT)}`}
              copyValue={SUPPORT_EMAIL}
            />
          </div>

          <Separator className="my-3" />

          <div className="px-1 pb-1">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Написать нам
            </div>
            <SupportRequestForm onSent={() => setOpen(false)} />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
