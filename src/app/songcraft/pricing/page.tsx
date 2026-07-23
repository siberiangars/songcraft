"use client";

import { useEffect } from "react";
import { ArrowRight, AudioLines, Check, ImageIcon, Mic2, Sparkles, Video } from "lucide-react";
import { useTelegram } from "@/hooks/useTelegram";
import { ORDER_ADDONS, SONG_OFFER } from "@/lib/songcraft/config";

export default function PricingPage() {
  const { tg, supportsBackButton } = useTelegram();

  useEffect(() => {
    if (!supportsBackButton) return;
    const onBack = () => { window.location.href = "/songcraft"; };
    tg?.BackButton.show();
    tg?.BackButton.onClick(onBack);
    return () => { tg?.BackButton.offClick(onBack); tg?.BackButton.hide(); };
  }, [supportsBackButton, tg]);

  return (
    <div className="sc-shell sc-pricing-page sc-single-offer-page">
      <div className="sc-page-heading">
        <div><span className="sc-kicker">Один понятный формат</span><h1>Стоимость</h1></div>
        <span className="sc-premium-mark"><Sparkles size={19} /></span>
      </div>
      <p className="sc-page-lead">Получите три самостоятельных трека и выберите тот, который зацепил сильнее.</p>

      <section className="sc-single-offer">
        <div className="sc-single-offer-head">
          <span><AudioLines size={22} /></span>
          <div><small>Основной заказ</small><strong>{SONG_OFFER.name}</strong></div>
          <b><del>{SONG_OFFER.regularPrice} ₽</del>{SONG_OFFER.price} ₽</b>
        </div>
        <div className="sc-single-offer-features">
          <span className="sc-launch-price"><Sparkles size={15} /> Цена на запуске проекта</span>
          <span><Check size={15} /> Три разных текста и хука</span>
          <span><Check size={15} /> Три аранжировки и подачи</span>
          <span><Check size={15} /> Проверка произношения имён</span>
          <span><Check size={15} /> MP3 для скачивания и отправки</span>
        </div>
      </section>

      <div className="sc-section-heading"><div><Sparkles size={18} /><h2>Можно добавить</h2></div></div>
      <div className="sc-addon-preview-list">
        <span><ImageIcon size={19} /><strong>{ORDER_ADDONS.cover.name}</strong><b>+{ORDER_ADDONS.cover.price} ₽</b></span>
        <span><Video size={19} /><strong>{ORDER_ADDONS.video.name}</strong><b>+{ORDER_ADDONS.video.price} ₽</b></span>
        <span><Mic2 size={19} /><strong>{ORDER_ADDONS.spokenIntro.name}</strong><b>+{ORDER_ADDONS.spokenIntro.price} ₽</b></span>
      </div>

      <button className="sc-btn-primary sc-offer-cta" onClick={() => { window.location.href = "/songcraft/create"; }}>
        Собрать заказ <ArrowRight size={18} />
      </button>
    </div>
  );
}
