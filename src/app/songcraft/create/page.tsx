"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  CakeSlice,
  Check,
  CloudCheck,
  CloudUpload,
  Crown,
  Disc3,
  FilePenLine,
  Gem,
  Gift,
  Guitar,
  Headphones,
  Heart,
  History,
  ImageIcon,
  Laugh,
  LoaderCircle,
  Mic2,
  PartyPopper,
  PenLine,
  Piano,
  Radio,
  RefreshCw,
  Sparkles,
  Star,
  UserRound,
  Video,
  WandSparkles,
  Zap,
} from "lucide-react";
import { readTelegramInitData, useTelegram } from "@/hooks/useTelegram";
import { ORDER_ADDONS, PRICING, PlanType, SONG_OFFER } from "@/lib/songcraft/config";
import { SpokenIntroRecorder } from "@/components/songcraft/SpokenIntroRecorder";
import { GiftPhotoUploader } from "@/components/songcraft/GiftPhotoUploader";
import {
  SlideshowPhotoUploader,
  SLIDESHOW_MIN_PHOTOS,
} from "@/components/songcraft/SlideshowPhotoUploader";

type Choice = { id: string; label: string; icon: LucideIcon; description?: string };
type VoiceType = "female" | "male";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface ProducerDraft {
  id: string;
  revision: number;
  title: string;
  lyrics: string;
  stylePrompt: string;
  negativeTags: string;
  pronunciationHints: string[];
  producerNote: string;
}

interface WorkspaceSnapshot {
  mode: "" | "gift" | "rap";
  step: number;
  occasion: string;
  genre: string;
  mood: string;
  rapStyle: string;
  text: string;
  name: string;
  pronunciation: string;
  trackTitle: string;
  voiceType: VoiceType;
  voiceProfileId: number | null;
  tempo: "slow" | "medium" | "fast";
  customStyle: string;
  workspaceDraftId: string | null;
  draft: ProducerDraft | null;
  addCover?: boolean;
  giftPhotoToken?: string | null;
  addVideo?: boolean;
  videoPhotoTokens?: string[];
  addSpokenIntro?: boolean;
  spokenIntroToken?: string | null;
  savedAt: string;
}

interface SavedDraft extends ProducerDraft {
  hasLyrics: boolean;
  brief: Partial<{
    mode: "gift" | "rap";
    step: number;
    recipientName: string;
    recipientPronunciation: string;
    trackTitle: string;
    occasion: string;
    userText: string;
    genre: string;
    mood: string;
    voiceType: VoiceType;
    voiceProfileId: number | null;
    customStyle: string;
    tempo: "slow" | "medium" | "fast";
  }>;
  createdAt: string;
  updatedAt: string;
}

const WORKSPACE_STORAGE_KEY = "songcraft:create-workspace:v3";

const OCCASIONS: Choice[] = [
  { id: "birthday", label: "День рождения", icon: CakeSlice },
  { id: "wedding", label: "Свадьба", icon: Gem },
  { id: "anniversary", label: "Юбилей", icon: PartyPopper },
  { id: "love", label: "Признание", icon: Heart },
  { id: "justsave", label: "Просто так", icon: Star },
  { id: "other", label: "Другое", icon: PenLine },
];

const GENRES: Choice[] = [
  { id: "поп", label: "Поп", icon: Mic2 },
  { id: "баллада", label: "Баллада", icon: Piano },
  { id: "рок", label: "Рок", icon: Guitar },
  { id: "электро", label: "Электро", icon: Headphones },
  { id: "акустика", label: "Акустика", icon: Radio },
  { id: "хип-хоп", label: "Хип-хоп", icon: Disc3 },
];

const MOODS: Choice[] = [
  { id: "романтичное", label: "Романтичное", icon: Heart },
  { id: "веселое", label: "Веселое", icon: Laugh },
  { id: "трогательное", label: "Трогательное", icon: Sparkles },
  { id: "торжественное", label: "Торжественное", icon: Crown },
  { id: "вдохновляющее", label: "Вдохновляющее", icon: Zap },
];

const RAP_STYLES: Choice[] = [
  { id: "темный трэп", label: "Темный трэп", icon: AudioLines, description: "Плотный 808 и напряженная подача" },
  { id: "андеграунд", label: "Андеграунд", icon: Disc3, description: "Сырая уличная атмосфера" },
  { id: "дрилл", label: "Дрилл", icon: Zap, description: "Жесткий ритм и энергичный флоу" },
  { id: "клубный рэп", label: "Клубный", icon: Headphones, description: "Яркий припев и танцевальный бит" },
  { id: "бум-бэп", label: "Бум-бэп", icon: Radio, description: "Классический грув и речитатив" },
];

const VOICES: Choice[] = [
  { id: "female", label: "Женский", icon: UserRound, description: "Теплая выразительная подача" },
  { id: "male", label: "Мужской", icon: UserRound, description: "Уверенный взрослый тембр" },
];

function ChoiceButton({
  item,
  selected,
  compact = false,
  onClick,
}: {
  item: Choice;
  selected: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={`sc-choice ${selected ? "selected" : ""} ${compact ? "compact" : ""}`}
      onClick={onClick}
    >
      <span className="sc-choice-icon"><Icon size={compact ? 18 : 20} /></span>
      <span className="sc-choice-copy">
        <strong>{item.label}</strong>
        {item.description && <small>{item.description}</small>}
      </span>
      {selected && <Check className="sc-choice-check" size={17} />}
    </button>
  );
}

export default function CreatePage() {
  const { tg, initData, isReady, supportsBackButton } = useTelegram();
  const [mode, setMode] = useState<"" | "gift" | "rap">("");
  const [step, setStep] = useState(0);
  const [occasion, setOccasion] = useState("");
  const [genre, setGenre] = useState("");
  const [mood, setMood] = useState("");
  const [rapStyle, setRapStyle] = useState("");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [pronunciation, setPronunciation] = useState("");
  const [trackTitle, setTrackTitle] = useState("");
  const [voiceType, setVoiceType] = useState<VoiceType>("female");
  const [voiceProfileId, setVoiceProfileId] = useState<number | null>(null);
  const [tempo, setTempo] = useState<"slow" | "medium" | "fast">("medium");
  const [customStyle, setCustomStyle] = useState("");
  const [draft, setDraft] = useState<ProducerDraft | null>(null);
  const [workspaceDraftId, setWorkspaceDraftId] = useState<string | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hydrated, setHydrated] = useState(false);
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [addCover, setAddCover] = useState(false);
  const [giftPhotoToken, setGiftPhotoToken] = useState<string | null>(null);
  const [addVideo, setAddVideo] = useState(false);
  const [videoPhotoTokens, setVideoPhotoTokens] = useState<string[]>([]);
  const [addSpokenIntro, setAddSpokenIntro] = useState(false);
  const [spokenIntroToken, setSpokenIntroToken] = useState<string | null>(null);

  const totalSteps = mode === "rap" ? 5 : 6;
  const isLastStep = step === totalSteps - 1;
  const authData = initData || readTelegramInitData();

  const resetWorkspace = useCallback((nextMode: "" | "gift" | "rap" = "") => {
    setMode(nextMode);
    setStep(0);
    setOccasion("");
    setGenre("");
    setMood("");
    setRapStyle("");
    setText("");
    setName("");
    setPronunciation("");
    setTrackTitle("");
    setVoiceType(nextMode === "rap" ? "male" : "female");
    setVoiceProfileId(null);
    setTempo("medium");
    setCustomStyle("");
    setDraft(null);
    setWorkspaceDraftId(null);
    setRevisionInstruction("");
    setError("");
    setAddCover(false);
    setGiftPhotoToken(null);
    setAddVideo(false);
    setVideoPhotoTokens([]);
    setAddSpokenIntro(false);
    setSpokenIntroToken(null);
    setSaveStatus("idle");
    window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  }, []);

  const invalidateGeneratedDraft = useCallback(() => {
    if (draft) setWorkspaceDraftId(null);
    setDraft(null);
  }, [draft]);

  const goBack = useCallback(() => {
    setError("");
    if (!mode) {
      window.location.href = "/songcraft";
    } else if (step === 0) {
      setMode("");
    } else {
      setStep((current) => current - 1);
    }
  }, [mode, step]);

  useEffect(() => {
    if (!supportsBackButton) return;
    const onBack = () => goBack();
    tg?.BackButton.show();
    tg?.BackButton.onClick(onBack);
    return () => {
      tg?.BackButton.offClick(onBack);
      tg?.BackButton.hide();
    };
  }, [goBack, supportsBackButton, tg]);

  const canNext = useMemo(() => {
    if (mode === "rap") {
      if (step === 0) return Boolean(rapStyle);
      if (step === 1) return text.trim().length >= 10;
      if (step === 3) return Boolean(draft);
      return true;
    }
    if (step === 0) return Boolean(occasion);
    if (step === 1) return Boolean(genre && mood);
    if (step === 2) return text.trim().length >= 10;
    if (step === 4) return Boolean(draft);
    return true;
  }, [draft, genre, mode, mood, occasion, rapStyle, step, text]);

  const draftPayload = useCallback(() => ({
    draftId: workspaceDraftId ?? undefined,
    mode,
    step,
    recipientName: mode === "rap" ? "" : name.trim(),
    recipientPronunciation: mode === "rap" ? undefined : pronunciation.trim() || undefined,
    trackTitle: trackTitle.trim() || undefined,
    occasion: mode === "rap" ? "other" : occasion,
    userText: text.trim(),
    genre: mode === "rap" ? "хип-хоп" : genre,
    mood: mode === "rap" ? rapStyle : mood,
    voiceType,
    voiceProfileId,
    customStyle: customStyle.trim() || undefined,
    tempo,
    language: "ru" as const,
  }), [
    customStyle,
    genre,
    mode,
    mood,
    name,
    occasion,
    pronunciation,
    rapStyle,
    step,
    tempo,
    text,
    trackTitle,
    voiceProfileId,
    voiceType,
    workspaceDraftId,
  ]);

  useEffect(() => {
    try {
      const showLibrary = new URLSearchParams(window.location.search).has("drafts");
      const raw = showLibrary ? null : window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as WorkspaceSnapshot;
        if (saved.mode === "gift" || saved.mode === "rap") {
          setMode(saved.mode);
          setStep(Number.isInteger(saved.step) ? saved.step : 0);
          setOccasion(saved.occasion || "");
          setGenre(saved.genre || "");
          setMood(saved.mood || "");
          setRapStyle(saved.rapStyle || "");
          setText(saved.text || "");
          setName(saved.name || "");
          setPronunciation(saved.pronunciation || "");
          setTrackTitle(saved.trackTitle || "");
          setVoiceType(saved.voiceType || "female");
          setVoiceProfileId(saved.voiceProfileId ?? null);
          setTempo(saved.tempo || "medium");
          setCustomStyle(saved.customStyle || "");
          setWorkspaceDraftId(saved.workspaceDraftId || null);
          setDraft(saved.draft || null);
          setAddCover(Boolean(saved.addCover));
          setGiftPhotoToken(saved.giftPhotoToken || null);
          setAddVideo(Boolean(saved.addVideo));
          setVideoPhotoTokens(Array.isArray(saved.videoPhotoTokens) ? saved.videoPhotoTokens : []);
          setAddSpokenIntro(Boolean(saved.addSpokenIntro));
          setSpokenIntroToken(saved.spokenIntroToken || null);
          setSaveStatus("saved");
        }
      }
    } catch {
      window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isReady || !authData) return;
    fetch("/api/songcraft/lyrics/draft", {
      headers: { "x-telegram-init-data": authData },
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((items) => setSavedDrafts(Array.isArray(items) ? items : []))
      .catch(() => null);
  }, [authData, isReady]);

  useEffect(() => {
    if (!hydrated || !mode) return;
    const snapshot: WorkspaceSnapshot = {
      mode,
      step,
      occasion,
      genre,
      mood,
      rapStyle,
      text,
      name,
      pronunciation,
      trackTitle,
      voiceType,
      voiceProfileId,
      tempo,
      customStyle,
      workspaceDraftId,
      draft,
      addCover,
      giftPhotoToken,
      addVideo,
      videoPhotoTokens,
      addSpokenIntro,
      spokenIntroToken,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(snapshot));
  }, [
    customStyle,
    addCover,
    giftPhotoToken,
    addVideo,
    videoPhotoTokens,
    addSpokenIntro,
    spokenIntroToken,
    draft,
    genre,
    hydrated,
    mode,
    mood,
    name,
    occasion,
    pronunciation,
    rapStyle,
    step,
    tempo,
    text,
    trackTitle,
    voiceProfileId,
    voiceType,
    workspaceDraftId,
  ]);

  useEffect(() => {
    if (!hydrated || !authData || !mode || draft || text.trim().length < 10) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const response = await fetch("/api/songcraft/lyrics/draft", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-init-data": authData,
          },
          body: JSON.stringify(draftPayload()),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error("Autosave failed");
        if (typeof data.id === "string") setWorkspaceDraftId(data.id);
        setSaveStatus("saved");
      } catch (cause) {
        if ((cause as { name?: string }).name !== "AbortError") setSaveStatus("error");
      }
    }, 900);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [authData, draft, draftPayload, hydrated, mode, text]);

  useEffect(() => {
    if (!authData || !draft || !workspaceDraftId || draft.lyrics.trim().length < 100) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const response = await fetch("/api/songcraft/lyrics/draft", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-init-data": authData,
          },
          body: JSON.stringify({
            draftId: workspaceDraftId,
            title: draft.title,
            lyrics: draft.lyrics,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Draft save failed");
        setSaveStatus("saved");
      } catch (cause) {
        if ((cause as { name?: string }).name !== "AbortError") setSaveStatus("error");
      }
    }, 900);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [authData, draft, workspaceDraftId]);

  const restoreSavedDraft = useCallback((saved: SavedDraft) => {
    const brief = saved.brief;
    const restoredMode = brief.mode === "rap" ? "rap" : "gift";
    setMode(restoredMode);
    setOccasion(brief.occasion || "");
    setGenre(restoredMode === "rap" ? "хип-хоп" : brief.genre || "");
    setMood(restoredMode === "rap" ? "" : brief.mood || "");
    setRapStyle(restoredMode === "rap" ? brief.mood || "" : "");
    setText(brief.userText || "");
    setName(brief.recipientName || "");
    setPronunciation(brief.recipientPronunciation || "");
    setTrackTitle(saved.title || brief.trackTitle || "");
    setVoiceType(brief.voiceType || "female");
    setVoiceProfileId(brief.voiceProfileId ?? null);
    setTempo(brief.tempo || "medium");
    setCustomStyle(brief.customStyle || "");
    setWorkspaceDraftId(saved.id);
    setDraft(saved.hasLyrics ? {
      id: saved.id,
      revision: saved.revision,
      title: saved.title,
      lyrics: saved.lyrics,
      stylePrompt: saved.stylePrompt,
      negativeTags: saved.negativeTags,
      pronunciationHints: saved.pronunciationHints,
      producerNote: saved.producerNote,
    } : null);
    const draftStep = restoredMode === "rap" ? 3 : 4;
    const storyStep = restoredMode === "rap" ? 1 : 2;
    setStep(
      saved.hasLyrics
        ? draftStep
        : Math.min(draftStep, Math.max(storyStep, brief.step || storyStep)),
    );
    setError("");
    setSaveStatus("saved");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const prepareDraft = async () => {
    if (!authData) {
      setError("Откройте мини-приложение кнопкой из бота, чтобы подтвердить вход.");
      return;
    }
    setDraftLoading(true);
    setError("");
    try {
      const response = await fetch("/api/songcraft/lyrics/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": authData,
        },
        body: JSON.stringify(draftPayload()),
      });
      const data = await response.json();
      if (!response.ok) {
        if (typeof data.draftId === "string") setWorkspaceDraftId(data.draftId);
        throw new Error(typeof data.error === "string" ? data.error : "Не удалось подготовить текст");
      }
      setDraft(data as ProducerDraft);
      if (typeof data.id === "string") setWorkspaceDraftId(data.id);
      setTrackTitle(data.title);
      setSaveStatus("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка подготовки текста");
    } finally {
      setDraftLoading(false);
    }
  };

  const reviseDraft = async () => {
    if (!draft || revisionInstruction.trim().length < 3) return;
    setDraftLoading(true);
    setError("");
    try {
      const response = await fetch("/api/songcraft/lyrics/revise", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": authData,
        },
        body: JSON.stringify({
          draftId: draft.id,
          instruction: revisionInstruction.trim(),
          currentLyrics: draft.lyrics,
          currentTitle: draft.title,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Не удалось изменить текст");
      setDraft(data as ProducerDraft);
      setTrackTitle(data.title);
      setRevisionInstruction("");
      setSaveStatus("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка редактирования");
    } finally {
      setDraftLoading(false);
    }
  };

  const submit = async () => {
    if (!draft) return;
    if (addSpokenIntro && !spokenIntroToken) {
      setError("Запишите голосовое поздравление или отключите эту услугу");
      return;
    }
    if (addCover && !giftPhotoToken) {
      setError("Загрузите фото для обложки подарка или отключите эту услугу");
      return;
    }
    if (addVideo && videoPhotoTokens.length < SLIDESHOW_MIN_PHOTOS) {
      setError(`Для видео-слайдшоу добавьте минимум ${SLIDESHOW_MIN_PHOTOS} фотографии`);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (!authData) throw new Error("Не удалось подтвердить вход. Откройте приложение кнопкой из бота.");
      const response = await fetch("/api/songcraft/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": authData,
        },
        body: JSON.stringify({
          ...draftPayload(),
          plan: SONG_OFFER.plan,
          draftId: draft.id,
          approvedLyrics: draft.lyrics,
          trackTitle: draft.title,
          style: draft.stylePrompt,
          voiceProfileId: voiceProfileId ?? undefined,
          addCover,
          giftPhotoToken: addCover ? giftPhotoToken || undefined : undefined,
          addVideo: false,
          addSpokenIntro: false,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка создания заказа");
      if (typeof data.confirmationUrl === "string") {
        if (tg?.openLink) tg.openLink(data.confirmationUrl, { try_instant_view: false });
        else window.open(data.confirmationUrl, "_blank", "noopener,noreferrer");
      }
      window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      window.location.href = `/songcraft/order/${data.orderId}`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка");
      setSubmitting(false);
    }
  };

  if (!isReady) return <div className="sc-shell sc-loading">Загрузка...</div>;

  if (!mode) {
    return (
      <div className="sc-shell sc-create-page">
        <div className="sc-page-heading">
          <div><span className="sc-kicker">Новый проект</span><h1>Создать трек</h1></div>
          <button className="sc-icon-button" onClick={goBack} aria-label="Назад">
            <ArrowLeft size={20} />
          </button>
        </div>
        <p className="sc-page-lead">Выберите формат. Дальше соберем бриф и подготовим текст.</p>
        <div className="sc-mode-list">
          <button type="button" onClick={() => resetWorkspace("gift")}>
            <span className="sc-mode-icon"><Gift size={25} /></span>
            <span><strong>Песня в подарок</strong><small>Личная история для близкого человека</small></span>
            <ArrowRight size={19} />
          </button>
          <button type="button" onClick={() => resetWorkspace("rap")}>
            <span className="sc-mode-icon"><Mic2 size={25} /></span>
            <span><strong>Рэп-трек</strong><small>Трэп, дрилл, клубный или классический флоу</small></span>
            <ArrowRight size={19} />
          </button>
        </div>
        {savedDrafts.length > 0 && (
          <section className="sc-draft-library">
            <div className="sc-section-heading">
              <div><History size={18} /><h2>Мои черновики</h2></div>
              <span>{savedDrafts.length}</span>
            </div>
            <div className="sc-draft-list">
              {savedDrafts.slice(0, 4).map((saved) => (
                <button key={saved.id} type="button" onClick={() => restoreSavedDraft(saved)}>
                  <span className="sc-draft-list-icon">{saved.hasLyrics ? <FilePenLine size={18} /> : <CloudUpload size={18} />}</span>
                  <span>
                    <strong>{saved.title || "Новый черновик"}</strong>
                    <small>{saved.hasLyrics ? "Текст готов" : "История сохранена"} - {new Date(saved.updatedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
          </section>
        )}
        <div className="sc-create-note">
          <WandSparkles size={18} />
          <span>История сохраняется автоматически. До оплаты вы увидите и сможете изменить готовый текст.</span>
        </div>
      </div>
    );
  }

  const draftStep = mode === "rap" ? 3 : 4;

  return (
    <div className="sc-shell sc-create-page">
      <div className="sc-wizard-header">
        <button className="sc-icon-button" onClick={goBack} aria-label="Назад"><ArrowLeft size={20} /></button>
        <div>
          <span>Шаг {step + 1} из {totalSteps}</span>
          <strong>{mode === "rap" ? "Рэп-трек" : "Песня в подарок"}</strong>
        </div>
        <div className="sc-wizard-meta">
          <span className="sc-step-count">{Math.round(((step + 1) / totalSteps) * 100)}%</span>
          <span className={`sc-save-status ${saveStatus}`}>
            {saveStatus === "saving" ? <CloudUpload size={13} /> : <CloudCheck size={13} />}
            {saveStatus === "saving" ? "Сохраняем" : saveStatus === "error" ? "На устройстве" : "Сохранено"}
          </span>
        </div>
      </div>
      <div className="sc-progress">
        <div className="sc-progress-bar" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
      </div>

      <div className="sc-wizard-content" key={`${mode}-${step}`}>
        {mode === "rap" && step === 0 && (
          <>
            <StepHeading title="Выберите звучание" text="Зададим основу аранжировки и подачи." />
            <div className="sc-choice-list">
              {RAP_STYLES.map((item) => (
                <ChoiceButton key={item.id} item={item} selected={rapStyle === item.id} onClick={() => { setRapStyle(item.id); invalidateGeneratedDraft(); }} />
              ))}
            </div>
          </>
        )}
        {mode === "rap" && step === 1 && (
          <TextStep label="О чем будет трек?" value={text} onChange={(value) => { setText(value); invalidateGeneratedDraft(); }} placeholder="Опишите тему, героя, ситуацию, важные фразы и настроение..." />
        )}
        {mode === "rap" && step === 2 && (
          <ParametersStep
            title={trackTitle}
            setTitle={(value) => { setTrackTitle(value); invalidateGeneratedDraft(); }}
            voiceType={voiceType}
            setVoiceType={(value) => { setVoiceType(value); invalidateGeneratedDraft(); }}
            tempo={tempo}
            setTempo={(value) => { setTempo(value); invalidateGeneratedDraft(); }}
            customStyle={customStyle}
            setCustomStyle={(value) => { setCustomStyle(value); invalidateGeneratedDraft(); }}
            initData={authData}
            voiceProfileId={voiceProfileId}
            setVoiceProfileId={setVoiceProfileId}
          />
        )}
        {mode === "rap" && step === 3 && (
          <DraftStep
            draft={draft}
            setDraft={setDraft}
            sourceText={text}
            loading={draftLoading}
            error={error}
            instruction={revisionInstruction}
            setInstruction={setRevisionInstruction}
            prepare={prepareDraft}
            revise={reviseDraft}
          />
        )}
        {mode === "rap" && step === 4 && (
          <OrderSummaryStep
            error={error}
            submitting={submitting}
            initData={authData}
            addCover={addCover}
            setAddCover={setAddCover}
            giftPhotoToken={giftPhotoToken}
            setGiftPhotoToken={setGiftPhotoToken}
            addVideo={addVideo}
            setAddVideo={setAddVideo}
            videoPhotoTokens={videoPhotoTokens}
            setVideoPhotoTokens={setVideoPhotoTokens}
            addSpokenIntro={addSpokenIntro}
            setAddSpokenIntro={setAddSpokenIntro}
            spokenIntroToken={spokenIntroToken}
            setSpokenIntroToken={setSpokenIntroToken}
            submit={submit}
          />
        )}

        {mode === "gift" && step === 0 && (
          <>
            <StepHeading title="Какой повод?" text="Он задаст тон и драматургию песни." />
            <div className="sc-choice-grid sc-occasion-grid">
              {OCCASIONS.map((item) => (
                <ChoiceButton key={item.id} item={item} selected={occasion === item.id} compact onClick={() => { setOccasion(item.id); invalidateGeneratedDraft(); }} />
              ))}
            </div>
          </>
        )}
        {mode === "gift" && step === 1 && (
          <>
            <StepHeading title="Стиль и настроение" text="Выберите по одному варианту в каждом разделе." />
            <span className="sc-field-label">Жанр</span>
            <div className="sc-choice-grid three">
              {GENRES.map((item) => (
                <ChoiceButton key={item.id} item={item} selected={genre === item.id} compact onClick={() => { setGenre(item.id); invalidateGeneratedDraft(); }} />
              ))}
            </div>
            <span className="sc-field-label spaced">Настроение</span>
            <div className="sc-choice-grid">
              {MOODS.map((item) => (
                <ChoiceButton key={item.id} item={item} selected={mood === item.id} compact onClick={() => { setMood(item.id); invalidateGeneratedDraft(); }} />
              ))}
            </div>
          </>
        )}
        {mode === "gift" && step === 2 && (
          <TextStep label="Расскажите вашу историю" value={text} onChange={(value) => { setText(value); invalidateGeneratedDraft(); }} placeholder="Кому посвящена песня, что вас связывает, важные события и что хочется сказать..." />
        )}
        {mode === "gift" && step === 3 && (
          <ParametersStep
            name={name}
            setName={(value) => { setName(value); invalidateGeneratedDraft(); }}
            pronunciation={pronunciation}
            setPronunciation={(value) => { setPronunciation(value); invalidateGeneratedDraft(); }}
            title={trackTitle}
            setTitle={(value) => { setTrackTitle(value); invalidateGeneratedDraft(); }}
            voiceType={voiceType}
            setVoiceType={(value) => { setVoiceType(value); invalidateGeneratedDraft(); }}
            tempo={tempo}
            setTempo={(value) => { setTempo(value); invalidateGeneratedDraft(); }}
            customStyle={customStyle}
            setCustomStyle={(value) => { setCustomStyle(value); invalidateGeneratedDraft(); }}
            initData={authData}
            voiceProfileId={voiceProfileId}
            setVoiceProfileId={setVoiceProfileId}
          />
        )}
        {mode === "gift" && step === 4 && (
          <DraftStep
            draft={draft}
            setDraft={setDraft}
            sourceText={text}
            loading={draftLoading}
            error={error}
            instruction={revisionInstruction}
            setInstruction={setRevisionInstruction}
            prepare={prepareDraft}
            revise={reviseDraft}
          />
        )}
        {mode === "gift" && step === 5 && (
          <OrderSummaryStep
            error={error}
            submitting={submitting}
            initData={authData}
            addCover={addCover}
            setAddCover={setAddCover}
            giftPhotoToken={giftPhotoToken}
            setGiftPhotoToken={setGiftPhotoToken}
            addVideo={addVideo}
            setAddVideo={setAddVideo}
            videoPhotoTokens={videoPhotoTokens}
            setVideoPhotoTokens={setVideoPhotoTokens}
            addSpokenIntro={addSpokenIntro}
            setAddSpokenIntro={setAddSpokenIntro}
            spokenIntroToken={spokenIntroToken}
            setSpokenIntroToken={setSpokenIntroToken}
            submit={submit}
          />
        )}
      </div>

      {!isLastStep && (
        <div className="sc-wizard-action">
          <button
            className="sc-btn-primary"
            disabled={!canNext || (step === draftStep && draftLoading)}
            onClick={() => canNext && setStep((current) => current + 1)}
          >
            Продолжить <ArrowRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

function StepHeading({ title, text }: { title: string; text: string }) {
  return <div className="sc-step-heading"><h2>{title}</h2><p>{text}</p></div>;
}

function TextStep({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [listening, setListening] = useState(false);
  const [speechMessage, setSpeechMessage] = useState("");
  const recognitionRef = useMemo<{ current: SpeechRecognitionLike | null }>(() => ({ current: null }), []);

  const toggleSpeechInput = useCallback(() => {
    if (typeof window === "undefined") return;

    if (recognitionRef.current && listening) {
      recognitionRef.current.stop();
      return;
    }

    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ??
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechMessage("На этом устройстве диктовка недоступна. Можно включить голосовой ввод на клавиатуре телефона.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "ru-RU";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    let baseText = value.trim();
    let lastFinal = "";

    recognition.onstart = () => {
      setListening(true);
      setSpeechMessage("Слушаю. Говорите историю свободно, текст появится здесь.");
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      setSpeechMessage(lastFinal ? "Готово. Проверьте текст и добавьте детали, если нужно." : "");
    };
    recognition.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
      setSpeechMessage("Не удалось распознать речь. Проверьте доступ к микрофону или используйте диктовку клавиатуры.");
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim() ?? "";
        if (!transcript) continue;
        if (result.isFinal) finalText += `${transcript} `;
        else interimText += `${transcript} `;
      }

      if (finalText.trim()) {
        lastFinal = `${lastFinal} ${finalText}`.trim();
        baseText = [baseText, finalText.trim()].filter(Boolean).join("\n");
      }

      const nextText = [baseText, interimText.trim()].filter(Boolean).join("\n");
      onChange(nextText.slice(0, 3000));
    };

    try {
      recognition.start();
    } catch {
      setSpeechMessage("Микрофон уже запускается. Подождите пару секунд и нажмите еще раз.");
    }
  }, [listening, onChange, recognitionRef, value]);

  useEffect(() => () => recognitionRef.current?.stop(), [recognitionRef]);

  return (
    <>
      <StepHeading title={label} text="Личные детали важнее красивых общих слов." />
      <div className={`sc-story-recorder ${listening ? "listening" : ""}`}>
        <textarea
          className="sc-textarea sc-story-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={3000}
        />
        <button
          type="button"
          className="sc-story-mic"
          onClick={toggleSpeechInput}
          aria-pressed={listening}
          aria-label={listening ? "Остановить диктовку" : "Наговорить текст"}
        >
          {listening ? <LoaderCircle className="sc-spin" size={18} /> : <Mic2 size={18} />}
          <span>{listening ? "Стоп" : "Наговорить"}</span>
        </button>
      </div>
      {speechMessage && <div className="sc-input-speech-status">{speechMessage}</div>}
      <div className="sc-brief-checklist">
        <span className={value.length >= 80 ? "done" : ""}><Check size={14} /> 3-5 деталей</span>
        <span className={value.length >= 160 ? "done" : ""}><Check size={14} /> общее воспоминание</span>
        <span className={value.length >= 240 ? "done" : ""}><Check size={14} /> главная мысль</span>
      </div>
      <div className="sc-input-hint"><span>Минимум 10 символов</span><span>{value.length} / 3000</span></div>
    </>
  );
}

function ParametersStep({
  name,
  setName,
  pronunciation,
  setPronunciation,
  title,
  setTitle,
  voiceType,
  setVoiceType,
  tempo,
  setTempo,
  customStyle,
  setCustomStyle,
  initData,
  voiceProfileId,
  setVoiceProfileId,
}: {
  name?: string;
  setName?: (value: string) => void;
  pronunciation?: string;
  setPronunciation?: (value: string) => void;
  title: string;
  setTitle: (value: string) => void;
  voiceType: VoiceType;
  setVoiceType: (value: VoiceType) => void;
  tempo: "slow" | "medium" | "fast";
  setTempo: (value: "slow" | "medium" | "fast") => void;
  customStyle: string;
  setCustomStyle: (value: string) => void;
  initData: string;
  voiceProfileId: number | null;
  setVoiceProfileId: (value: number | null) => void;
}) {
  return (
    <>
      <StepHeading title="Голос и детали" text="Название можно оставить пустым. Предложим свое." />
      <div className="sc-form-stack">
        {setName && (
          <label>
            <span className="sc-field-label">Имя получателя</span>
            <input className="sc-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Татьяна" />
          </label>
        )}
        {setPronunciation && (
          <label>
            <span className="sc-field-label">Произношение имени</span>
            <input className="sc-input" value={pronunciation} onChange={(event) => setPronunciation(event.target.value)} placeholder="Например, ТатьЯна" />
            <small className="sc-field-help">Выделите ударную гласную заглавной буквой.</small>
          </label>
        )}
        <label>
          <span className="sc-field-label">Название трека</span>
          <input className="sc-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Необязательно" />
        </label>
      </div>

      <span className="sc-field-label spaced">Тембр</span>
      <div className="sc-choice-list sc-voice-types">
        {VOICES.map((item) => (
          <ChoiceButton key={item.id} item={item} selected={!voiceProfileId && voiceType === item.id} onClick={() => { setVoiceProfileId(null); setVoiceType(item.id as VoiceType); }} />
        ))}
      </div>


      <span className="sc-field-label spaced">Темп</span>
      <div className="sc-segmented">
        {[
          ["slow", "Спокойный"],
          ["medium", "Средний"],
          ["fast", "Энергичный"],
        ].map(([id, label]) => (
          <button key={id} className={tempo === id ? "selected" : ""} onClick={() => setTempo(id as typeof tempo)}>{label}</button>
        ))}
      </div>

      <label className="sc-form-label">
        <span>Пожелание по звучанию</span>
        <input className="sc-input" value={customStyle} onChange={(event) => setCustomStyle(event.target.value)} placeholder="Например, живое пианино и большой финал" maxLength={500} />
      </label>
    </>
  );
}

function DraftStep({
  draft,
  setDraft,
  sourceText,
  loading,
  error,
  instruction,
  setInstruction,
  prepare,
  revise,
}: {
  draft: ProducerDraft | null;
  setDraft: (draft: ProducerDraft | null) => void;
  sourceText: string;
  loading: boolean;
  error: string;
  instruction: string;
  setInstruction: (value: string) => void;
  prepare: () => void;
  revise: () => void;
}) {
  if (!draft) {
    return (
      <div className="sc-draft-empty">
        <span className="sc-draft-mark"><WandSparkles size={25} /></span>
        <h2>Подготовим текст</h2>
        <p>Соберем историю, выстроим рифму, хук и правильное произношение.</p>
        {error && <div className="sc-error-banner">{error}</div>}
        <button className="sc-btn-primary" disabled={loading} onClick={prepare}>
          {loading ? <LoaderCircle className="sc-spin" size={18} /> : <Sparkles size={18} />}
          {loading ? "Работаем над текстом..." : "Создать черновик"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="sc-step-heading sc-draft-heading">
        <div><span className="sc-kicker">Редакция {draft.revision}</span><h2>Проверьте текст</h2></div>
        <span className="sc-draft-ready"><Check size={14} /> Готов</span>
      </div>
      {draft.producerNote && <p className="sc-producer-note"><Sparkles size={15} />{draft.producerNote}</p>}
      <details className="sc-source-story">
        <summary><FilePenLine size={16} /> Исходная история</summary>
        <p>{sourceText}</p>
      </details>
      <label className="sc-form-label">
        <span>Название</span>
        <input
          className="sc-input"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          maxLength={80}
        />
      </label>
      <label className="sc-form-label">
        <span>Текст песни</span>
        <textarea
          className="sc-textarea sc-lyrics-editor"
          value={draft.lyrics}
          onChange={(event) => setDraft({ ...draft, lyrics: event.target.value })}
        />
      </label>
      {draft.pronunciationHints.length > 0 && (
        <div className="sc-pronunciation-row">
          <Mic2 size={15} />
          <span>Произношение:</span>
          {draft.pronunciationHints.map((hint) => <strong key={hint}>{hint}</strong>)}
        </div>
      )}
      <div className="sc-revision-row">
        <input
          className="sc-input"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Например: сделай припев теплее"
          maxLength={1000}
        />
        <button disabled={loading || instruction.trim().length < 3} onClick={revise} aria-label="Применить правку">
          {loading ? <LoaderCircle className="sc-spin" size={18} /> : <RefreshCw size={18} />}
        </button>
      </div>
      {error && <div className="sc-error-banner">{error}</div>}
    </>
  );
}

function OrderSummaryStep({
  error,
  submitting,
  initData,
  addCover,
  setAddCover,
  giftPhotoToken,
  setGiftPhotoToken,
  addVideo,
  setAddVideo,
  videoPhotoTokens,
  setVideoPhotoTokens,
  addSpokenIntro,
  setAddSpokenIntro,
  spokenIntroToken,
  setSpokenIntroToken,
  submit,
}: {
  error: string;
  submitting: boolean;
  initData: string;
  addCover: boolean;
  setAddCover: (value: boolean) => void;
  giftPhotoToken: string | null;
  setGiftPhotoToken: (value: string | null) => void;
  addVideo: boolean;
  setAddVideo: (value: boolean) => void;
  videoPhotoTokens: string[];
  setVideoPhotoTokens: (value: string[]) => void;
  addSpokenIntro: boolean;
  setAddSpokenIntro: (value: boolean) => void;
  spokenIntroToken: string | null;
  setSpokenIntroToken: (value: string | null) => void;
  submit: () => void;
}) {
  const total = SONG_OFFER.price + (addCover ? ORDER_ADDONS.cover.price : 0);

  return (
    <>
      <StepHeading title="Состав заказа" text="Сначала проверьте наполнение. Оплата сформируется по итоговой сумме." />
      <div className="sc-order-base">
        <span className="sc-order-base-icon"><AudioLines size={22} /></span>
        <span><small>В заказ входит</small><strong>{SONG_OFFER.name}</strong><em>Разные тексты, хуки и аранжировки</em></span>
        <b><del>{SONG_OFFER.regularPrice} ₽</del>{SONG_OFFER.price} ₽</b>
      </div>

      <div className="sc-plan-quality-note">
        <Sparkles size={17} />
        <span>Сначала создадим 3 версии трека. Фото-обложка — платная опция: загрузите 1 фото, и оно станет оформлением трека и подарка во всех вариантах пересылки.</span>
      </div>

      <div className="sc-addon-list compact">
        <button type="button" className={`sc-addon-row ${addCover ? "selected" : ""}`} onClick={() => setAddCover(!addCover)}>
          <span className="sc-addon-icon"><ImageIcon size={20} /></span>
          <span><strong>{ORDER_ADDONS.cover.name}</strong><small>1 фото клиента станет обложкой трека и страницы подарка</small></span>
          <b>+{ORDER_ADDONS.cover.price} ₽</b>
          <span className="sc-addon-check">{addCover && <Check size={14} />}</span>
        </button>
        {addCover && (
          <GiftPhotoUploader
            initData={initData}
            token={giftPhotoToken}
            onChange={setGiftPhotoToken}
          />
        )}
      </div>

      {error && <div className="sc-error-banner">{error}</div>}
      <div className="sc-checkout-total">
        <span><small>Итого</small><strong>{total.toLocaleString("ru-RU")} ₽</strong></span>
        <button
          type="button"
          disabled={submitting}
          onClick={submit}
        >
          {submitting ? <LoaderCircle className="sc-spin" size={19} /> : null}
          {submitting ? "Оформляем" : `Оформить и оплатить ${total.toLocaleString("ru-RU")} ₽`}
        </button>
      </div>
      <p className="sc-checkout-policy">
        Оформляя заказ, вы соглашаетесь с <a href="/songcraft/privacy">Политикой конфиденциальности</a>.
        Помощь: <a href="https://t.me/helpv3techbot" target="_blank" rel="noreferrer">@helpv3techbot</a>
      </p>
      <div className="sc-plan-quality-note">
        <FilePenLine size={17} />
        <span>Текст и состав заказа сохранены. Генерация начнется только после подтверждения оплаты.</span>
      </div>
    </>
  );
}

function PlanStep({
  error,
  submitting,
  ownVoice,
  submit,
}: {
  error: string;
  submitting: boolean;
  ownVoice: boolean;
  submit: (plan: PlanType) => void;
}) {
  const plans = Object.entries(PRICING) as [PlanType, (typeof PRICING)[PlanType]][];
  return (
    <>
      <StepHeading title="Выберите формат" text="Каждая версия получает отдельный текстовый хук и лучший дубль." />
      {ownVoice && <div className="sc-voice-plan-note"><Mic2 size={16} /> Собственный голос включен - доступен Voice Pro.</div>}
      {error && <div className="sc-error-banner">{error}</div>}
      <div className="sc-plan-list sc-create-plans">
        {plans.map(([id, plan]) => {
          const disabled = submitting || (ownVoice && id !== "PREMIUM");
          const featured = id === "STANDARD";
          return (
            <button key={id} className={featured ? "featured" : ""} disabled={disabled} onClick={() => submit(id)}>
              <span>
                <strong>{plan.name}</strong>
                <small>{plan.variantsCount} версии - {plan.wav ? "MP3 + WAV" : "MP3"}{plan.stems ? " + дорожки" : ""}</small>
              </span>
              <span className="sc-plan-price">
                {submitting && !disabled ? <LoaderCircle className="sc-spin" size={17} /> : null}
                {plan.price} ₽ <ArrowRight size={17} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="sc-plan-quality-note">
        <FilePenLine size={17} />
        <span>Текст уже сохранен. После оплаты начнется только музыкальная часть.</span>
      </div>
    </>
  );
}


