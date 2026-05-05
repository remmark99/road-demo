import React from "react"
import type { Metadata } from 'next'
import Script from 'next/script'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { Toaster } from "@/components/ui/sonner"
import { ModuleProvider } from "@/components/providers/module-context"

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: 'Вектор Города — Интеллектуальный мониторинг городской инфраструктуры',
    template: '%s | Вектор Города',
  },
  description: 'Платформа мониторинга городской инфраструктуры на основе компьютерного зрения и IoT-датчиков. Состояние дорог, остановок, парков, набережных и транспорта в реальном времени.',
  keywords: [
    'мониторинг дорог', 'состояние дорог', 'умный город', 'smart city',
    'видеоаналитика', 'компьютерное зрение', 'Сургут', 'городская инфраструктура',
    'мониторинг остановок', 'безопасный город', 'IoT датчики', 'ямы на дорогах',
    'снегоуборочная техника', 'контроль дорог', 'дорожное покрытие',
    'мониторинг парков', 'безопасный берег', 'контроль транспорта',
    'Вектор Города', 'городской мониторинг', 'видеонаблюдение',
  ],
  authors: [{ name: 'Вектор Города' }],
  creator: 'Вектор Города',
  publisher: 'Вектор Города',
  metadataBase: new URL('https://vector-goroda.ru'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Вектор Города',
    title: 'Вектор Города — Интеллектуальный мониторинг городской инфраструктуры',
    description: 'Платформа мониторинга городской инфраструктуры: дороги, остановки, парки, набережные, транспорт. Компьютерное зрение и IoT в реальном времени.',
    images: [
      {
        url: '/landing/hero.png',
        width: 1200,
        height: 630,
        alt: 'Вектор Города — мониторинг городской инфраструктуры',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Вектор Города — Мониторинг городской инфраструктуры',
    description: 'Интеллектуальная система мониторинга дорог, остановок, парков и транспорта — Вектор Города',
    images: ['/landing/hero.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
  verification: {
    yandex: '108708763',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var theme = localStorage.getItem('theme');
                if (theme === 'dark' || !theme) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className={`font-sans antialiased`}>
        <ModuleProvider>
          {children}
        </ModuleProvider>
        <Toaster position="bottom-right" />
        <Analytics />

        {/* Yandex.Metrika counter */}
        <Script
          id="yandex-metrika"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(m,e,t,r,i,k,a){
                m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                m[i].l=1*new Date();
                for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
                k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
              })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=108708763', 'ym');

              ym(108708763, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
            `,
          }}
        />
        <noscript>
          <div>
            <img src="https://mc.yandex.ru/watch/108708763" style={{ position: 'absolute', left: '-9999px' }} alt="" />
          </div>
        </noscript>
      </body>
    </html>
  )
}
