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

interface GlossaryItem {
  title: string
  content: React.ReactNode
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
        <p>Проще говоря:<br/>Инцидент — это сама проблема,<br/>Нарушение — это проблема, которая существует слишком долго.</p>
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
  }
]

export function GlossaryDialog() {
  const [openItem, setOpenItem] = useState<string | null>(null)

  const toggleItem = (title: string) => {
    setOpenItem(openItem === title ? null : title)
  }

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
            {glossaryItems.map((item) => (
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
                    "overflow-hidden transition-all duration-200",
                    openItem === item.title ? "max-h-[500px]" : "max-h-0"
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
