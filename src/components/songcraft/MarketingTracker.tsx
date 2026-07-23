"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { readTelegramInitData, useTelegram } from "@/hooks/useTelegram";

const STORAGE_KEY = "songcraft:marketing-attribution:v1";

type Attribution = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
  startParam?: string | null;
  referrer?: string | null;
};

function clean(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function readStored(): Attribution {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Attribution;
  } catch {
    return {};
  }
}

function writeStored(value: Attribution) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function MarketingTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { tg, initData, isReady } = useTelegram();

  const attribution = useMemo<Attribution>(() => {
    const stored = readStored();
    const next: Attribution = {
      source: clean(searchParams.get("utm_source")) ?? stored.source ?? null,
      medium: clean(searchParams.get("utm_medium")) ?? stored.medium ?? null,
      campaign: clean(searchParams.get("utm_campaign")) ?? stored.campaign ?? null,
      content: clean(searchParams.get("utm_content")) ?? stored.content ?? null,
      term: clean(searchParams.get("utm_term")) ?? stored.term ?? null,
      startParam: tg?.initDataUnsafe?.start_param ?? stored.startParam ?? null,
      referrer: typeof document !== "undefined" ? document.referrer || stored.referrer || null : stored.referrer ?? null,
    };
    if (Object.values(next).some(Boolean)) writeStored(next);
    return next;
  }, [searchParams, tg?.initDataUnsafe?.start_param]);

  useEffect(() => {
    if (!isReady) return;
    const authData = initData || readTelegramInitData();
    if (!authData) return;

    const controller = new AbortController();
    const eventKey = `songcraft:page-view:${pathname}:${searchParams.toString()}`;
    const firstOpenKey = "songcraft:first-open-tracked:v1";
    const firstOpen = !window.sessionStorage.getItem(firstOpenKey);
    window.sessionStorage.setItem(firstOpenKey, "1");

    const send = (event: string) => {
      fetch("/api/songcraft/marketing/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": authData,
        },
        body: JSON.stringify({
          event,
          path: `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
          ...attribution,
        }),
        signal: controller.signal,
      }).catch(() => null);
    };

    if (!window.sessionStorage.getItem(eventKey)) {
      window.sessionStorage.setItem(eventKey, "1");
      send("page_view");
    }
    if (firstOpen) send("app_open");

    return () => controller.abort();
  }, [attribution, initData, isReady, pathname, searchParams]);

  return null;
}
