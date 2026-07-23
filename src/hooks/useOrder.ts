"use client";

import { useCallback, useState } from "react";
import { useTelegram } from "./useTelegram";
import { useOrderStore } from "@/store/orderStore";

interface OrderResult {
  orderId: number;
  status: string;
  free: boolean;
  message?: string;
}

export function useOrder() {
  const { initData } = useTelegram();
  const draft = useOrderStore((s) => s.draft);
  const resetDraft = useOrderStore((s) => s.resetDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveInitData = useCallback(() => {
    if (initData) return initData;
    if (typeof window === "undefined") return "";

    const fromSdk = window.Telegram?.WebApp?.initData;
    if (fromSdk) return fromSdk;

    const fromSearch = new URLSearchParams(window.location.search).get("tgWebAppData");
    if (fromSearch) return fromSearch;

    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    return new URLSearchParams(hash).get("tgWebAppData") ?? "";
  }, [initData]);

  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    "x-telegram-init-data": resolveInitData(),
  }), [resolveInitData]);

  const submitOrder = async (): Promise<OrderResult | null> => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/songcraft/orders", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          plan: draft.plan,
          recipientName: draft.recipientName,
          occasion: draft.occasion,
          userText: draft.userText,
          genre: draft.genre,
          mood: draft.mood,
          voiceType: draft.voiceType,
          style: draft.style,
          tempo: draft.tempo,
          language: draft.language,
        }),
      });
      const data = await res.json() as OrderResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка создания заказа");
      resetDraft();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchOrder = async (orderId: number) => {
    try {
      const res = await fetch(`/api/songcraft/orders/${orderId}`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  };

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/songcraft/orders", { headers: authHeaders() });
      if (!res.ok) return [];
      return res.json();
    } catch { return []; }
  }, [authHeaders]);

  const deleteOrder = useCallback(async (orderId: number) => {
    const res = await fetch(`/api/songcraft/orders/${orderId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Не удалось удалить попытку");
  }, [authHeaders]);

  const fetchMe = async () => {
    try {
      const res = await fetch("/api/songcraft/users/me", { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  };

  return { submitOrder, fetchOrder, fetchOrders, deleteOrder, fetchMe, isSubmitting, error };
}
