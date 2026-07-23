"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Film,
  ImageIcon,
  LoaderCircle,
  Mic2,
  Music2,
  ReceiptText,
  RotateCcw,
  Sparkles,
  Video,
} from "lucide-react";
import { readTelegramInitData, useTelegram } from "@/hooks/useTelegram";
import { useOrder } from "@/hooks/useOrder";
import { MusicPlayer } from "@/components/songcraft/MusicPlayer";
import { ORDER_ADDONS } from "@/lib/songcraft/config";
import { SpokenIntroRecorder } from "@/components/songcraft/SpokenIntroRecorder";
import { GiftPhotoUploader } from "@/components/songcraft/GiftPhotoUploader";
import {
  SlideshowPhotoUploader,
  SLIDESHOW_MIN_PHOTOS,
} from "@/components/songcraft/SlideshowPhotoUploader";

interface Song {
  id: number;
  shareToken: string;
  title: string;
  audioUrl: string;
  imageUrl?: string | null;
  duration?: number | null;
  wavUrl?: string | null;
  vocalUrl?: string | null;
  instrumentalUrl?: string | null;
  lyricsJson?: string | null;
}

interface OrderData {
  id: number;
  status: string;
  plan: string;
  amount: number;
  progress: number;
  progressStage?: string | null;
  progressMessage?: string | null;
  selectedSongId?: number | null;
  recipientName: string;
  occasion: string;
  genre: string;
  addCover: boolean;
  giftPhotoToken?: string | null;
  addVideo: boolean;
  addSpokenIntro: boolean;
  coverUrl?: string | null;
  videoUrl?: string | null;
  createdAt: string;
  song?: Song | null;
  songs?: Song[];
}

const STATUS_INFO: Record<string, { label: string; description: string; type: "wait" | "success" | "error" }> = {
  PENDING: { label: "Ожидает оплаты", description: "Завершите оплату, чтобы начать создание треков", type: "wait" },
  PAID: { label: "Заказ принят", description: "Ставим проект в очередь", type: "wait" },
  ENHANCING: { label: "Работаем над текстом", description: "Выстраиваем историю, рифму и произношение", type: "wait" },
  GENERATING: { label: "Создаем три версии", description: "Для каждой версии подбираем отдельную подачу", type: "wait" },
  AWAITING_SELECTION: { label: "Треки готовы", description: "Послушайте все версии и выберите лучшую", type: "success" },
  CREATING_VIDEO: { label: "Собираем клип", description: "Синхронизируем фотографии с выбранным треком", type: "wait" },
  FINISHING: { label: "Готовим материалы", description: "Собираем выбранный трек и дополнительные файлы", type: "wait" },
  VIDEO_FAILED: { label: "Клип не собрался", description: "Треки сохранены. Можно повторить запуск", type: "error" },
  COMPLETED: { label: "Проект готов", description: "Слушайте, скачивайте и делитесь", type: "success" },
  FAILED: { label: "Не удалось создать", description: "Средства будут возвращены автоматически", type: "error" },
  REFUNDING: { label: "Возвращаем оплату", description: "Возврат отправлен в платежную систему", type: "wait" },
  REFUNDED: { label: "Средства возвращены", description: "Баланс уже обновлен", type: "error" },
};

const PROCESSING = new Set(["PAID", "ENHANCING", "GENERATING", "CREATING_VIDEO", "FINISHING"]);
const SHOW_TRACKS = new Set(["AWAITING_SELECTION", "FINISHING", "CREATING_VIDEO", "VIDEO_FAILED", "COMPLETED"]);

const ACTIVE_PROGRESS_COPY: Record<string, string[]> = {
  PAID: [
    "Проверяем оплату и ставим заказ в работу",
    "Подготавливаем студию для вашего трека",
    "Собираем параметры заказа",
  ],
  ENHANCING: [
    "Продумываем сценарий песни",
    "Подбираем слова, которые будут звучать естественно",
    "Усиливаем рифму и припев",
    "Проверяем имена и ударения",
  ],
  GENERATING: [
    "Передаем задачу на музыкальную генерацию",
    "Собираем первую версию трека",
    "Проверяем, чтобы версии отличались по подаче",
    "Ждем готовые аудиофайлы",
  ],
  CREATING_VIDEO: [
    "Раскладываем фотографии по сценам",
    "Синхронизируем кадры с выбранным треком",
    "Собираем клип в финальный файл",
  ],
  FINISHING: [
    "Проверяем готовые файлы",
    "Готовим ссылки для прослушивания и скачивания",
    "Финализируем заказ",
  ],
};

const ACTIVE_PROGRESS_CAP: Record<string, number> = {
  PAID: 18,
  ENHANCING: 48,
  GENERATING: 88,
  CREATING_VIDEO: 94,
  FINISHING: 98,
};

function estimateRemaining(status: string, progress: number) {
  if (status === "PAID" || status === "ENHANCING") return "Осталось примерно 7-10 минут";
  if (status === "GENERATING") return progress >= 65 ? "Осталось примерно 2-4 минуты" : "Осталось примерно 4-7 минут";
  if (status === "CREATING_VIDEO") return "Осталось примерно 2-5 минут";
  if (status === "FINISHING") return "Осталось примерно 1-3 минуты";
  return null;
}

function getActiveProgressMessage(status: string, tick: number, fallback: string) {
  const messages = ACTIVE_PROGRESS_COPY[status];
  if (!messages?.length) return fallback;
  return messages[tick % messages.length];
}

function getLiveProgress(status: string, progress: number, tick: number) {
  if (!PROCESSING.has(status)) return progress;
  const cap = Math.max(progress, ACTIVE_PROGRESS_CAP[status] ?? 96);
  return Math.min(cap, progress + Math.min(18, (tick + 1) * 2));
}

function getProgressDots(tick: number) {
  return Array.from({ length: 5 }, (_, index) => index === tick % 5);
}

export default function OrderStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { tg, initData, isReady, supportsBackButton } = useTelegram();
  const { fetchOrder } = useOrder();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectingSongId, setSelectingSongId] = useState<number | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [addCover, setAddCover] = useState(false);
  const [giftPhotoToken, setGiftPhotoToken] = useState<string | null>(null);
  const [addVideo, setAddVideo] = useState(false);
  const [addSpokenIntro, setAddSpokenIntro] = useState(false);
  const [videoPhotoTokens, setVideoPhotoTokens] = useState<string[]>([]);
  const [spokenIntroToken, setSpokenIntroToken] = useState<string | null>(null);
  const [addonsBusy, setAddonsBusy] = useState(false);
  const [addonsError, setAddonsError] = useState<string | null>(null);
  const [activityTick, setActivityTick] = useState(0);

  useEffect(() => {
    if (!supportsBackButton) return;
    const onBack = () => { window.location.href = "/songcraft/songs"; };
    tg?.BackButton.show();
    tg?.BackButton.onClick(onBack);
    return () => {
      tg?.BackButton.offClick(onBack);
      tg?.BackButton.hide();
    };
  }, [supportsBackButton, tg]);

  const load = useCallback(async () => {
    const data = await fetchOrder(Number(id));
    if (data) {
      setOrder(data as OrderData);
      setNotFound(false);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }, [fetchOrder, id]);

  useEffect(() => {
    if (!isReady || !(initData || readTelegramInitData())) return;
    void load();
    const interval = window.setInterval(() => {
      if (!order || PROCESSING.has(order.status)) void load();
    }, 3500);
    return () => window.clearInterval(interval);
  }, [initData, isReady, load, order?.status]);

  useEffect(() => {
    if (!order || !PROCESSING.has(order.status)) return;
    setActivityTick(0);
    const interval = window.setInterval(() => {
      setActivityTick((value) => value + 1);
    }, 2200);
    return () => window.clearInterval(interval);
  }, [order?.id, order?.status]);

  const selectSong = useCallback(async (songId: number) => {
    setSelectingSongId(songId);
    setSelectionError(null);
    try {
      const response = await fetch(`/api/songcraft/orders/${id}/select`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": initData || readTelegramInitData(),
        },
        body: JSON.stringify({ songId }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось выбрать трек");
      await load();
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Не удалось выбрать трек");
    } finally {
      setSelectingSongId(null);
    }
  }, [id, initData, load]);

  const submitAddons = useCallback(async () => {
    setAddonsError(null);
    if (!addCover && !addVideo && !addSpokenIntro) {
      setAddonsError("Выберите хотя бы одну дополнительную услугу");
      return;
    }
    if (addVideo && videoPhotoTokens.length < SLIDESHOW_MIN_PHOTOS) {
      setAddonsError(`Для клипа загрузите минимум ${SLIDESHOW_MIN_PHOTOS} фото`);
      return;
    }
    if (addSpokenIntro && !spokenIntroToken) {
      setAddonsError("Запишите голосовое поздравление");
      return;
    }
    if (addCover && !giftPhotoToken) {
      setAddonsError("Загрузите фото для обложки подарка");
      return;
    }
    setAddonsBusy(true);
    try {
      const response = await fetch(`/api/songcraft/orders/${id}/addons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": initData || readTelegramInitData(),
        },
        body: JSON.stringify({
          addCover,
          giftPhotoToken: addCover ? giftPhotoToken : null,
          addVideo,
          videoPhotoTokens: addVideo ? videoPhotoTokens : [],
          addSpokenIntro,
          spokenIntroToken: addSpokenIntro ? spokenIntroToken : null,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось оформить дополнительные материалы");
      await load();
    } catch (error) {
      setAddonsError(error instanceof Error ? error.message : "Не удалось оформить дополнительные материалы");
    } finally {
      setAddonsBusy(false);
    }
  }, [addCover, addSpokenIntro, addVideo, giftPhotoToken, id, initData, load, spokenIntroToken, videoPhotoTokens]);

  const songs = useMemo(
    () => order?.songs?.length ? order.songs : order?.song ? [order.song] : [],
    [order]
  );

  if (loading) return <div className="sc-shell sc-empty-state"><LoaderCircle className="sc-spin" size={26} />Загружаем заказ</div>;
  if (notFound && !order) return <div className="sc-shell sc-empty-state"><AlertCircle size={26} /><strong>Заказ не найден</strong></div>;
  if (!order) return null;

  const info = STATUS_INFO[order.status] ?? { label: order.status, description: "", type: "wait" as const };
  const StatusIcon = info.type === "success" ? CheckCircle2 : info.type === "error" ? AlertCircle : Clock3;
  const progress = Math.max(0, Math.min(100, order.progress ?? (order.status === "COMPLETED" ? 100 : 0)));
  const displayProgress = getLiveProgress(order.status, progress, activityTick);
  const activeProgressMessage = getActiveProgressMessage(order.status, activityTick, order.progressMessage || info.description);
  const progressDots = getProgressDots(activityTick);
  const estimate = estimateRemaining(order.status, progress);
  const canSelect = order.status === "AWAITING_SELECTION" || order.status === "VIDEO_FAILED";
  const hasExtras = order.addSpokenIntro || order.addCover || order.addVideo;
  const canOfferAddons = order.status === "COMPLETED" && Boolean(order.selectedSongId) && !hasExtras && !order.coverUrl && !order.videoUrl;
  const addonsTotal =
    (addCover ? ORDER_ADDONS.cover.price : 0) +
    (addVideo ? ORDER_ADDONS.video.price : 0) +
    (addSpokenIntro ? ORDER_ADDONS.spokenIntro.price : 0);
  const productionStep = order.addVideo ? "Шаг 5 из 5" : hasExtras ? "Шаг 4 из 4" : "Шаг 3 из 3";
  const selectionTarget = hasExtras ? "для финального заказа" : "как финальный";
  const makeDownloadUrl = (url: string) => `${url}${url.includes("?") ? "&" : "?"}download=1`;
  const openDownload = (url: string) => {
    const downloadUrl = makeDownloadUrl(url);
    const webApp = tg as unknown as { openLink?: (link: string, options?: { try_instant_view?: boolean }) => void };
    if (webApp?.openLink) {
      webApp.openLink(downloadUrl, { try_instant_view: false });
      return;
    }
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="sc-shell sc-order-page">
      <section className={`sc-order-status ${info.type}`}>
        <span><StatusIcon size={23} /></span>
        <div><small>Заказ #{order.id}</small><strong>{info.label}</strong><p>{PROCESSING.has(order.status) ? activeProgressMessage : order.progressMessage || info.description}</p></div>
        {PROCESSING.has(order.status) && <LoaderCircle className="sc-spin" size={18} />}
      </section>

      {(PROCESSING.has(order.status) || order.status === "AWAITING_SELECTION") && (
        <section className="sc-generation-progress" aria-live="polite">
          <div className="sc-progress-head">
            <span>{order.status === "AWAITING_SELECTION" ? "Шаг 2: выбор версии" : order.status === "CREATING_VIDEO" || order.status === "FINISHING" ? productionStep : "Шаг 1: пишем треки"}</span>
            <strong>{displayProgress}%</strong>
          </div>
          <div className={`sc-progress-track ${PROCESSING.has(order.status) ? "active" : ""}`}><span style={{ width: `${displayProgress}%` }} /></div>
          {PROCESSING.has(order.status) && (
            <div className="sc-progress-live-copy">
              <span>{activeProgressMessage}</span>
              <div aria-hidden="true">
                {progressDots.map((active, index) => <i key={index} className={active ? "active" : ""} />)}
              </div>
            </div>
          )}
          {estimate && <small>{estimate}</small>}
        </section>
      )}

      <div className="sc-order-meta">
        <span><ReceiptText size={16} />Заказ <strong>3 трека · {(order.amount / 100).toLocaleString("ru-RU")} ₽</strong></span>
        <span><Music2 size={16} />Жанр <strong>{order.genre || "-"}</strong></span>
      </div>

      {canSelect && (
        <section className="sc-next-step">
          <span><Film size={20} /></span>
          <div>
            <small>Шаг 2</small>
            <strong>Выберите лучшую версию</strong>
            <p>Послушайте все 3 трека. После выбора можно добавить голосовое вступление, обложку и клип.</p>
          </div>
        </section>
      )}

      {canSelect && hasExtras && (
        <section className="sc-flow-steps" aria-label="Этапы заказа">
          {order.addSpokenIntro && <span><Mic2 size={15} /> Голосовое поздравление в начало</span>}
          {order.addCover && <span><ImageIcon size={15} /> Обложка для публикации</span>}
          {order.addVideo && <span><Video size={15} /> Клип-слайдшоу из ваших фото</span>}
        </section>
      )}

      {SHOW_TRACKS.has(order.status) && (
        <div className="sc-version-list">
          {songs.map((song, index) => {
            const selected = order.selectedSongId === song.id;
            return (
              <section key={song.id} className={`sc-version-card ${selected ? "selected" : ""}`}>
                <div className="sc-version-title">
                  <span>Версия {index + 1}</span>
                  {selected && <em><Check size={12} /> Выбрана</em>}
                </div>
                <MusicPlayer song={song} recipientName={order.recipientName} plan={order.plan} />
                {canSelect && (
                  <button
                    className="sc-select-track"
                    disabled={selectingSongId !== null}
                    onClick={() => void selectSong(song.id)}
                  >
                    {selectingSongId === song.id ? <LoaderCircle className="sc-spin" size={17} /> : <Film size={17} />}
                    Выбрать эту версию {selectionTarget}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {selectionError && <div className="sc-inline-error"><AlertCircle size={16} />{selectionError}</div>}

      {canOfferAddons && (
        <>
          <section className="sc-track-ready-note">
            <span><CheckCircle2 size={20} /></span>
            <div>
              <small>??????? ?????????</small>
              <strong>???? ??? ?????</strong>
              <p>??? ????? ???????, ??????? ??? ????????? ????? ?????? ? ?????? ????. ?????????????? ????????? ???? ? ?????? ?? ???????.</p>
            </div>
          </section>

          <section className="sc-addons-panel">
            <div className="sc-addons-head">
              <span><Sparkles size={18} /></span>
              <div>
                <small>?? ???????</small>
                <strong>???????? ?????????? ? ???????</strong>
                <p>????? ???????? ?????? ??????? ???? ??? ???????? ???? ?? ?????. ??? ???? ?? ????: ?? ????-??????? ?? ?????.</p>
              </div>
            </div>

            <div className="sc-addon-list compact">
              <button type="button" className={`sc-addon-row ${addCover ? "selected" : ""}`} onClick={() => setAddCover((value) => !value)}>
                <span className="sc-addon-icon"><ImageIcon size={20} /></span>
                <span><strong>{ORDER_ADDONS.cover.name}</strong><small>???????????: 1 ???? ?????? ???????? ????? ? ???????? ???????</small></span>
                <b>+{ORDER_ADDONS.cover.price} ?</b>
                <span className="sc-addon-check">{addCover && <Check size={14} />}</span>
              </button>
              {addCover && (
                <GiftPhotoUploader
                  initData={initData || readTelegramInitData()}
                  token={giftPhotoToken}
                  onChange={setGiftPhotoToken}
                />
              )}

              <button type="button" className={`sc-addon-row ${addSpokenIntro ? "selected" : ""}`} onClick={() => setAddSpokenIntro((value) => !value)}>
                <span className="sc-addon-icon"><Mic2 size={20} /></span>
                <span><strong>{ORDER_ADDONS.spokenIntro.name}</strong><small>???????????: ???????? ?????? ???????????? ????? ???????</small></span>
                <b>+{ORDER_ADDONS.spokenIntro.price} ?</b>
                <span className="sc-addon-check">{addSpokenIntro && <Check size={14} />}</span>
              </button>
              {addSpokenIntro && (
                <SpokenIntroRecorder initData={initData || readTelegramInitData()} token={spokenIntroToken} onUploaded={setSpokenIntroToken} />
              )}

              <button type="button" className={`sc-addon-row ${addVideo ? "selected" : ""}`} onClick={() => setAddVideo((value) => !value)}>
                <span className="sc-addon-icon"><Video size={20} /></span>
                <span><strong>{ORDER_ADDONS.video.name}</strong><small>???????????: ????-???????? ?? ????? ???? ??? ??????? ????</small></span>
                <b>+{ORDER_ADDONS.video.price} ?</b>
                <span className="sc-addon-check">{addVideo && <Check size={14} />}</span>
              </button>
              {addVideo && (
                <SlideshowPhotoUploader initData={initData || readTelegramInitData()} tokens={videoPhotoTokens} onChange={setVideoPhotoTokens} />
              )}
            </div>

            {addonsError && <div className="sc-inline-error"><AlertCircle size={16} />{addonsError}</div>}
            <button
              type="button"
              className="sc-select-track"
              disabled={addonsBusy || addonsTotal <= 0}
              onClick={() => void submitAddons()}
            >
              {addonsBusy ? <LoaderCircle className="sc-spin" size={17} /> : <CheckCircle2 size={17} />}
              {addonsTotal > 0 ? `???????? ????????? ???? ?? ${addonsTotal.toLocaleString("ru-RU")} ?` : "???? ?????????????: ????????, ???? ?????"}
            </button>
          </section>
        </>
      )}

      {order.status === "CREATING_VIDEO" && (
        <section className="sc-next-step active">
          <span><Video size={20} /></span>
          <div><small>{productionStep}</small><strong>Клип уже в монтаже</strong><p>Можно закрыть приложение. Мы пришлем сообщение, когда видео будет готово.</p></div>
        </section>
      )}

      {order.status === "FINISHING" && (
        <section className="sc-next-step active">
          <span><CheckCircle2 size={20} /></span>
          <div><small>{productionStep}</small><strong>Финализируем выбранный трек</strong><p>Добавляем купленные материалы и проверяем файлы перед выдачей.</p></div>
        </section>
      )}

      {order.status === "COMPLETED" && (order.coverUrl || order.videoUrl) && (
        <section className="sc-order-deliverables">
          <h2>{order.videoUrl ? "Ваш клип готов" : "Дополнительные материалы"}</h2>
          {order.coverUrl && <button type="button" onClick={() => openDownload(order.coverUrl!)}><ImageIcon size={18} /><span><strong>Скачать обложку</strong><small>Готовое квадратное изображение</small></span><Download size={17} /></button>}
          {order.videoUrl && <button type="button" className="primary" onClick={() => openDownload(order.videoUrl!)}><Video size={18} /><span><strong>Скачать клип</strong><small>Откроется download-ссылка</small></span><Download size={17} /></button>}
        </section>
      )}

      {(order.status === "FAILED" || order.status === "REFUNDED") && (
        <button className="sc-btn-ghost sc-retry-button" onClick={() => { window.location.href = "/songcraft/create"; }}><RotateCcw size={17} /> Создать новый проект</button>
      )}
    </div>
  );
}
