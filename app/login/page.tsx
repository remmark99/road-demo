'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, LogIn, ArrowLeft, Loader2 } from 'lucide-react'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)

        try {
            const supabase = createClient()
            const { error } = await Promise.race([
                supabase.auth.signInWithPassword({ email, password }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), 10000)
                ),
            ])

            if (error) {
                setError(error.message)
                setLoading(false)
                return
            }

            // Force a full navigation so the next request reliably includes
            // the freshly written auth cookies for the route guard.
            window.location.replace('/')
        } catch {
            setError('Сервер не отвечает. Попробуйте ещё раз.')
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-4">
            {/* Background gradient effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-teal-500/10 rounded-full blur-[100px]" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-[100px]" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Back to landing */}
                <Link
                    href="/landing"
                    className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors mb-8"
                >
                    <ArrowLeft className="h-4 w-4" />
                    На главную
                </Link>

                {/* Card */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 mb-4">
                            <Eye className="h-6 w-6 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">
                            Вход в систему
                        </h1>
                        <p className="text-sm text-white/40">
                            Вектор Города · Сургут
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div className="space-y-2">
                            <label
                                htmlFor="email"
                                className="block text-sm font-medium text-white/60"
                            >
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label
                                htmlFor="password"
                                className="block text-sm font-medium text-white/60"
                            >
                                Пароль
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-all pr-12"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-5 w-5" />
                                    ) : (
                                        <Eye className="h-5 w-5" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white font-medium transition-all shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <>
                                    <LogIn className="h-5 w-5" />
                                    Войти
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <div className="text-center mt-6 text-sm text-white/30">
                    © 2025 – {new Date().getFullYear()} · Вектор Города
                </div>
            </div>
        </div>
    )
}
