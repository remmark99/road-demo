"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  Eye,
  BarChart2,
  FileText,
  FileSpreadsheet,
  Plug,
  Settings,
  Shield,
  HelpCircle,
  Grid3X3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/profile", icon: User, label: "Личный кабинет" },
  { href: "/overview", icon: Eye, label: "Обзор" },
  { href: "/", icon: BarChart2, label: "Отчёты о городе" },
  { href: "/contractors", icon: FileText, label: "Информация о подрядчиках" },
  { href: "/summary", icon: FileSpreadsheet, label: "Сводный отчёт" },
  { href: "/integrations", icon: Plug, label: "Интеграции" },
];

const adminLinks = [
  { href: "/settings", icon: Settings, label: "Настройки" },
  { href: "/admin", icon: Shield, label: "Администраторская панель" },
];

export function SettingsNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/settings") {
      return pathname.startsWith("/settings");
    }
    return pathname === href;
  };

  return (
    <div className="w-64 bg-gradient-to-b from-[#0D1B44] to-[#132044] text-white flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 pt-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
            <Grid3X3 className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="text-xs font-medium tracking-wider text-white/70">СОСТОЯНИЕ</div>
            <div className="text-lg font-bold tracking-wide">ДОРОГ</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        {links.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                active
                  ? "bg-gradient-to-r from-[#2ECC71] to-[#27AE60] text-white shadow-lg shadow-green-500/20"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              )}
            >
              <link.icon className="h-5 w-5 flex-shrink-0" />
              <span className="truncate">{link.label}</span>
            </Link>
          );
        })}

        <div className="border-t border-white/10 my-4" />

        {adminLinks.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                active
                  ? "bg-gradient-to-r from-[#2ECC71] to-[#27AE60] text-white shadow-lg shadow-green-500/20"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              )}
            >
              <link.icon className="h-5 w-5 flex-shrink-0" />
              <span className="truncate">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Help link */}
      <div className="p-3 mt-auto border-t border-white/10">
        <Link
          href="/help"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-all duration-200"
        >
          <HelpCircle className="h-5 w-5" />
          <span>Нужна помощь?</span>
        </Link>
      </div>
    </div>
  );
}
