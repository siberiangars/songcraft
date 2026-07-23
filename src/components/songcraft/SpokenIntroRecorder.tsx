"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleStop, LoaderCircle, Mic2, RotateCcw, Upload } from "lucide-react";

export function SpokenIntroRecorder({
  initData,
  token,
  onUploaded,
}: {
  initData: string;
  token: string | null;
  onUploaded: (token: string | null) => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const upload = useCallback(async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "spoken_intro");
      const response = await fetch("/api/songcraft/uploads", {
        method: "POST",
        headers: { "x-telegram-init-data": initData },
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить запись");
      onUploaded(data.token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось обработать запись");
    } finally {
      setBusy(false);
    }
  }, [initData, onUploaded]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Запись недоступна в этой версии Telegram. Загрузите аудиофайл.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const extension = mimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File(
          [new Blob(chunksRef.current, { type: mimeType })],
          `pozdravlenie-${Date.now()}.${extension}`,
          { type: mimeType },
        );
        setRecording(false);
        stopStream();
        if ((Date.now() - startedAtRef.current) / 1000 < 2) {
          setError("Запись слишком короткая. Скажите хотя бы одну полную фразу.");
          return;
        }
        upload(file).catch(() => null);
      };
      startedAtRef.current = Date.now();
      setSeconds(0);
      setRecording(true);
      setError("");
      recorder.start(400);
      timerRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000)), 250);
    } catch {
      setError("Не удалось получить доступ к микрофону. Проверьте разрешение Telegram.");
      stopStream();
    }
  };

  const stop = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  useEffect(() => () => stopStream(), [stopStream]);

  if (token) {
    return (
      <div className="sc-intro-recorder ready">
        <span><Check size={18} /> Голосовое поздравление сохранено</span>
        <button type="button" onClick={() => onUploaded(null)}><RotateCcw size={16} /> Записать заново</button>
      </div>
    );
  }

  return (
    <div className="sc-intro-recorder">
      <p>Скажите короткое поздравление до 30 секунд. Мы аккуратно поставим его перед музыкой.</p>
      <div>
        {recording ? (
          <button type="button" className="recording" onClick={stop}><CircleStop size={19} /> Стоп · {seconds} сек</button>
        ) : (
          <button type="button" disabled={busy} onClick={start}>
            {busy ? <LoaderCircle className="sc-spin" size={19} /> : <Mic2 size={19} />}
            {busy ? "Обрабатываем" : "Записать голос"}
          </button>
        )}
        <label>
          <Upload size={17} /> Загрузить файл
          <input
            type="file"
            accept="audio/*,video/mp4,video/webm"
            hidden
            disabled={busy || recording}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload(file).catch(() => null);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
      {error && <small>{error}</small>}
    </div>
  );
}
