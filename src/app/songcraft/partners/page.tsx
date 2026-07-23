"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Gift, Send, UsersRound, WalletCards } from "lucide-react";
import { useTelegram } from "@/hooks/useTelegram";

interface MeDto { balance: number; referralLink: string; totalReferrals: number; referralEarned: number; }

export default function PartnersPage() {
  const { tg, initData, isReady, supportsBackButton } = useTelegram();
  const [me, setMe] = useState<MeDto | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!supportsBackButton) return;
    const onBack = () => { window.location.href = "/songcraft"; };
    tg?.BackButton.show(); tg?.BackButton.onClick(onBack);
    return () => { tg?.BackButton.offClick(onBack); tg?.BackButton.hide(); };
  }, [supportsBackButton, tg]);
  useEffect(() => {
    if (!isReady || !initData) return;
    fetch("/api/songcraft/users/me", { headers: { "x-telegram-init-data": initData } }).then((r) => r.ok ? r.json() : null).then(setMe).catch(() => null);
  }, [isReady, initData]);

  const earnedRub = useMemo(() => Math.floor((me?.referralEarned ?? 0) / 100), [me]);
  const copyLink = async () => {
    if (!me?.referralLink) return;
    await navigator.clipboard.writeText(me.referralLink).catch(() => null);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  const share = () => {
    if (!me?.referralLink) return;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(me.referralLink)}&text=${encodeURIComponent("Создай персональный трек в SongCraft")}`, "_blank", "noopener,noreferrer");
  };

  return <div className="sc-shell sc-partners-page">
    <div className="sc-page-heading"><div><span className="sc-kicker">Партнёрская программа</span><h1>Приглашайте друзей</h1></div><span className="sc-premium-mark"><Gift size={19} /></span></div>
    <p className="sc-page-lead">Получайте 200 ₽, когда друг использует свой стартовый баланс.</p>
    <div className="sc-referral-stats"><div><UsersRound size={19} /><span><strong>{me?.totalReferrals ?? 0}</strong><small>друзей</small></span></div><div><WalletCards size={19} /><span><strong>{earnedRub} ₽</strong><small>начислено</small></span></div></div>
    <section className="sc-referral-flow"><h2>Как это работает</h2><ol><li><span>1</span><div><strong>Отправьте ссылку</strong><small>Друг откроет бота по вашему приглашению.</small></div></li><li><span>2</span><div><strong>Друг создаст треки</strong><small>Он использует подарочные 300 ₽.</small></div></li><li><span>3</span><div><strong>Получите 200 ₽</strong><small>Бонус автоматически появится на балансе.</small></div></li></ol></section>
    <section className="sc-link-box"><span className="sc-field-label">Ваша ссылка</span><p>{me?.referralLink ?? "Загрузка..."}</p><div><button className="sc-btn-ghost" onClick={copyLink}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "Скопировано" : "Копировать"}</button><button className="sc-btn-primary" onClick={share}><Send size={17} /> Поделиться</button></div></section>
  </div>;
}
