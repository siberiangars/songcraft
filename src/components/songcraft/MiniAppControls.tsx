"use client";

import { useTelegram } from "@/hooks/useTelegram";

export function MiniAppControls() {
  const { tg, isTelegram } = useTelegram();

  const expand = () => {
    try {
      tg?.expand();
    } catch {
      // no-op
    }
  };

  const close = () => {
    try {
      if (tg) {
        tg.close();
        return;
      }
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      window.location.href = "https://t.me/";
    } catch {
      // no-op
    }
  };

  return (
    <div style={{ position: "fixed", right: 12, bottom: 88, zIndex: 220, display: "flex", gap: 8, opacity: isTelegram ? 1 : 0.9 }}>
      <button
        onClick={expand}
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          border: "1px solid rgba(201,168,76,0.35)",
          background: "rgba(18,18,26,0.95)",
          color: "#E8C96A",
          fontSize: 16,
        }}
        aria-label="Развернуть"
      >
        ↗
      </button>
      <button
        onClick={close}
        style={{
          height: 38,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(18,18,26,0.95)",
          color: "#F0EBE0",
          padding: "0 12px",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Закрыть
      </button>
    </div>
  );
}
