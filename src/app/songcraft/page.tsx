"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CircleHelp,
  FilePenLine,
  Gift,
  Library,
  MessageSquareText,
  Mic2,
  Music2,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { useTelegram } from "@/hooks/useTelegram";

interface MeDto {
  balance: number;
  totalOrders: number;
  completedOrders: number;
  readyTracks: number;
  referralCode: string;
}

export default function HomePage() {
  const { tg, initData, isReady, supportsBackButton } = useTelegram();
  const [me, setMe] = useState<MeDto | null>(null);

  useEffect(() => {
    if (supportsBackButton) tg?.BackButton.hide();
  }, [supportsBackButton, tg]);

  useEffect(() => {
    if (!isReady || !initData) return;
    fetch("/api/songcraft/users/me", { headers: { "x-telegram-init-data": initData } })
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => null);
  }, [isReady, initData]);

  const balanceRub = useMemo(() => (me ? Math.floor(me.balance / 100) : null), [me]);
  const totalOrders = me?.totalOrders ?? 0;
  const completedOrders = me?.completedOrders ?? 0;
  const readyTracks = me?.readyTracks ?? 0;

  const trackEvent = (event: string, metadata?: Record<string, unknown>) => {
    if (!initData) return;
    fetch("/api/songcraft/marketing/track", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-telegram-init-data": initData },
      body: JSON.stringify({ event, path: window.location.pathname, source: "miniapp", metadata }),
    }).catch(() => null);
  };

  return (
    <div className="sc-shell sc-home">
      <section className="sc-home-hero" aria-label="SongCraft">
        <img src="/songcraft-hero-neon-cut.png" alt="" />
        <div className="sc-home-hero-copy">
          <span>Песня в подарок</span>
          <h2>Создайте трек, который тронет человека</h2>
          <p>Расскажите пару деталей, а сервис подготовит 3 версии с разным звучанием.</p>
        </div>
      </section>

      <button className="sc-balance-strip" onClick={() => { window.location.href = "/songcraft/balance"; }}>
        <span className="sc-icon-box"><WalletCards size={20} /></span>
        <span className="sc-balance-copy">
          <small>Доступно</small>
          <strong>{balanceRub === null ? "Загрузка..." : `${balanceRub.toLocaleString("ru-RU")} ₽`}</strong>
        </span>
        <span className="sc-balance-action">Пополнить <ArrowRight size={16} /></span>
      </button>

      <button className="sc-primary-action" onClick={() => { trackEvent("create_cta_click"); window.location.href = "/songcraft/create"; }}>
        <span className="sc-icon-box dark"><Music2 size={22} /></span>
        <span><strong>Создать трек</strong><small>Первый результат через несколько минут</small></span>
        <ArrowRight size={20} />
      </button>

      <div className="sc-metrics" aria-label="Статистика">
        <div><strong>{totalOrders}</strong><span>заказов</span></div>
        <div><strong>{completedOrders}</strong><span>готово</span></div>
        <div><strong>{readyTracks}</strong><span>версий</span></div>
      </div>

      <section className="sc-section">
        <div className="sc-section-heading"><h2>Быстрый доступ</h2></div>
        <div className="sc-quick-grid">
          <button onClick={() => { window.location.href = "/songcraft/songs"; }}><Library size={20} /><span><strong>Мои треки</strong><small>История и файлы</small></span><ArrowRight size={16} /></button>
          <button onClick={() => { window.location.href = "/songcraft/pricing"; }}><Sparkles size={20} /><span><strong>Стоимость</strong><small>3 трека и дополнения</small></span><ArrowRight size={16} /></button>
          <button onClick={() => { window.location.href = "/songcraft/partners"; }}><Gift size={20} /><span><strong>Пригласить</strong><small>200 ₽ за друга</small></span><ArrowRight size={16} /></button>
          <button onClick={() => { window.location.href = "/songcraft/create?drafts=1"; }}><FilePenLine size={20} /><span><strong>Черновики</strong><small>Истории и тексты</small></span><ArrowRight size={16} /></button>
        </div>
      </section>

      <section className="sc-home-guide">
        <div className="sc-section-heading"><h2>Как получить сильный трек</h2></div>
        <div className="sc-guide-steps">
          <div><span><MessageSquareText size={18} /></span><p><strong>Дайте живые детали</strong><small>Фраза, привычка, место или момент, который узнает только ваш человек.</small></p></div>
          <div><span><Sparkles size={18} /></span><p><strong>Скажите главное</strong><small>Что он должен почувствовать и какую мысль унести после припева.</small></p></div>
          <div><span><Mic2 size={18} /></span><p><strong>Проверьте имя и подачу</strong><small>Укажите ударение, голос и настроение. Текст можно поправить до оплаты.</small></p></div>
        </div>
      </section>

      <section className="sc-viral-card">
        <span><Gift size={20} /></span>
        <div>
          <small>Подарок работает сам</small>
          <strong>Получатель увидит аккуратную страницу трека</strong>
          <p>В ней есть подпись SongCraft и кнопка “Создать свой трек”, а за приглашенного друга вы получите 200 ₽ после его первого заказа.</p>
        </div>
        <button type="button" onClick={() => { trackEvent("referral_cta_click", { place: "home_viral_card" }); window.location.href = "/songcraft/partners"; }}>
          Пригласить
        </button>
      </section>

      <section className="sc-help-links" aria-label="Поддержка и документы">
        <a href="https://t.me/helpv3techbot" target="_blank" rel="noreferrer">
          <CircleHelp size={19} />
          <span><strong>Поддержка</strong><small>@helpv3techbot</small></span>
          <ArrowRight size={16} />
        </a>
        <button type="button" onClick={() => { window.location.href = "/songcraft/privacy"; }}>
          <ShieldCheck size={19} />
          <span><strong>Конфиденциальность</strong><small>Как мы защищаем данные</small></span>
          <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}
