"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleStop,
  FileAudio,
  LoaderCircle,
  Mic2,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";

interface VoiceProfile {
  id: number;
  name: string;
  status: string;
  validationPhrase?: string | null;
  errorMessage?: string | null;
}

interface RecordedAudio {
  file: File;
  duration: number;
}

const TRANSIENT_STATUSES = new Set(["VALIDATING", "CREATING"]);

function statusLabel(status: string) {
  if (status === "READY") return "Готов";
  if (status === "VALIDATING") return "Проверяем образец";
  if (status === "AWAITING_VERIFICATION") return "Нужна контрольная фраза";
  if (status === "CREATING") return "Создаём профиль";
  if (status === "FAILED") return "Нужен новый образец";
  return "Обрабатываем";
}

async function mediaDuration(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number>((resolve) => {
      const audio = new Audio();
      const timeout = window.setTimeout(() => resolve(0), 5000);
      audio.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
      };
      audio.onerror = () => {
        window.clearTimeout(timeout);
        resolve(0);
      };
      audio.src = url;
    });
    return duration;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function useVoiceRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const start = useCallback(async (onDone: (audio: RecordedAudio) => void) => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("Запись недоступна в этой версии Telegram. Загрузите аудиофайл.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    streamRef.current = stream;
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const duration = Math.max(1, (Date.now() - startedAtRef.current) / 1000);
      const mimeType = recorder.mimeType || "audio/webm";
      const extension = mimeType.includes("mp4") ? "m4a" : "webm";
      const blob = new Blob(chunks, { type: mimeType });
      onDone({
        file: new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType }),
        duration,
      });
      setRecording(false);
      stopTracks();
    };
    startedAtRef.current = Date.now();
    setSeconds(0);
    setRecording(true);
    recorder.start(500);
    timerRef.current = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 250);
  }, [stopTracks]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  useEffect(() => () => stopTracks(), [stopTracks]);
  return { recording, seconds, start, stop };
}

export function VoiceProfilePicker({
  initData,
  selectedId,
  onSelect,
}: {
  initData: string;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("Мой голос");
  const [consent, setConsent] = useState(false);
  const [source, setSource] = useState<RecordedAudio | null>(null);
  const [verification, setVerification] = useState<RecordedAudio | null>(null);
  const [verificationTarget, setVerificationTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recorder = useVoiceRecorder();

  const loadProfiles = useCallback(async () => {
    if (!initData) return;
    const response = await fetch("/api/songcraft/voices", {
      headers: { "x-telegram-init-data": initData },
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = (await response.json()) as VoiceProfile[];
    setProfiles(data);
  }, [initData]);

  useEffect(() => {
    loadProfiles().catch(() => null);
  }, [loadProfiles]);

  useEffect(() => {
    if (!profiles.some((profile) => TRANSIENT_STATUSES.has(profile.status))) return;
    const timer = window.setInterval(() => loadProfiles().catch(() => null), 7000);
    return () => window.clearInterval(timer);
  }, [loadProfiles, profiles]);

  const upload = async (audio: RecordedAudio, kind: string) => {
    const body = new FormData();
    body.append("file", audio.file);
    body.append("kind", kind);
    const response = await fetch("/api/songcraft/uploads", {
      method: "POST",
      headers: { "x-telegram-init-data": initData },
      body,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось загрузить запись");
    return data as { token: string };
  };

  const createProfile = async () => {
    if (!source) return setError("Запишите или загрузите образец голоса");
    if (!consent) return setError("Подтвердите согласие на создание профиля");
    if (source.duration < 5) return setError("Нужна запись не короче 5 секунд");
    setBusy(true);
    setError("");
    try {
      const media = await upload(source, "voice_source");
      const response = await fetch("/api/songcraft/voices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": initData,
        },
        body: JSON.stringify({
          name: name.trim() || "Мой голос",
          sourceMediaToken: media.token,
          vocalStartS: 0,
          vocalEndS: Math.min(300, Math.max(5, Math.floor(source.duration))),
          language: "ru",
          singerSkillLevel: "intermediate",
          consent: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось создать профиль");
      setSource(null);
      setConsent(false);
      await loadProfiles();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка создания профиля");
    } finally {
      setBusy(false);
    }
  };

  const verifyProfile = async (profileId: number) => {
    if (!verification) return setError("Запишите контрольную фразу");
    if (verification.duration < 3) return setError("Контрольная запись слишком короткая");
    setBusy(true);
    setError("");
    try {
      const media = await upload(verification, "voice_verification");
      const response = await fetch(`/api/songcraft/voices/${profileId}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": initData,
        },
        body: JSON.stringify({ verificationMediaToken: media.token }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось подтвердить голос");
      setVerification(null);
      setVerificationTarget(null);
      await loadProfiles();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка подтверждения");
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    const duration = await mediaDuration(file);
    setSource({ file, duration: duration || 15 });
  };

  const removeProfile = async (profileId: number) => {
    await fetch(`/api/songcraft/voices/${profileId}`, {
      method: "DELETE",
      headers: { "x-telegram-init-data": initData },
    }).catch(() => null);
    if (selectedId === profileId) onSelect(null);
    await loadProfiles();
  };

  const readyProfiles = profiles.filter((profile) => profile.status === "READY");

  return (
    <div className="sc-voice-studio">
      {readyProfiles.length > 0 && (
        <div className="sc-voice-profile-list">
          {readyProfiles.map((profile) => (
            <button
              key={profile.id}
              className={selectedId === profile.id ? "selected" : ""}
              onClick={() => onSelect(selectedId === profile.id ? null : profile.id)}
            >
              <span className="sc-voice-avatar"><AudioWaveIcon /></span>
              <span><strong>{profile.name}</strong><small>Подтверждённый голос</small></span>
              {selectedId === profile.id ? <Check size={18} /> : null}
            </button>
          ))}
        </div>
      )}

      <button
        className="sc-voice-expand"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label="Новый профиль голоса"
      >
        <span><Plus size={17} /> Новый профиль голоса</span>
        <ChevronDown className={expanded ? "open" : ""} size={18} />
      </button>

      {expanded && (
        <div className="sc-voice-workspace">
          <label className="sc-form-label">
            <span>Название профиля</span>
            <input
              className="sc-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={50}
            />
          </label>

          <div className={`sc-record-zone ${recorder.recording ? "recording" : ""}`}>
            <span className="sc-record-status">
              {source ? <FileAudio size={22} /> : <Mic2 size={22} />}
            </span>
            <div>
              <strong>
                {recorder.recording
                  ? `Запись ${recorder.seconds} сек`
                  : source
                    ? `Готово: ${Math.round(source.duration)} сек`
                    : "Чистый голос без музыки"}
              </strong>
              <small>Спойте 15–30 секунд в обычной для вас манере</small>
            </div>
            {recorder.recording ? (
              <button onClick={recorder.stop} aria-label="Остановить запись">
                <CircleStop size={21} />
              </button>
            ) : (
              <button
                onClick={() => recorder.start(setSource).catch((cause) => setError(String(cause)))}
                aria-label="Начать запись"
              >
                <Mic2 size={20} />
              </button>
            )}
          </div>

          <label className="sc-upload-link">
            <Upload size={16} /> Загрузить MP3, WAV или M4A
            <input
              type="file"
              accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/ogg,audio/webm"
              onChange={(event) => chooseFile(event.target.files?.[0]).catch(() => null)}
            />
          </label>

          <label className="sc-consent-row">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              <ShieldCheck size={16} />
              Я подтверждаю, что это мой голос и разрешаю использовать его для моих треков
            </span>
          </label>

          <button
            className="sc-btn-primary"
            disabled={busy || recorder.recording}
            onClick={createProfile}
          >
            {busy ? <LoaderCircle className="sc-spin" size={18} /> : <ShieldCheck size={18} />}
            Проверить голос
          </button>

          {profiles
            .filter((profile) => profile.status !== "READY")
            .map((profile) => (
              <div className="sc-voice-pending" key={profile.id}>
                <div>
                  <strong>{profile.name}</strong>
                  <small>{statusLabel(profile.status)}</small>
                </div>
                {TRANSIENT_STATUSES.has(profile.status) && (
                  <LoaderCircle className="sc-spin" size={17} />
                )}
                {profile.status === "FAILED" && (
                  <button onClick={() => removeProfile(profile.id)} aria-label="Удалить профиль">
                    <Trash2 size={16} />
                  </button>
                )}
                {profile.status === "AWAITING_VERIFICATION" && (
                  <div className="sc-verification-block">
                    <p>{profile.validationPhrase}</p>
                    {verificationTarget === profile.id && verification ? (
                      <button
                        className="sc-btn-primary"
                        disabled={busy}
                        onClick={() => verifyProfile(profile.id)}
                      >
                        {busy ? <LoaderCircle className="sc-spin" size={17} /> : <ShieldCheck size={17} />}
                        Отправить фразу
                      </button>
                    ) : recorder.recording && verificationTarget === profile.id ? (
                      <button className="sc-btn-danger" onClick={recorder.stop}>
                        <CircleStop size={17} /> Стоп
                      </button>
                    ) : (
                      <button
                        className="sc-btn-ghost"
                        onClick={() => {
                          setVerificationTarget(profile.id);
                          recorder.start(setVerification).catch((cause) => setError(String(cause)));
                        }}
                      >
                        <Mic2 size={17} /> Записать эту фразу
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
      {error && <div className="sc-error-banner">{error}</div>}
    </div>
  );
}

function AudioWaveIcon() {
  return (
    <span className="sc-mini-wave" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
