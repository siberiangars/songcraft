"use client";

import { HandCoins, Home, Library, Music2, WalletCards } from "lucide-react";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/songcraft", label: "Главная", icon: Home },
  { href: "/songcraft/create", label: "Создать", icon: Music2 },
  { href: "/songcraft/songs", label: "Треки", icon: Library },
  { href: "/songcraft/partners", label: "Партнёры", icon: HandCoins },
  { href: "/songcraft/balance", label: "Баланс", icon: WalletCards },
];

export function BottomNav() {
  const currentPath = usePathname();

  return (
    <nav className="sc-bottom-nav" aria-label="Основная навигация">
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === "/songcraft"
          ? currentPath === item.href
          : currentPath.startsWith(item.href);
        const Icon = item.icon;

        return (
          <button
            key={item.href}
            className={`sc-nav-item ${isActive ? "active" : ""}`}
            onClick={() => { window.location.href = item.href; }}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
