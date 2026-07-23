"use client";

import { Download, Pause, Play } from "lucide-react";
import { formatTime, useAudio } from "@/hooks/useAudio";

export function SharedTrackPlayer({
  title,
  audioUrl,
  duration: expectedDuration,
}: {
  title: string;
  audioUrl: string;
  duration?: number | null;
}) {
  const { isPlaying, currentTime, duration, progress, togglePlay, seekByPercent } =
    useAudio(audioUrl);
  const downloadUrl = `${audioUrl}${audioUrl.includes("?") ? "&" : "?"}download=1`;

  return (
    <div className="shared-track-player">
      <button className="shared-track-play" onClick={togglePlay} aria-label={isPlaying ? "Пауза" : "Воспроизвести"}>
        {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
      </button>
      <div className="shared-track-timeline">
        <input type="range" min={0} max={100} value={progress} onChange={(event) => seekByPercent(Number(event.target.value))} aria-label="Позиция трека" />
        <span>{formatTime(currentTime)} / {formatTime(duration || expectedDuration || 0)}</span>
      </div>
      <a href={downloadUrl} download={`${title}.mp3`} aria-label="Скачать трек">
        <Download size={19} />
      </a>
      <style jsx>{`
        .shared-track-player {
          min-height: 66px;
          padding: 9px 11px;
          display: grid;
          grid-template-columns: 44px 1fr 38px;
          align-items: center;
          gap: 10px;
          background: rgba(20,21,27,.88);
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 8px;
        }
        .shared-track-play, a {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          color: #17140c;
          background: #d9bd68;
          border: 0;
          border-radius: 50%;
        }
        a {
          color: #b8b4bc;
          background: transparent;
          text-decoration: none;
        }
        .shared-track-timeline {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        input {
          width: 100%;
          accent-color: #d9bd68;
        }
        span {
          color: #85818b;
          font-size: 9px;
        }
      `}</style>
    </div>
  );
}

