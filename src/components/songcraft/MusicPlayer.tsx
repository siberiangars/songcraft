"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  Download,
  FileAudio,
  LoaderCircle,
  Mic2,
  Music2,
  Pause,
  Play,
  Repeat2,
  RotateCcw,
  RotateCw,
  Scissors,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import { useAudio, formatTime } from "@/hooks/useAudio";
import { readTelegramInitData } from "@/hooks/useTelegram";

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

type Tool = "lyrics" | "replace" | "cover" | "extend" | "files" | null;

function downloadUrl(url: string, filename: string) {
  if (url.startsWith("/api/songcraft/media/")) {
    return `${url}${url.includes("?") ? "&" : "?"}download=1`;
  }
  return `/api/songcraft/audio?src=${encodeURIComponent(url)}&download=1&name=${encodeURIComponent(filename)}`;
}

function playableUrl(url: string) {
  return url.startsWith("/api/songcraft/media/")
    ? url
    : `/api/songcraft/audio?src=${encodeURIComponent(url)}`;
}

function sourceLyrics(value?: string | null) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value) as { source?: string };
    return parsed.source ?? "";
  } catch {
    return "";
  }
}

export function MusicPlayer({
  song,
  recipientName,
  plan,
}: {
  song: Song;
  recipientName?: string;
  plan: string;
}) {
  const audioUrl = playableUrl(song.audioUrl);
  const fileName = `${song.title || "songcraft-track"}.mp3`;
  const {
    isPlaying,
    currentTime,
    duration,
    progress,
    togglePlay,
    seek,
    seekByPercent,
  } = useAudio(audioUrl);
  const [tool, setTool] = useState<Tool>(null);
  const [processing, setProcessing] = useState<{ id: number; type: string } | null>(null);
  const [actionError, setActionError] = useState("");
  const [replaceStart, setReplaceStart] = useState(0);
  const [replaceEnd, setReplaceEnd] = useState(15);
  const [replacementLyrics, setReplacementLyrics] = useState("");
  const [newStyle, setNewStyle] = useState("");
  const [extensionPrompt, setExtensionPrompt] = useState("");
  const lyrics = useMemo(() => sourceLyrics(song.lyricsJson), [song.lyricsJson]);
  const canEdit = plan === "STANDARD" || plan === "PREMIUM";
  const canWav = canEdit;
  const canStems = plan === "PREMIUM";

  useEffect(() => {
    if (!processing) return;
    const authData = readTelegramInitData();
    const poll = async () => {
      const response = await fetch(`/api/songcraft/songs/${song.id}/actions`, {
        headers: { "x-telegram-init-data": authData },
        cache: "no-store",
      });
      if (!response.ok) return;
      const actions = (await response.json()) as Array<{
        id: number;
        status: string;
        errorMessage?: string | null;
      }>;
      const current = actions.find((action) => action.id === processing.id);
      if (current?.status === "COMPLETED") {
        setProcessing(null);
        window.location.reload();
      }
      if (current?.status === "FAILED") {
        setProcessing(null);
        setActionError(current.errorMessage || "Не удалось выполнить обработку");
      }
    };
    const timer = window.setInterval(() => poll().catch(() => null), 5000);
    poll().catch(() => null);
    return () => window.clearInterval(timer);
  }, [processing, song.id]);

  const runAction = async (type: string, payload: Record<string, unknown> = {}) => {
    setActionError("");
    const authData = readTelegramInitData();
    if (!authData) {
      setActionError("Откройте трек кнопкой из бота");
      return;
    }
    const response = await fetch(`/api/songcraft/songs/${song.id}/actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-init-data": authData,
      },
      body: JSON.stringify({ type, ...payload }),
    });
    const data = await response.json();
    if (!response.ok) {
      setActionError(typeof data.error === "string" ? data.error : "Не удалось запустить обработку");
      return;
    }
    setProcessing({ id: data.id, type });
  };

  const handleShare = async () => {
    const authData = readTelegramInitData();
    const url = `${window.location.origin}/track/${song.shareToken}?utm_source=share&utm_medium=gift&utm_campaign=track_share`;
    const text = `???? ???????? ???????????? ???? ?${song.title}?.

????????: ??? ?????, ????????? ?????????? ??? ??????? ? ?????? ????????.`;
    if (authData) {
      fetch("/api/songcraft/marketing/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": authData,
        },
        body: JSON.stringify({
          event: "track_share_click",
          path: window.location.pathname,
          source: "miniapp",
          medium: "share_button",
          campaign: "track_share",
          shareToken: song.shareToken,
        }),
      }).catch(() => null);
    }
    if (navigator.share) {
      await navigator.share({ title: song.title, text, url }).catch(() => null);
      return;
    }
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const openTool = (next: Tool) => {
    setActionError("");
    setTool((current) => (current === next ? null : next));
  };

  return (
    <div className="sc-player-modern">
      <div className="sc-track-head">
        <span className="sc-track-art">
          {song.imageUrl ? <Image src={song.imageUrl} alt="" fill sizes="48px" unoptimized /> : <Music2 size={25} />}
        </span>
        <span><strong>{song.title}</strong>{recipientName && <small>Посвящено: {recipientName}</small>}</span>
      </div>

      <input
        type="range"
        className="sc-player-progress-input"
        min={0}
        max={100}
        value={progress}
        onChange={(event) => seekByPercent(Number(event.target.value))}
        aria-label="Позиция воспроизведения"
      />
      <div className="sc-player-time"><span>{formatTime(currentTime)}</span><span>{formatTime(duration || song.duration || 0)}</span></div>
      <div className="sc-player-controls">
        <button onClick={() => seek(currentTime - 15)} aria-label="Назад на 15 секунд"><RotateCcw size={19} /><small>15</small></button>
        <button className="primary" onClick={togglePlay} aria-label={isPlaying ? "Пауза" : "Воспроизвести"}>
          {isPlaying ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}
        </button>
        <button onClick={() => seek(currentTime + 15)} aria-label="Вперед на 15 секунд"><RotateCw size={19} /><small>15</small></button>
      </div>

      <div className="sc-player-actions">
        <a href={downloadUrl(song.audioUrl, fileName)} download={fileName}><Download size={17} /> Скачать</a>
        <button onClick={handleShare}><Share2 size={17} /> Поделиться</button>
      </div>

      <div className="sc-studio-tools">
        {lyrics && <button className={tool === "lyrics" ? "active" : ""} onClick={() => openTool("lyrics")}><FileAudio size={16} /><span>Текст</span></button>}
        {canEdit && <button className={tool === "replace" ? "active" : ""} onClick={() => openTool("replace")}><Scissors size={16} /><span>Исправить</span></button>}
        {canEdit && <button className={tool === "cover" ? "active" : ""} onClick={() => openTool("cover")}><Sparkles size={16} /><span>Стиль</span></button>}
        {canEdit && <button className={tool === "extend" ? "active" : ""} onClick={() => openTool("extend")}><Repeat2 size={16} /><span>Продлить</span></button>}
        {(canWav || canStems) && <button className={tool === "files" ? "active" : ""} onClick={() => openTool("files")}><AudioLines size={16} /><span>Файлы</span></button>}
      </div>

      {tool && (
        <div className="sc-studio-panel">
          <button className="sc-studio-close" onClick={() => setTool(null)} aria-label="Закрыть панель"><X size={16} /></button>

          {tool === "lyrics" && <pre className="sc-song-lyrics">{lyrics}</pre>}

          {tool === "replace" && (
            <>
              <div className="sc-studio-heading"><strong>Исправить фрагмент</strong><small>От 5 до 30 секунд</small></div>
              <button
                className="sc-mark-position"
                onClick={() => {
                  const start = Math.max(0, Math.floor(currentTime));
                  setReplaceStart(start);
                  setReplaceEnd(start + 15);
                }}
              >
                <Scissors size={15} /> Начать с текущей позиции {formatTime(currentTime)}
              </button>
              <div className="sc-time-fields">
                <label><span>Начало, сек</span><input type="number" min={0} value={replaceStart} onChange={(event) => setReplaceStart(Number(event.target.value))} /></label>
                <label><span>Конец, сек</span><input type="number" min={1} value={replaceEnd} onChange={(event) => setReplaceEnd(Number(event.target.value))} /></label>
              </div>
              <textarea className="sc-textarea" value={replacementLyrics} onChange={(event) => setReplacementLyrics(event.target.value)} placeholder="Новый текст этого фрагмента" />
              <button className="sc-btn-primary" disabled={Boolean(processing) || replacementLyrics.trim().length < 2} onClick={() => runAction("replace_section", { startS: replaceStart, endS: replaceEnd, replacementLyrics: replacementLyrics.trim() })}>
                {processing?.type === "replace_section" ? <LoaderCircle className="sc-spin" size={17} /> : <Scissors size={17} />}
                Создать исправленную версию
              </button>
            </>
          )}

          {tool === "cover" && (
            <>
              <div className="sc-studio-heading"><strong>Новая аранжировка</strong><small>Текст и мелодическая идея сохранятся</small></div>
              <textarea className="sc-textarea" value={newStyle} onChange={(event) => setNewStyle(event.target.value)} placeholder="Например: акустическая версия с пианино и струнными" />
              <button className="sc-btn-primary" disabled={Boolean(processing) || newStyle.trim().length < 3} onClick={() => runAction("cover", { style: newStyle.trim() })}>
                {processing?.type === "cover" ? <LoaderCircle className="sc-spin" size={17} /> : <Sparkles size={17} />}
                Создать новую версию
              </button>
            </>
          )}

          {tool === "extend" && (
            <>
              <div className="sc-studio-heading"><strong>Продлить трек</strong><small>Добавьте новый куплет или финал</small></div>
              <textarea className="sc-textarea" value={extensionPrompt} onChange={(event) => setExtensionPrompt(event.target.value)} placeholder="Что должно прозвучать в продолжении" />
              <button className="sc-btn-primary" disabled={Boolean(processing)} onClick={() => runAction("extend", extensionPrompt.trim() ? { prompt: extensionPrompt.trim(), continueAt: Math.max(1, Math.floor((duration || song.duration || 120) - 8)) } : {})}>
                {processing?.type === "extend" ? <LoaderCircle className="sc-spin" size={17} /> : <Repeat2 size={17} />}
                Продлить песню
              </button>
            </>
          )}

          {tool === "files" && (
            <>
              <div className="sc-studio-heading"><strong>Студийные файлы</strong><small>Файлы хранятся на нашем сервере</small></div>
              <div className="sc-studio-files">
                {song.wavUrl ? <a href={downloadUrl(song.wavUrl, `${song.title}.wav`)} download><FileAudio size={16} /> WAV</a>
                  : canWav && <button disabled={Boolean(processing)} onClick={() => runAction("wav")}><FileAudio size={16} /> Подготовить WAV</button>}
                {song.vocalUrl && <a href={downloadUrl(song.vocalUrl, `${song.title} - вокал.mp3`)} download><Mic2 size={16} /> Вокал</a>}
                {song.instrumentalUrl && <a href={downloadUrl(song.instrumentalUrl, `${song.title} - инструментал.mp3`)} download><AudioLines size={16} /> Инструментал</a>}
                {canStems && (!song.vocalUrl || !song.instrumentalUrl) && <button disabled={Boolean(processing)} onClick={() => runAction("stems")}><AudioLines size={16} /> Разделить дорожки</button>}
              </div>
            </>
          )}

          {processing && <div className="sc-action-progress"><LoaderCircle className="sc-spin" size={16} /> Обработка запущена. Результат появится здесь.</div>}
          {actionError && <div className="sc-error-banner">{actionError}</div>}
        </div>
      )}
    </div>
  );
}
