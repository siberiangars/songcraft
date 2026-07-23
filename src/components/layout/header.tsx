"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search, Sun, Moon, Plus, User, Building2, Handshake, Calendar, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

export function Header() {
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");

  const quickActions = [
    { label: "Новый контакт", icon: User, href: "/contacts" },
    { label: "Новая компания", icon: Building2, href: "/companies" },
    { label: "Новая сделка", icon: Handshake, href: "/deals" },
    { label: "Новая задача", icon: Calendar, href: "/tasks" },
    { label: "Исходящий звонок", icon: Phone, href: "/calls" },
  ];

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 flex items-center justify-between">
      {/* Search */}
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="search"
            placeholder="Поиск контактов, компаний, сделок..."
            className="pl-10 bg-slate-50 dark:bg-slate-700 border-0"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchQuery) {
                router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
              }
            }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Quick Add */}
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden md:inline">Создать</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {quickActions.map((action) => (
              <DropdownMenuItem key={action.href} onClick={() => router.push(action.href)}>
                <action.icon className="h-4 w-4 mr-2" />
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme Toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="ghost" size="icon">
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Переключить тему</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              Светлая
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              Тёмная
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              Системная
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
                {Math.floor(Math.random() * 5) + 1}
              </Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuItem onClick={() => router.push("/dashboard")}>
              <div className="flex flex-col gap-1">
                <span className="font-medium">Новый лид!</span>
                <span className="text-xs text-slate-500">Artem_lidorub начал диалог</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/deals")}>
              <div className="flex flex-col gap-1">
                <span className="font-medium">Сделка требует внимания</span>
                <span className="text-xs text-slate-500">Этап "Переговоры"</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/tasks")}>
              <div className="flex flex-col gap-1">
                <span className="font-medium">Задача просрочена</span>
                <span className="text-xs text-slate-500">Подготовка КП</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}