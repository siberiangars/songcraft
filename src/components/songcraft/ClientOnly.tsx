"use client";

import { useSyncExternalStore } from "react";

// Renders children ONLY on client — no SSR, no hydration, no mismatch.
// Telegram WebApp SDK modifies <html> before React loads → breaks hydration.
// Solution: don't hydrate at all — render fresh on client every time.
const subscribe = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ClientOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  if (!mounted) return <>{fallback ?? null}</>;
  return <>{children}</>;
}
