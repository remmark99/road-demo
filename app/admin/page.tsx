"use client"

import { useState, useEffect } from "react"
import { Navigation } from "@/components/navigation"
import { Shield, Plus, Edit2, Loader2, Save, X, AlertCircle } from "lucide-react"

type Module = 'roads' | 'shore' | 'stops'

interface Profile {
    id: string
    email: string
    role: string
    modules: Module[]
    created_at?: string
}

const AVAILABLE_MODULES: { id: Module; name: string }[] = [
    { id: 'roads', name: 'Безопасные дороги' },
    { id: 'shore', name: 'Безопасный берег' },
    { id: 'stops', name: 'Остановки' },
]

export default function AdminPage() {
    const [users, setUsers] = useState<Profile[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Create User Modal State
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [newEmail, setNewEmail] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [newRole, setNewRole] = useState('user')
    const [newModules, setNewModules] = useState<Module[]>([])
    const [creating, setCreating] = useState(false)

    // Edit User State
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editModules, setEditModules] = useState<Module[]>([])
    const [editRole, setEditRole] = useState('user')

    useEffect(() => {
        fetchUsers()
    }, [])

    const fetchUsers = async () => {
        try {
            setLoading(true)
            const res = await fetch('/api/admin/users')
            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Failed to fetch users')
            }

            setUsers(data)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreating(true)
        setError(null)

        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: newEmail,
                    password: newPassword,
                    role: newRole,
                    modules: newModules,
                }),
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            setIsCreateOpen(false)
            setNewEmail('')
            setNewPassword('')
            setNewModules([])
            setNewRole('user')
            fetchUsers() // Reload list
        } catch (err: any) {
            setError(err.message)
        } finally {
            setCreating(false)
        }
    }

    const startEditing = (user: Profile) => {
        setEditingId(user.id)
        setEditModules(user.modules || [])
        setEditRole(user.role)
    }

    const cancelEditing = () => {
        setEditingId(null)
        setEditModules([])
    }

    const saveEditing = async (id: string) => {
        try {
            setError(null)
            const res = await fetch('/api/admin/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    role: editRole,
                    modules: editModules,
                }),
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error)
            }

            setEditingId(null)
            fetchUsers()
        } catch (err: any) {
            setError(err.message)
        }
    }

    const toggleModule = (modArray: Module[], setModArray: (arr: Module[]) => void, mod: Module) => {
        if (modArray.includes(mod)) {
            setModArray(modArray.filter(m => m !== mod))
        } else {
            setModArray([...modArray, mod])
        }
    }

    return (
        <main className="min-h-screen bg-background">
            <Navigation />

            <div className="pt-20 px-6 max-w-6xl mx-auto pb-12">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <Shield className="h-8 w-8 text-teal-500" />
                            Админ-панель
                        </h1>
                        <p className="text-muted-foreground mt-2">
                            Управление пользователями и доступными модулями платформы
                        </p>
                    </div>

                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-colors shadow-lg shadow-teal-500/20"
                    >
                        <Plus className="h-4 w-4" />
                        Создать пользователя
                    </button>
                </div>

                {error && (
                    <div className="mb-6 p-4 border border-red-500/20 bg-red-500/10 rounded-xl flex items-start gap-3 text-red-400">
                        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">Ошибка</p>
                            <p className="text-sm opacity-80">{error}</p>
                        </div>
                    </div>
                )}

                <div className="bg-white/[0.02] border border-border rounded-xl shadow-sm overflow-hidden backdrop-blur-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border bg-white/[0.02]">
                                    <th className="px-6 py-4 font-medium text-muted-foreground">Пользователь</th>
                                    <th className="px-6 py-4 font-medium text-muted-foreground">Роль</th>
                                    <th className="px-6 py-4 font-medium text-muted-foreground">Доступные модули</th>
                                    <th className="px-6 py-4 font-medium text-muted-foreground text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {loading ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 opacity-50" />
                                            Загрузка пользователей...
                                        </td>
                                    </tr>
                                ) : users.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                                            Нет зарегистрированных пользователей
                                        </td>
                                    </tr>
                                ) : (
                                    users.map((u) => (
                                        <tr key={u.id} className="hover:bg-white/[0.01] transition-colors">
                                            <td className="px-6 py-4 font-medium">{u.email}</td>

                                            <td className="px-6 py-4">
                                                {editingId === u.id ? (
                                                    <select
                                                        value={editRole}
                                                        onChange={(e) => setEditRole(e.target.value)}
                                                        className="bg-background border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:border-teal-500"
                                                    >
                                                        <option value="user">Пользователь</option>
                                                        <option value="admin">Администратор</option>
                                                    </select>
                                                ) : (
                                                    <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium ${u.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-muted text-muted-foreground border border-border'
                                                        }`}>
                                                        {u.role === 'admin' ? 'Админ' : 'Пользователь'}
                                                    </span>
                                                )}
                                            </td>

                                            <td className="px-6 py-4">
                                                {editingId === u.id ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {AVAILABLE_MODULES.map(mod => (
                                                            <label key={mod.id} className="flex items-center gap-1.5 text-sm cursor-pointer border border-border rounded-md px-2 py-1 hover:bg-white/5 transition-colors">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editModules.includes(mod.id)}
                                                                    onChange={() => toggleModule(editModules, setEditModules, mod.id)}
                                                                    className="accent-teal-500"
                                                                />
                                                                {mod.name}
                                                            </label>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-wrap gap-2">
                                                        {AVAILABLE_MODULES.map(mod => {
                                                            const hasModule = (u.modules || []).includes(mod.id)
                                                            if (!hasModule) return null
                                                            return (
                                                                <span key={mod.id} className="inline-flex px-2 py-1 rounded-md text-xs font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20">
                                                                    {mod.name}
                                                                </span>
                                                            )
                                                        })}
                                                        {(!u.modules || u.modules.length === 0) && (
                                                            <span className="text-sm text-muted-foreground italic">Нет назначенных модулей</span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>

                                            <td className="px-6 py-4 text-right">
                                                {editingId === u.id ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => saveEditing(u.id)}
                                                            className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-md transition-colors"
                                                            title="Сохранить"
                                                        >
                                                            <Save className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={cancelEditing}
                                                            className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                                                            title="Отмена"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => startEditing(u)}
                                                        className="p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground rounded-md transition-colors"
                                                        title="Редактировать модули"
                                                    >
                                                        <Edit2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Create User Modal */}
            {isCreateOpen && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-[#0f1423] border border-border rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between p-6 border-b border-border">
                            <h2 className="text-xl font-semibold">Новый пользователь</h2>
                            <button
                                onClick={() => setIsCreateOpen(false)}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateUser} className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Email</label>
                                    <input
                                        type="email"
                                        required
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        className="w-full bg-white/5 border border-border rounded-xl px-4 py-2 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                        placeholder="user@example.com"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Пароль (минимум 6 символов)</label>
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        className="w-full bg-white/5 border border-border rounded-xl px-4 py-2 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                        placeholder="••••••••"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Роль</label>
                                    <select
                                        value={newRole}
                                        onChange={e => setNewRole(e.target.value)}
                                        className="w-full bg-white/5 border border-border rounded-xl px-4 py-2 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    >
                                        <option value="user">Пользователь</option>
                                        <option value="admin">Администратор</option>
                                    </select>
                                </div>

                                <div className="space-y-3 pt-2">
                                    <label className="text-sm font-medium text-muted-foreground mb-2 block border-t border-border pt-4">
                                        Доступные модули
                                    </label>
                                    {AVAILABLE_MODULES.map(mod => (
                                        <label key={mod.id} className="flex items-center gap-3 p-3 border border-border rounded-xl cursor-pointer hover:bg-white/5 transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={newModules.includes(mod.id)}
                                                onChange={() => toggleModule(newModules, setNewModules, mod.id)}
                                                className="h-4 w-4 bg-background border-border rounded text-teal-500 focus:ring-teal-500"
                                            />
                                            <span className="font-medium">{mod.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-border">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateOpen(false)}
                                    className="flex-1 px-4 py-2.5 bg-muted hover:bg-muted/80 text-foreground rounded-xl transition-colors"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl transition-colors shadow-lg shadow-teal-500/20 disabled:opacity-50"
                                >
                                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Создать'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </main>
    )
}
