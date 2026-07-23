"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Building2,
  Handshake,
  Phone,
  MessageSquare,
  Calendar,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  BarChart3,
  Bot,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession, signOut } from "next-auth/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navigation = [
  {
    name: "Дашборд",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Контакты",
    href: "/contacts",
    icon: Users,
  },
  {
    name: "Компании",
    href: "/companies",
    icon: Building2,
  },
  {
    name: "Сделки",
    href: "/deals",
    icon: Handshake,
  },
  {
    name: "Задачи",
    href: "/tasks",
    icon: Calendar,
  },
  {
    name: "Звонки",
    href: "/calls",
    icon: Phone,
  },
  {
    name: "Сообщения",
    href: "/messages",
    icon: MessageSquare,
  },
  {
    name: "ИИ Агент",
    href: "/ai-agent",
    icon: Bot,
  },
  {
    name: "Продукты",
    href: "/products",
    icon: Package,
  },
  {
    name: "Аналитика",
    href: "/analytics",
    icon: BarChart3,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "flex flex-col h-full bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-200 dark:border-slate-700">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">C</span>
              </div>
              <span className="font-bold text-xl">CRM</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="h-8 w-8"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          <ul className="space-y-1">
            {navigation.map((item) => {
              const isActive = pathname?.startsWith(item.href);
              return (
                <li key={item.name}>
                  <Tooltip>
                    <TooltipTrigger>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                          isActive
                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                            : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                        )}
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        {!collapsed && <span>{item.name}</span>}
                      </Link>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipContent side="right">
                        {item.name}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User section */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-4">
          {session?.user && (
            <div
              className={cn(
                "flex items-center gap-3",
                collapsed && "justify-center"
              )}
            >
              <Tooltip>
                <TooltipTrigger>
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={session.user.avatar || ""} />
                    <AvatarFallback>
                      {session.user.name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right">
                    {session.user.name}
                  </TooltipContent>
                )}
              </Tooltip>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {session.user.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {session.user.role}
                  </p>
                </div>
              )}
              {!collapsed && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => signOut()}
                  className="h-8 w-8"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}