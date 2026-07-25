"use client";

import { useSyncExternalStore } from "react";

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  disableVerticalSwipes?: () => void;
  close: () => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation?: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
  };
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
  };
  HapticFeedback?: {
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    start_param?: string;
  };
  initData: string;
  colorScheme: "light" | "dark";
  themeParams: {
    bg_color?: string;
    text_color?: string;
    button_color?: string;
    button_text_color?: string;
  };
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  safeAreaInset?: { top: number; right: number; bottom: number; left: number };
  contentSafeAreaInset?: { top: number; right: number; bottom: number; left: number };
  version: string;
  platform?: string;
  onEvent?: (eventType: string, eventHandler: (...args: unknown[]) => void) => void;
  offEvent?: (eventType: string, eventHandler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

interface TelegramState {
  tg: TelegramWebApp | null;
  initData: string;
  isReady: boolean;
}

const SERVER_STATE: TelegramState = { tg: null, initData: "", isReady: false };
let sharedState: TelegramState = SERVER_STATE;
let initializationStarted = false;
const listeners = new Set<() => void>();

function versionParts(version: string) {
  return version.split(".").map((part) => Number(part) || 0);
}

export function telegramVersionAtLeast(version: string | undefined, minimum: string) {
  const current = versionParts(version || "0");
  const required = versionParts(minimum);
  const length = Math.max(current.length, required.length);
  for (let index = 0; index < length; index += 1) {
    if ((current[index] || 0) > (required[index] || 0)) return true;
    if ((current[index] || 0) < (required[index] || 0)) return false;
  }
  return true;
}

function emit(next: TelegramState) {
  sharedState = next;
  listeners.forEach((listener) => listener());
}

function extractInitDataFromUrl(): string {
  if (typeof window === "undefined") return "";
  const fromSearch = new URLSearchParams(window.location.search).get("tgWebAppData");
  if (fromSearch) return fromSearch;
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash).get("tgWebAppData") ?? "";
}

export function readTelegramInitData(): string {
  if (typeof window === "undefined") return "";
  return window.Telegram?.WebApp.initData || extractInitDataFromUrl();
}

function isDesktopTelegram(webApp: TelegramWebApp) {
  const platform = (webApp.platform || "").toLowerCase();
  if (["tdesktop", "web", "weba", "webk", "macos", "windows", "linux", "unknown"].includes(platform)) {
    return true;
  }

  return window.matchMedia?.("(min-width: 700px)").matches ?? false;
}

function initializeTelegram() {
  if (initializationStarted || typeof window === "undefined") return;
  initializationStarted = true;
  let attempts = 0;

  const initialize = () => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) {
      attempts += 1;
      if (attempts >= 40) {
        emit({ tg: null, initData: extractInitDataFromUrl(), isReady: true });
        return;
      }
      window.setTimeout(initialize, 250);
      return;
    }

    const supportsColors = telegramVersionAtLeast(webApp.version, "6.1");
    const supportsClosingConfirmation = telegramVersionAtLeast(webApp.version, "6.2");
    const supportsVerticalSwipes = telegramVersionAtLeast(webApp.version, "7.7");
    const shouldExpand = !isDesktopTelegram(webApp);

    const syncSafeArea = () => {
      const root = document.documentElement;
      const safe = webApp.safeAreaInset;
      const contentSafe = webApp.contentSafeAreaInset;
      // Не перезаписываем нулём: если SDK ещё не вернул значение (undefined),
      // Telegram мог уже выставить CSS-переменную самостоятельно — оставляем её.
      if (safe != null) {
        root.style.setProperty("--tg-safe-area-inset-top", `${safe.top ?? 0}px`);
        root.style.setProperty("--tg-safe-area-inset-bottom", `${safe.bottom ?? 0}px`);
      }
      if (contentSafe != null) {
        root.style.setProperty("--tg-content-safe-area-inset-top", `${contentSafe.top ?? 0}px`);
        root.style.setProperty("--tg-content-safe-area-inset-bottom", `${contentSafe.bottom ?? 0}px`);
      }
    };

    const expand = () => {
      try {
        if (shouldExpand && !webApp.isExpanded) webApp.expand();
      } catch {
        // Older clients can expose methods before they are fully available.
      }
    };

    try {
      webApp.ready();
      expand();
      syncSafeArea();
      if (supportsVerticalSwipes) webApp.disableVerticalSwipes?.();
      if (supportsClosingConfirmation) webApp.disableClosingConfirmation?.();
      if (supportsColors) {
        webApp.setHeaderColor?.("#0A0A0F");
        webApp.setBackgroundColor?.("#0A0A0F");
      }
    } catch {
      // Base WebApp functionality still works if optional methods fail.
    }

    if (shouldExpand) {
      window.setTimeout(expand, 300);
      window.setTimeout(expand, 1200);
    }
    // Повторная синхронизация: SDK может вернуть правильные inset-значения
    // позже (особенно при открытии из списка чатов, где появляется шапка «Закрыть»).
    window.setTimeout(syncSafeArea, 400);
    window.setTimeout(syncSafeArea, 1000);
    const onViewportChanged = () => {
      syncSafeArea();
      if (shouldExpand && !webApp.isExpanded) expand();
    };
    const onSafeAreaChanged = () => syncSafeArea();
    webApp.onEvent?.("viewportChanged", onViewportChanged);
    webApp.onEvent?.("safeAreaChanged", onSafeAreaChanged);
    webApp.onEvent?.("contentSafeAreaChanged", onSafeAreaChanged);

    emit({ tg: webApp, initData: readTelegramInitData(), isReady: true });
  };

  initialize();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  initializeTelegram();
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return sharedState;
}

function getServerSnapshot() {
  return SERVER_STATE;
}

export function useTelegram() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const tg = state.tg;
  return {
    tg,
    user: tg?.initDataUnsafe?.user ?? null,
    initData: state.initData,
    colorScheme: tg?.colorScheme ?? "dark",
    isReady: state.isReady,
    isTelegram: Boolean(tg),
    supportsBackButton: telegramVersionAtLeast(tg?.version, "6.1"),
  };
}
