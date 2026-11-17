"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Download, Maximize2, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export interface LightboxImage {
  src: string
  alt: string
  label: string
}

interface MediaLightboxProps {
  images: LightboxImage[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}

export function MediaLightbox({ images, index, onIndexChange, onClose }: MediaLightboxProps) {
  const open = images.length > 0
  const current = images[index]
  // Развернуть на весь экран без скачивания; закрытие окна возвращает обычный размер.
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { if (!open) setExpanded(false) }, [open])

  const goPrev = useCallback(() => {
    onIndexChange((index - 1 + images.length) % images.length)
  }, [index, images.length, onIndexChange])

  const goNext = useCallback(() => {
    onIndexChange((index + 1) % images.length)
  }, [index, images.length, onIndexChange])

  useEffect(() => {
    if (!open || images.length < 2) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") goPrev()
      if (event.key === "ArrowRight") goNext()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, images.length, goPrev, goNext])

  if (!current) return null

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        className={cn("gap-0 overflow-hidden p-0", expanded ? "flex h-[100dvh] w-screen max-w-none flex-col rounded-none border-0 sm:max-w-none" : "sm:max-w-3xl")}
        onClick={(event) => event.stopPropagation()}
      >
        <DialogTitle className="sr-only">{current.label}</DialogTitle>
        <DialogDescription className="sr-only">{current.alt}</DialogDescription>

        <div className={cn("relative flex items-center justify-center bg-black", expanded ? "min-h-0 flex-1" : "min-h-[50vh] max-h-[75vh]")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.src}
            alt={current.alt}
            className={cn("w-full object-contain", expanded ? "h-full max-h-full" : "max-h-[75vh]")}
          />
          {images.length > 1 && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full opacity-90"
                onClick={goPrev}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full opacity-90"
                onClick={goNext}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{current.label}</div>
            {images.length > 1 && (
              <div className="text-xs text-muted-foreground">
                {index + 1} из {images.length}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}>
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {expanded ? "Свернуть" : "Развернуть"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={current.src} download target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4" />
              Скачать фото
            </a>
          </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface LightboxState {
  images: LightboxImage[]
  index: number
}

export function useMediaLightbox() {
  const [state, setState] = useState<LightboxState | null>(null)

  const openLightbox = useCallback((images: LightboxImage[], startSrc?: string) => {
    if (images.length === 0) return
    const startIndex = startSrc ? Math.max(images.findIndex((img) => img.src === startSrc), 0) : 0
    setState({ images, index: startIndex })
  }, [])

  const closeLightbox = useCallback(() => setState(null), [])

  const setIndex = useCallback((index: number) => {
    setState((prev) => (prev ? { ...prev, index } : prev))
  }, [])

  const lightboxProps: MediaLightboxProps | null = state
    ? { images: state.images, index: state.index, onIndexChange: setIndex, onClose: closeLightbox }
    : null

  return { lightboxProps, openLightbox }
}
