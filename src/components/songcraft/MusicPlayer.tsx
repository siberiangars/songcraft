"use client";

import { useMemo, useState } from "react";
import {
  Download,
  FileAudio,
  Music2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Share2,
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
  const [showLyrics, setShowLyrics] = useState(false);
  const lyrics = useMemo(() => sourceLyrics(song.lyricsJson), [song.lyricsJson]);

  const handleShare = async () => {
    const authData = readTelegramInitData();
    const url = `${window.location.origin}/track/${song.shareToken}?utm_source=share&utm_medium=gift&utm_campaign=track_share`;
    const text = `Послушай трек «${song.title}» — его собрали персонально.

SongCraft: своя песня по вашей истории за пару минут.`;
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

      {lyrics && (
        <div className="sc-studio-tools">
          <button className={showLyrics ? "active" : ""} onClick={() => setShowLyrics((value) => !value)}>
            <FileAudio size={16} /><span>Текст песни</span>
          </button>
        </div>
      )}

      {showLyrics && lyrics && (
        <div className="sc-studio-panel">
          <button className="sc-studio-close" onClick={() => setShowLyrics(false)} aria-label="Закрыть текст"><X size={16} /></button>
          <pre className="sc-song-lyrics">{lyrics}</pre>
        </div>
      )}
    </div>
  );
}
