"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard, ShieldCheck, WalletCards } from "lucide-react";
import { readTelegramInitData, useTelegram } from "@/hooks/useTelegram";

interface MeDto { balance: number; }
const PRESET_AMOUNTS = [199, 299, 399, 1000, 2000];

export default function BalancePage() {
  const { tg, initData, isReady, supportsBackButton } = useTelegram();
  const [me, setMe] = useState<MeDto | null>(null);
  const [amountRub, setAmountRub] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supportsBackButton) return;
    const onBack = () => { window.location.href = "/songcraft"; };
    tg?.BackButton.show();
    tg?.BackButton.onClick(onBack);
    return () => { tg?.BackButton.offClick(onBack); tg?.BackButton.hide(); };
  }, [supportsBackButton, tg]);
  useEffect(() => { if (!isReady || !initData) return; fetch("/api/songcraft/users/me", { headers: { "x-telegram-init-data": initData } }).then((r) => r.ok ? r.json() : null).then(setMe).catch(() => null); }, [isReady, initData]);
  const balanceRub = useMemo(() => Math.floor((me?.balance ?? 0) / 100), [me]);

  const topup = async () => {
    setLoading(true); setError(""); setMessage("");
    try {
      const authData = initData || readTelegramInitData();
      if (!authData) throw new Error("Не удалось подтвердить вход. Закройте мини-приложение и откройте его кнопкой из бота.");
      const response = await fetch("/api/songcraft/balance/topup", { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-init-data": authData }, body: JSON.stringify({ method: "sbp", amountRub }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ошибка пополнения");
      if (data.confirmationUrl) {
        if (tg?.openLink) tg.openLink(data.confirmationUrl, { try_instant_view: false });
        else window.open(data.confirmationUrl, "_blank", "noopener,noreferrer");
        setMessage("Оплата открыта в отдельном окне. После завершения вернитесь сюда.");
        return;
      }
      else setMessage("Платёж создан. Продолжите оплату в ЮKassa.");
    } catch (cause: unknown) { setError((cause as Error).message || "Ошибка пополнения"); }
    finally { setLoading(false); }
  };

  return <div className="sc-shell sc-balance-page">
    <div className="sc-page-heading"><div><span className="sc-kicker">Кошелёк</span><h1>Баланс</h1></div><span className="sc-premium-mark"><WalletCards size={19} /></span></div>
    <div className="sc-balance-hero"><span>Доступно</span><strong>{balanceRub.toLocaleString("ru-RU")} ₽</strong><small>Средства доступны для всех тарифов</small></div>
    <section className="sc-form-section"><span className="sc-field-label">Сумма пополнения</span><div className="sc-amount-grid">{PRESET_AMOUNTS.map((amount) => <button key={amount} className={amountRub === amount ? "selected" : ""} onClick={() => setAmountRub(amount)}>{amount.toLocaleString("ru-RU")} ₽</button>)}</div><label className="sc-amount-input"><span>Своя сумма</span><input type="number" min={10} max={50000} value={amountRub} onChange={(event) => setAmountRub(Math.max(10, Math.min(50000, Number(event.target.value || 0))))} /><em>₽</em></label></section>
    <section className="sc-form-section"><span className="sc-field-label">Способ оплаты</span><div className="sc-payment-methods"><button className="selected" type="button"><CreditCard size={20} /><span><strong>СБП</strong><small>Быстрая оплата через ЮKassa</small></span></button></div></section>
    {message && <div className="sc-success-banner">{message}</div>}{error && <div className="sc-error-banner">{error}</div>}
    <button className="sc-btn-primary sc-topup-button" disabled={loading} onClick={topup}>{loading ? "Создаём платёж..." : `Пополнить на ${amountRub.toLocaleString("ru-RU")} ₽`}</button>
    <div className="sc-secure-note"><ShieldCheck size={16} /> Платёжные данные обрабатывает платёжный сервис</div>
  </div>;
}
