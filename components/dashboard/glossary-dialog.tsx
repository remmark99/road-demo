"use client"

import { useState } from "react"
import { Book, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useModuleAccess } from "@/components/providers/module-context"
import {
  RATING_ATTENTION,
  RATING_CURVE_DIVISOR,
  RATING_MAX,
  RATING_TARGET,
  formatRating,
  getRating,
} from "@/lib/analytics/rating"

interface GlossaryItem {
  title: string
  content: React.ReactNode
  modules?: string[]
}

function RatingCurveGraphic() {
  const width = 360
  const height = 180
  const padding = { top: 12, right: 14, bottom: 26, left: 30 }
  const maxLoad = 24
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const loadMarks = [0, 4, 8, 12, 16, 20, 24]
  const ratingMarks = [0, RATING_ATTENTION, RATING_TARGET, RATING_MAX]

  const curvePoints = Array.from({ length: maxLoad + 1 }, (_, load) => {
    const rating = getRating(load)
    const x = padding.left + (load / maxLoad) * innerWidth
    const y = padding.top + innerHeight - (rating / RATING_MAX) * innerHeight

    return { load, rating, x, y }
  })

  const points = loadMarks.map((load) => curvePoints[load])

  const path = curvePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ")

  const targetY = padding.top + innerHeight - (RATING_TARGET / RATING_MAX) * innerHeight
  const attentionY = padding.top + innerHeight - (RATING_ATTENTION / RATING_MAX) * innerHeight

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-background/70 p-4">
        <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>Рост нагрузки</span>
          <span>Рейтинг / 10</span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={height - padding.bottom}
            stroke="currentColor"
            className="text-border"
          />
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke="currentColor"
            className="text-border"
          />

          {ratingMarks.map((mark) => {
            const y = padding.top + innerHeight - (mark / RATING_MAX) * innerHeight
            return (
              <g key={mark}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  className={cn(
                    mark === RATING_TARGET
                      ? "text-emerald-400/70"
                      : mark === RATING_ATTENTION
                        ? "text-amber-400/60"
                        : "text-border"
                  )}
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px]"
                >
                  {formatRating(mark)}
                </text>
              </g>
            )
          })}

          <line
            x1={padding.left}
            y1={targetY}
            x2={width - padding.right}
            y2={targetY}
            stroke="currentColor"
            strokeDasharray="6 4"
            className="text-emerald-500/80"
          />
          <line
            x1={padding.left}
            y1={attentionY}
            x2={width - padding.right}
            y2={attentionY}
            stroke="currentColor"
            strokeDasharray="6 4"
            className="text-amber-500/80"
          />

          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-sky-500"
            strokeLinecap="round"
          />

          {points.map((point) => (
            <g key={point.load}>
              <circle
                cx={point.x}
                cy={point.y}
                r="4"
                fill="currentColor"
                className="text-sky-500"
              />
              <text
                x={point.x}
                y={height - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {point.load}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3 text-xs">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
          <div className="font-medium text-emerald-700 dark:text-emerald-300">
            {formatRating(RATING_TARGET)}–10.0
          </div>
          <div className="mt-1 text-muted-foreground">Нормальный режим, достаточно планового контроля.</div>
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
          <div className="font-medium text-amber-700 dark:text-amber-300">
            {formatRating(RATING_ATTENTION)}–{formatRating(RATING_TARGET - 0.1)}
          </div>
          <div className="mt-1 text-muted-foreground">Нужно внимание, стоит усилить контроль и обходы.</div>
        </div>
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <div className="font-medium text-red-700 dark:text-red-300">
            Ниже {formatRating(RATING_ATTENTION)}
          </div>
          <div className="mt-1 text-muted-foreground">Нужен выезд или эскалация, штатного режима уже недостаточно.</div>
        </div>
      </div>
    </div>
  )
}

const glossaryItems: GlossaryItem[] = [
  {
    title: "ИНЦИДЕНТ",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Инцидент — это зафиксированный системой факт неудовлетворительного состояния дороги или элементов дорожной инфраструктуры.</p>
        <p>Инцидент появляется в момент, когда система впервые обнаруживает проблему и сигнализирует, что требуется вмешательство.</p>
        <p className="font-medium text-foreground">Примеры:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>снежная каша на проезжей части</li>
          <li>подтопление дороги</li>
          <li>открытый люк</li>
          <li>покосившийся дорожный знак</li>
          <li>неработающее освещение</li>
        </ul>
      </div>
    )
  },
  {
    title: "НАРУШЕНИЕ",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Нарушение — это Инцидент, который не был устранён в установленный нормативный срок.</p>
        <p>Проще говоря:<br />Инцидент — это сама проблема,<br />Нарушение — это проблема, которая существует слишком долго.</p>
        <p>Нарушения являются основным управленческим индикатором качества работы подрядчиков.</p>
      </div>
    )
  },
  {
    title: "ТИП РАБОТ",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Тип работ показывает, какие действия требуются для устранения проблемы.</p>
        <div className="space-y-2">
          <p className="font-medium text-foreground">УБОРКА</p>
          <p>Очистка и приведение дороги в нормативное состояние:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>снежная каша</li>
            <li>снежные валы и снежные кучи</li>
            <li>грязь на дорогах</li>
            <li>подтопления</li>
          </ul>
        </div>
        <div className="space-y-2">
          <p className="font-medium text-foreground">РЕМОНТ</p>
          <p>Восстановление или замена элементов инфраструктуры:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>открытые люки</li>
            <li>дорожные знаки</li>
            <li>освещение</li>
            <li>разметка и другие статичные объекты</li>
          </ul>
        </div>
      </div>
    )
  },
  {
    title: "ТИП ИНЦИДЕНТА",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Тип инцидента — это конкретный вид проблемы, выявленной системой.</p>
        <p className="font-medium text-foreground">Примеры:</p>
        <p>снежная каша, снежный вал, снежная куча, подтопление, грязь на дороге, открытый люк, покосившийся знак, неработающее освещение.</p>
      </div>
    )
  },
  {
    title: "ВРЕМЯ РЕАКЦИИ",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Время реакции — это промежуток времени от момента обнаружения инцидента до начала работ по его устранению.</p>
        <p>Показатель отражает, насколько оперативно подрядчик отреагировал на проблему.</p>
      </div>
    )
  },
  {
    title: "НОРМАТИВЫ ВРЕМЕНИ РЕАКЦИИ (SLA ПО РЕАКЦИИ)",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <ul className="list-disc list-inside space-y-1">
          <li><span className="font-medium text-foreground">Уборка:</span> начало работ в течение 12 часов</li>
          <li><span className="font-medium text-foreground">Ремонт:</span> начало работ в течение 24 часов</li>
        </ul>
        <p>Если подрядчик начал работы позже нормативного времени, это считается плохой реакцией, даже если проблему в итоге устранили.</p>
      </div>
    )
  },
  {
    title: "ВРЕМЯ УСТРАНЕНИЯ",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Время устранения — это промежуток времени от момента обнаружения инцидента до полного восстановления нормативного состояния.</p>
        <p>Это фактическое время, в течение которого жители сталкивались с проблемой.</p>
      </div>
    )
  },
  {
    title: "КОГДА ИНЦИДЕНТ СТАНОВИТСЯ НАРУШЕНИЕМ",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">НОРМАТИВЫ SLA ПО УСТРАНЕНИЮ</p>
        <p>Инцидент считается нарушением, если превышены следующие сроки:</p>
        <div className="space-y-2">
          <p className="font-medium text-foreground">УБОРКА</p>
          <p>— уборка не выполнена в течение 18 часов</p>
        </div>
        <div className="space-y-2">
          <p className="font-medium text-foreground">РЕМОНТ:</p>
          <p><span className="font-medium">Открытый люк</span> — люк не закрыт в течение 8 часов</p>
          <p><span className="font-medium">Дорожные знаки, освещение, разметка и другие статичные объекты</span> — проблема сохраняется 100 часов и более</p>
        </div>
      </div>
    )
  },
  {
    title: "ПРОСРОЧКА",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Просрочка — это ситуация, когда подрядчик:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>слишком поздно начал работы (превышено время реакции)</li>
          <li>и / или слишком долго устранял проблему (превышено время устранения)</li>
        </ul>
        <p>Проще говоря: подрядчик не уложился в нормативы SLA.</p>
      </div>
    )
  },
  {
    title: "ПРОЦЕНТ ПРОСРОЧЕННЫХ ИНЦИДЕНТОВ",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Доля инцидентов, по которым были превышены нормативные сроки устранения.</p>
        <p>Это один из ключевых показателей качества содержания территории. Чем выше процент, тем хуже фактическая ситуация для города.</p>
      </div>
    )
  },
  {
    title: "ПОДРЯДЧИК",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Организация, ответственная за содержание дорожной инфраструктуры в пределах своей зоны ответственности.</p>
      </div>
    )
  },
  {
    title: "ЗОНА ОТВЕТСТВЕННОСТИ",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Территория города, закреплённая за конкретным подрядчиком, в рамках которой он отвечает за своевременную уборку и ремонт.</p>
      </div>
    )
  },
  {
    title: "ПОГОДНЫЕ УСЛОВИЯ",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Информация о погоде (осадки, температура, ветер), используемая для анализа влияния погоды на:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>появление инцидентов</li>
          <li>качество работы подрядчиков</li>
          <li>дорожную обстановку</li>
        </ul>
      </div>
    )
  },
  {
    title: "ПОКАЗАТЕЛИ ДОРОЖНОГО ДВИЖЕНИЯ",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Характеристики трафика, рассчитываемые на основе данных камер:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><span className="font-medium text-foreground">количество автомобилей</span> — загруженность дороги</li>
          <li><span className="font-medium text-foreground">средняя скорость</span> — качество движения</li>
          <li><span className="font-medium text-foreground">средний интервал между автомобилями</span> — плотность потока</li>
        </ul>
      </div>
    )
  },
  {
    title: "УХУДШЕНИЕ ДОРОЖНОЙ ОБСТАНОВКИ",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Ситуация, при которой из-за плохого состояния дороги или погодных условий:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>снижается скорость движения</li>
          <li>увеличиваются задержки и заторы</li>
        </ul>
      </div>
    )
  },
  {
    title: "МАТРИЦА ЭФФЕКТИВНОСТИ",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Сравнительный инструмент, который показывает:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>масштаб зоны ответственности подрядчика</li>
          <li>качество и своевременность его работы</li>
        </ul>
        <p>Позволяет быстро выявить сильных и проблемных подрядчиков.</p>
      </div>
    )
  },
  {
    title: "РЕЙТИНГ",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Рейтинг</span> — это сводная
          управленческая оценка по <span className="font-medium text-foreground">10-балльной шкале</span>.
          Если показатель в интерфейсе называется рейтингом, он считается по одной и той же кривой:
          сначала модуль считает нагрузку, потом переводит её в значение от 0.0 до 10.0.
        </p>

        <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
          <p className="font-medium text-foreground">Как считается рейтинг</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Сначала модуль считает нагрузку: сколько отклонений пришло, сколько из них остаётся открытыми и сколько среди них критичных или высокоприоритетных.</li>
            <li>Дальше в нагрузку могут добавляться модульные факторы, например задержка реакции или накопленный сервисный долг.</li>
            <li>После этого нагрузка переводится в рейтинг по плавной экспоненциальной кривой, чтобы оценка снижалась постепенно, а не «ломалась» от одного события.</li>
          </ol>
          <div className="rounded-lg border bg-background px-3 py-2 font-mono text-xs text-foreground">
            Рейтинг = 10 × e^(-нагрузка / {RATING_CURVE_DIVISOR})
          </div>
          <p className="text-xs">
            Такая формула делает первые отклонения заметными, но умеренными. Если проблемы повторяются,
            долго не закрываются или становятся критичными, рейтинг начинает снижаться быстрее.
            При этом кривая стремится к <span className="font-medium text-foreground">0.0</span>, а не останавливается на фиксированном минимуме.
          </p>
        </div>

        <RatingCurveGraphic />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-4">
            <p className="font-medium text-foreground">Пример нагрузки для безопасности</p>
            <ul className="mt-2 list-disc list-inside space-y-1">
              <li>общее число инцидентов</li>
              <li>открытые инциденты</li>
              <li>критические события</li>
              <li>задержка реакции на событие</li>
            </ul>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
            <p className="font-medium text-foreground">Пример нагрузки для эксплуатации</p>
            <ul className="mt-2 list-disc list-inside space-y-1">
              <li>общее число эксплуатационных проблем</li>
              <li>открытые задачи</li>
              <li>высокий приоритет</li>
              <li>накопленный сервисный долг</li>
            </ul>
          </div>
        </div>
      </div>
    )
  },
  {
    title: "ИНДЕКС ЗДОРОВЬЯ ОСТАНОВКИ",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Индекс здоровья остановки</span> — это интегральный индекс состояния остановки. Он не измеряет какой-то один физический параметр. Это сводная оценка «насколько здорова инфраструктура», собранная из нескольких показателей.
        </p>
        <p>Проще говоря: это процент нормального состояния остановки.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 p-3 bg-green-500/10 rounded-md border border-green-500/20">
            <p className="font-medium text-green-700 dark:text-green-400">Индекс высокий, если:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>связь работает</li>
              <li>температура нормальная</li>
              <li>инцидентов мало</li>
              <li>оборудование исправно</li>
            </ul>
          </div>
          <div className="space-y-2 p-3 bg-red-500/10 rounded-md border border-red-500/20">
            <p className="font-medium text-red-700 dark:text-red-400">Индекс падает, если:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>часто ломается</li>
              <li>пропадает связь</li>
              <li>холодно внутри</li>
              <li>много инцидентов</li>
            </ul>
          </div>
        </div>
      </div>
    ),
    modules: ['stops']
  },
  {
    title: "КОМФОРТНАЯ ТЕМПЕРАТУРНАЯ ЗОНА (ОСТАНОВКА)",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>
          Этот показатель — средний уровень комфорта остановок в сети. Он означает, какой процент времени остановки находились в комфортном температурном диапазоне.
        </p>
        <div className="space-y-2">
          <p className="font-medium text-foreground">В данном проекте температура внутри остановки комфортна, если:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>&ge; 15&deg;C</li>
            <li>&le; 22&deg;C</li>
          </ul>
        </div>
      </div>
    ),
    modules: ['stops']
  }
]

export function GlossaryDialog() {
  const { hasModule } = useModuleAccess()
  const [openItem, setOpenItem] = useState<string | null>(null)

  const toggleItem = (title: string) => {
    setOpenItem(openItem === title ? null : title)
  }

  const filteredItems = glossaryItems.filter(item => {
    if (!item.modules) return true
    return item.modules.some(mod => hasModule(mod))
  })

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start gap-3 h-auto py-3 border-dashed"
        >
          <Book className="h-4 w-4" />
          <span>Глоссарий</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Book className="h-5 w-5 text-primary" />
            Глоссарий терминов
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-1">
            {filteredItems.map((item) => (
              <div key={item.title} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleItem(item.title)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50",
                    openItem === item.title && "bg-muted/50"
                  )}
                >
                  <span>{item.title}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform duration-200",
                      openItem === item.title && "rotate-180"
                    )}
                  />
                </button>
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-300",
                    openItem === item.title ? "max-h-[2000px]" : "max-h-0"
                  )}
                >
                  <div className="px-4 pb-4 pt-2 border-t bg-muted/20">
                    {item.content}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
