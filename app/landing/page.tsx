"use client"

import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { ArrowRight, Shield, Eye, Brain, ChevronRight } from "lucide-react"

const MODULES = [
    {
        id: "roads",
        title: "Безопасные дороги",
        subtitle: "Мониторинг состояния дорожного покрытия",
        description: "Автоматический анализ видеопотока с камер для выявления ям, луж, снежных завалов и работы снегоуборочной техники.",
        image: "/landing/roads-v2.png",
        href: "/",
        color: "from-amber-500/20 to-orange-500/10",
        borderColor: "border-amber-500/30 hover:border-amber-400/60",
        glowColor: "group-hover:shadow-amber-500/20",
        accentColor: "text-amber-400",
        dotColor: "bg-amber-400",
        tags: ["CV-анализ", "Камеры", "Дорожные отрезки"],
    },
    {
        id: "stops",
        title: "Безопасные остановки",
        subtitle: "Комплексный мониторинг остановочных пунктов",
        description: "Пассажирская аналитика, безопасность, вандализм, состояние конструкций и эксплуатация тёплых остановок.",
        image: "/landing/bus-stop.png",
        href: "/dashboard",
        color: "from-teal-500/20 to-cyan-500/10",
        borderColor: "border-teal-500/30 hover:border-teal-400/60",
        glowColor: "group-hover:shadow-teal-500/20",
        accentColor: "text-teal-400",
        dotColor: "bg-teal-400",
        tags: ["IoT-датчики", "Видеоаналитика", "5 дашбордов"],
    },
    {
        id: "shore",
        title: "Безопасный берег",
        subtitle: "Мониторинг прибрежных зон и набережных",
        description: "Контроль безопасности набережных, мониторинг уровня воды, обнаружение людей в опасных зонах.",
        image: "/landing/river.png",
        href: "#",
        color: "from-blue-500/20 to-indigo-500/10",
        borderColor: "border-blue-500/30 hover:border-blue-400/60",
        glowColor: "group-hover:shadow-blue-500/20",
        accentColor: "text-blue-400",
        dotColor: "bg-blue-400",
        tags: ["Скоро", "Уровень воды", "Безопасность"],
    },
]

const STATS = [
    { value: "200+", label: "Камер" },
    { value: "24/7", label: "Мониторинг" },
    { value: "50+", label: "Остановок" },
    { value: "<3с", label: "Время реакции" },
]

export default function LandingPage() {
    const [hoveredModule, setHoveredModule] = useState<string | null>(null)

    return (
        <div className="min-h-screen bg-[#0a0e1a] text-white overflow-x-hidden">
            {/* ─── Navigation ────────────────────────── */}
            <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0e1a]/80 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center">
                            <Eye className="h-4 w-4 text-white" />
                        </div>
                        <span className="font-semibold text-lg tracking-tight">Безопасный город</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
                        <a href="#modules" className="hover:text-white transition-colors">Модули</a>
                        <a href="#about" className="hover:text-white transition-colors">О проекте</a>
                        <Link
                            href="/login"
                            className="px-4 py-2 bg-white/10 hover:bg-white/15 rounded-lg transition-colors text-white"
                        >
                            Войти в систему
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ─── Hero ──────────────────────────────── */}
            <section className="relative min-h-[90vh] flex items-center justify-center pt-16">
                {/* Background image */}
                <div className="absolute inset-0 z-0">
                    <Image
                        src="/landing/hero.png"
                        alt=""
                        fill
                        className="object-cover opacity-30"
                        priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e1a] via-transparent to-[#0a0e1a]" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0a0e1a]/80 via-transparent to-[#0a0e1a]/80" />
                </div>

                <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-white/60 mb-8">
                        <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                        Платформа городского мониторинга
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/60">
                            Безопасный
                        </span>
                        <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-cyan-300 to-blue-400">
                            город Сургут
                        </span>
                    </h1>

                    <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed mb-10">
                        Интеллектуальная система мониторинга городской инфраструктуры
                        на основе компьютерного зрения и IoT-датчиков
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link
                            href="/login"
                            className="group flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white font-medium rounded-xl transition-all shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40"
                        >
                            Открыть платформу
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                        <a
                            href="#modules"
                            className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 rounded-xl transition-all"
                        >
                            Обзор модулей
                        </a>
                    </div>

                    {/* Stats */}
                    <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-2xl mx-auto">
                        {STATS.map((stat) => (
                            <div key={stat.label} className="text-center">
                                <div className="text-2xl md:text-3xl font-bold text-white">{stat.value}</div>
                                <div className="text-sm text-white/40 mt-1">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Scroll indicator */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/30 animate-bounce">
                    <ChevronRight className="h-5 w-5 rotate-90" />
                </div>
            </section>

            {/* ─── Modules ───────────────────────────── */}
            <section id="modules" className="relative py-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">Модули платформы</h2>
                        <p className="text-white/40 text-lg max-w-xl mx-auto">
                            Каждый модуль — отдельная система мониторинга, объединённая в единую платформу
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {MODULES.map((mod) => (
                            <Link
                                key={mod.id}
                                href={mod.href}
                                className={`group relative rounded-2xl border bg-gradient-to-b ${mod.color} ${mod.borderColor} p-6 transition-all duration-300 hover:shadow-2xl ${mod.glowColor} hover:-translate-y-1`}
                                onMouseEnter={() => setHoveredModule(mod.id)}
                                onMouseLeave={() => setHoveredModule(null)}
                            >
                                {/* Module image */}
                                <div className="relative w-full aspect-square mb-6 rounded-xl overflow-hidden bg-[#0a0e1a]/50">
                                    <Image
                                        src={mod.image}
                                        alt={mod.title}
                                        fill
                                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                                    />
                                </div>

                                {/* Status dot */}
                                <div className="flex items-center gap-2 mb-3">
                                    <span className={`w-2 h-2 rounded-full ${mod.dotColor} ${mod.id !== "shore" ? "animate-pulse" : "opacity-50"}`} />
                                    <span className={`text-xs font-medium ${mod.accentColor}`}>
                                        {mod.id === "shore" ? "В разработке" : "Активен"}
                                    </span>
                                </div>

                                <h3 className="text-xl font-semibold mb-1">{mod.title}</h3>
                                <p className="text-sm text-white/40 mb-3">{mod.subtitle}</p>
                                <p className="text-sm text-white/50 leading-relaxed mb-4">{mod.description}</p>

                                {/* Tags */}
                                <div className="flex flex-wrap gap-2">
                                    {mod.tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="px-2.5 py-1 text-[11px] rounded-md bg-white/5 text-white/50 border border-white/5"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>

                                {/* Arrow */}
                                <div className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                                    <ArrowRight className={`h-4 w-4 ${mod.accentColor} group-hover:translate-x-0.5 transition-transform`} />
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── About ─────────────────────────────── */}
            <section id="about" className="relative py-24 px-6 border-t border-white/5">
                <div className="max-w-4xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                        <div>
                            <h2 className="text-3xl font-bold mb-6">Технологии</h2>
                            <div className="space-y-4">
                                {[
                                    { icon: Eye, title: "Компьютерное зрение", desc: "Анализ видеопотока в реальном времени с городских камер" },
                                    { icon: Brain, title: "ML-модели", desc: "Детекция событий, классификация объектов, предсказание инцидентов" },
                                    { icon: Shield, title: "Единая платформа", desc: "Все модули объединены в единую систему с общим дашбордом" },
                                ].map((item) => (
                                    <div key={item.title} className="flex gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                        <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center flex-shrink-0">
                                            <item.icon className="h-5 w-5 text-teal-400" />
                                        </div>
                                        <div>
                                            <h3 className="font-medium mb-1">{item.title}</h3>
                                            <p className="text-sm text-white/40">{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="relative aspect-square rounded-2xl overflow-hidden border border-white/5">
                            <Image
                                src="/landing/hero.png"
                                alt="Карта города"
                                fill
                                className="object-cover opacity-60"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e1a] via-transparent to-transparent" />
                            <div className="absolute bottom-6 left-6 right-6">
                                <div className="text-sm text-white/40 mb-2">г. Сургут</div>
                                <div className="text-lg font-semibold">Единая карта мониторинга</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ─── Footer ────────────────────────────── */}
            <footer className="border-t border-white/5 py-12 px-6">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center">
                            <Eye className="h-3.5 w-3.5 text-white" />
                        </div>
                        <span className="text-sm text-white/40">Безопасный город · Сургут</span>
                    </div>
                    <div className="text-sm text-white/30">
                        © 2025 – {new Date().getFullYear()}
                    </div>
                </div>
            </footer>
        </div>
    )
}
