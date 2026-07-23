import prisma from "@/lib/prisma";
import {
  PUBLIC_BASE_URL,
  SUNO_API_KEY,
  SUNO_API_URL,
  SUNO_AUDIO_WEIGHT,
  SUNO_CALLBACK_SECRET,
  SUNO_FALLBACK_MODEL,
  SUNO_MODEL,
  SUNO_PROVIDER,
  SUNO_STYLE_WEIGHT,
  SUNO_WEIRDNESS,
} from "./config";
import { logger } from "./logger";

export type SunoModel = "V4" | "V4_5" | "V4_5PLUS" | "V4_5ALL" | "V5" | "V5_5";
export type VocalGender = "m" | "f";
export type PersonaModel = "style_persona" | "voice_persona";

export interface GenerateParams {
  prompt: string;
  lyrics: string;
  title: string;
  instrumental?: boolean;
  model?: SunoModel;
  negativeTags?: string;
  vocalGender?: VocalGender;
  styleWeight?: number;
  weirdnessConstraint?: number;
  audioWeight?: number;
  personaId?: string;
  personaModel?: PersonaModel;
}

export interface SunoTaskContext {
  kind: string;
  orderId?: number;
  actionId?: number;
  voiceProfileId?: number;
  variantIndex?: number;
}

export interface SunoSong {
  id: string;
  audioUrl: string;
  streamAudioUrl?: string;
  imageUrl: string;
  duration: number;
  title?: string;
  tags?: string;
}

export interface StatusResult {
  status: "pending" | "processing" | "completed" | "failed";
  songs?: SunoSong[];
  error?: string;
  raw?: unknown;
}

export interface TimedLyricWord {
  word: string;
  success: boolean;
  startS: number;
  endS: number;
  palign?: number;
}

export interface TimedLyricsResult {
  alignedWords: TimedLyricWord[];
  waveformData: number[];
  hootCer?: number;
  isStreamed?: boolean;
}

export interface VoiceTaskResult {
  status: string;
  phrase?: string;
  voiceId?: string;
  error?: string;
}

export interface ProcessingResult {
  status: "pending" | "completed" | "failed";
  data?: Record<string, unknown>;
  error?: string;
}

const FAILED_STATUSES = new Set([
  "CREATE_TASK_FAILED",
  "GENERATE_AUDIO_FAILED",
  "GENERATE_WAV_FAILED",
  "SEPARATE_AUDIO_FAILED",
  "CALLBACK_EXCEPTION",
  "SENSITIVE_WORD_ERROR",
  "PROCESSING_VALIDATE_FAIL",
  "FAILED",
  "FAIL",
  "ERROR",
]);

const COMPLETED_STATUSES = new Set(["SUCCESS", "COMPLETE", "COMPLETED"]);

function normalizedStatus(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function generationModel(model: SunoModel, personaModel?: PersonaModel): SunoModel {
  if (personaModel === "voice_persona" && model !== "V5" && model !== "V5_5") {
    return "V5_5";
  }
  return model;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bounded(value: number | undefined, fallback: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

function callbackUrl() {
  const secret = SUNO_CALLBACK_SECRET();
  const query = secret ? `?token=${encodeURIComponent(secret)}` : "";
  return `${PUBLIC_BASE_URL()}/api/songcraft/suno-callback${query}`;
}

async function sunoFetch(path: string, init?: RequestInit) {
  const configuredBaseUrl = SUNO_API_URL();
  const baseUrl =
    configuredBaseUrl === "https://api.sunoapi.org/v1"
      ? "https://api.sunoapi.org/api/v1"
      : configuredBaseUrl;
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${SUNO_API_KEY()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }

  if (!response.ok) {
    throw new Error(`Suno ${path} ${response.status}: ${text.slice(0, 800)}`);
  }
  return body as Record<string, unknown>;
}

function extractTaskId(data: Record<string, unknown>) {
  const nested = data.data as Record<string, unknown> | undefined;
  return String(nested?.taskId ?? data.taskId ?? data.id ?? "");
}

async function registerTask(taskId: string, context: SunoTaskContext) {
  if (!taskId) return;
  await prisma.sunoTask.upsert({
    where: { taskId },
    update: {
      kind: context.kind,
      orderId: context.orderId,
      actionId: context.actionId,
      voiceProfileId: context.voiceProfileId,
      variantIndex: context.variantIndex,
    },
    create: {
      taskId,
      kind: context.kind,
      orderId: context.orderId,
      actionId: context.actionId,
      voiceProfileId: context.voiceProfileId,
      variantIndex: context.variantIndex,
    },
  });
}

function normalizeSongs(input: unknown): SunoSong[] {
  const records = Array.isArray(input) ? input : input ? [input] : [];
  return records
    .map((record) => {
      const item = record as Record<string, unknown>;
      return {
        id: String(item.id ?? item.audioId ?? ""),
        audioUrl: String(item.audio_url ?? item.audioUrl ?? ""),
        streamAudioUrl: item.stream_audio_url
          ? String(item.stream_audio_url)
          : item.streamAudioUrl
            ? String(item.streamAudioUrl)
            : undefined,
        imageUrl: String(item.image_url ?? item.imageUrl ?? ""),
        duration: Math.round(Number(item.duration ?? 0)),
        title: item.title ? String(item.title) : undefined,
        tags: item.tags ? String(item.tags) : undefined,
      };
    })
    .filter((song) => song.id && song.audioUrl);
}

function parseGenerationStatus(response: unknown): StatusResult {
  const root = (response ?? {}) as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  const taskStatus = String(data.status ?? data.successFlag ?? root.status ?? "");
  const taskError = String(
    data.errorMessage ?? data.error_message ?? root.errorMessage ?? root.error_message ?? ""
  );
  const responseData = (data.response ?? {}) as Record<string, unknown>;
  const records =
    responseData.sunoData ??
    responseData.data ??
    data.sunoData ??
    data.audioData ??
    data.data ??
    (Array.isArray(data) ? data : undefined);
  const songs = normalizeSongs(records);
  const normalizedTaskStatus = normalizedStatus(taskStatus);

  if (FAILED_STATUSES.has(normalizedTaskStatus)) {
    return {
      status: "failed",
      error: taskError || `Suno task failed: ${taskStatus || "unknown status"}`,
      raw: response,
    };
  }
  if (songs.length && COMPLETED_STATUSES.has(normalizedTaskStatus)) {
    return { status: "completed", songs, raw: response };
  }
  if (songs.length >= 2) {
    return { status: "completed", songs, raw: response };
  }
  if (
    ["TEXT_SUCCESS", "FIRST_SUCCESS", "RUNNING", "PROCESSING", "PENDING", "WAIT_PROCESSING"].includes(
      normalizedTaskStatus
    )
  ) {
    return { status: "processing", songs: songs.length ? songs : undefined, raw: response };
  }
  return { status: "pending", songs: songs.length ? songs : undefined, raw: response };
}

async function callbackTaskStatus(taskId: string): Promise<StatusResult | null> {
  const task = await prisma.sunoTask.findUnique({ where: { taskId } }).catch(() => null);
  if (task?.status === "FAILED") {
    return {
      status: "failed",
      error: task.errorMessage ?? "Suno callback reported a failure",
    };
  }
  if (!task?.responseJson) return null;
  try {
    return parseGenerationStatus(JSON.parse(task.responseJson));
  } catch {
    return null;
  }
}

async function createGenerationTask(
  endpoint: string,
  payload: Record<string, unknown>,
  context: SunoTaskContext
) {
  const response = await sunoFetch(endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const taskId = extractTaskId(response);
  if (!taskId) {
    throw new Error(`Suno did not return taskId: ${JSON.stringify(response).slice(0, 1000)}`);
  }
  await registerTask(taskId, context);
  return { taskId, response };
}

async function generateSunoApi(
  params: GenerateParams,
  context: SunoTaskContext
): Promise<{ jobId: string; model: SunoModel }> {
  const requestedModel = (params.model ?? SUNO_MODEL()) as SunoModel;
  const model = generationModel(requestedModel, params.personaModel);
  logger.info("Suno: creating v5 generation task", {
    title: params.title,
    model,
    variantIndex: context.variantIndex,
    voicePersona: params.personaModel === "voice_persona",
  });

  const { taskId } = await createGenerationTask(
    "/generate",
    {
      customMode: true,
      instrumental: params.instrumental ?? false,
      prompt: params.lyrics,
      style: params.prompt,
      title: params.title,
      model,
      callBackUrl: callbackUrl(),
      negativeTags: params.negativeTags || undefined,
      vocalGender: params.vocalGender,
      styleWeight: bounded(params.styleWeight, SUNO_STYLE_WEIGHT()),
      weirdnessConstraint: bounded(params.weirdnessConstraint, SUNO_WEIRDNESS()),
      audioWeight: bounded(params.audioWeight, SUNO_AUDIO_WEIGHT()),
      personaId: params.personaId,
      personaModel: params.personaId ? params.personaModel ?? "style_persona" : undefined,
    },
    context
  );
  return { jobId: taskId, model };
}

async function generateKie(
  params: GenerateParams,
  context: SunoTaskContext
): Promise<{ jobId: string; model: SunoModel }> {
  const model = (params.model ?? SUNO_MODEL()) as SunoModel;
  const response = await fetch(`${SUNO_API_URL()}/suno/v1/music`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUNO_API_KEY()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      style_prompt: params.prompt,
      lyric: params.lyrics,
      title: params.title,
      custom_mode: true,
      instrumental: params.instrumental ?? false,
    }),
  });
  if (!response.ok) throw new Error(`Kie API error ${response.status}`);
  const data = (await response.json()) as Record<string, unknown>;
  const jobId = String(data.task_id ?? data.id ?? "");
  if (!jobId) throw new Error("Kie did not return task id");
  await registerTask(jobId, context);
  return { jobId, model };
}

export async function generateSong(
  params: GenerateParams,
  context: SunoTaskContext
): Promise<{ jobId: string; model: SunoModel }> {
  if (SUNO_PROVIDER() === "kie") return generateKie(params, context);
  return generateSunoApi(params, context);
}

export async function checkStatus(jobId: string): Promise<StatusResult> {
  const callback = await callbackTaskStatus(jobId);
  if (callback?.status === "completed" || callback?.status === "failed") return callback;
  const response = await sunoFetch(`/generate/record-info?taskId=${encodeURIComponent(jobId)}`, {
    method: "GET",
  });
  return parseGenerationStatus(response);
}

export async function waitForCompletion(
  jobId: string,
  maxWaitMs = 420_000
): Promise<{ songs: SunoSong[] }> {
  const startedAt = Date.now();
  let providerPollAt = 0;
  let lastPartial: SunoSong[] = [];
  let consecutivePollErrors = 0;

  const persistStatus = async (result: StatusResult) => {
    const status =
      result.status === "completed"
        ? "COMPLETED"
        : result.status === "failed"
          ? "FAILED"
          : "PROCESSING";
    await prisma.sunoTask.updateMany({
      where: { taskId: jobId },
      data: {
        status,
        responseJson: result.raw === undefined ? undefined : JSON.stringify(result.raw),
        errorMessage: result.status === "failed" ? result.error ?? "Song generation failed" : null,
      },
    });
  };

  while (Date.now() - startedAt < maxWaitMs) {
    await sleep(4_000);

    const callback = await callbackTaskStatus(jobId);
    if (callback?.songs?.length) lastPartial = callback.songs;
    if (callback?.status === "completed" && callback.songs?.length) {
      return { songs: callback.songs };
    }
    if (callback?.status === "failed") {
      throw new Error(callback.error ?? "Song generation failed");
    }

    if (Date.now() < providerPollAt) continue;
    providerPollAt = Date.now() + 15_000;
    let result: StatusResult;
    try {
      result = await checkStatus(jobId);
      consecutivePollErrors = 0;
    } catch (error) {
      consecutivePollErrors += 1;
      logger.warn("Suno status poll failed", {
        jobId,
        consecutivePollErrors,
        error: String(error),
      });
      if (consecutivePollErrors < 5) continue;
      await persistStatus({ status: "failed", error: String(error) });
      throw error;
    }
    await persistStatus(result);
    if (result.songs?.length) lastPartial = result.songs;
    logger.debug("Suno: task progress", { jobId, status: result.status, songs: result.songs?.length ?? 0 });

    if (result.status === "completed" && result.songs?.length) return { songs: result.songs };
    if (result.status === "failed") throw new Error(result.error ?? "Song generation failed");
  }

  if (lastPartial.length) {
    await persistStatus({ status: "completed", songs: lastPartial });
    return { songs: lastPartial };
  }
  await persistStatus({ status: "failed", error: "Timeout: song generation took too long" });
  throw new Error("Timeout: song generation took too long");
}

export async function generateWithFallback(
  params: GenerateParams,
  context: SunoTaskContext
): Promise<{ jobId: string; model: SunoModel }> {
  try {
    return await generateSong(params, context);
  } catch (error) {
    const requested = (params.model ?? SUNO_MODEL()) as SunoModel;
    const fallback = SUNO_FALLBACK_MODEL() as SunoModel;
    if (requested === fallback) throw error;
    logger.warn("Suno primary model failed, retrying with fallback model", {
      requested,
      fallback,
      error: String(error),
    });
    return generateSong({ ...params, model: fallback }, context);
  }
}

export async function getRemainingCredits(): Promise<number> {
  const response = await sunoFetch("/generate/credit", { method: "GET" });
  const credits = Number(response.data);
  if (!Number.isFinite(credits)) throw new Error("Suno returned invalid credit balance");
  return credits;
}

export async function getTimedLyrics(taskId: string, audioId: string): Promise<TimedLyricsResult> {
  const response = await sunoFetch("/generate/get-timestamped-lyrics", {
    method: "POST",
    body: JSON.stringify({ taskId, audioId }),
  });
  const data = (response.data ?? {}) as Record<string, unknown>;
  return {
    alignedWords: Array.isArray(data.alignedWords)
      ? (data.alignedWords as TimedLyricWord[])
      : [],
    waveformData: Array.isArray(data.waveformData) ? (data.waveformData as number[]) : [],
    hootCer: Number.isFinite(Number(data.hootCer)) ? Number(data.hootCer) : undefined,
    isStreamed: Boolean(data.isStreamed),
  };
}

export async function extendSong(
  input: {
    audioId: string;
    prompt?: string;
    style?: string;
    title?: string;
    continueAt?: number;
    model?: SunoModel;
    personaId?: string;
    personaModel?: PersonaModel;
  },
  context: SunoTaskContext
) {
  const custom = Boolean(input.prompt && input.style && input.title && input.continueAt !== undefined);
  const { taskId } = await createGenerationTask(
    "/generate/extend",
    {
      defaultParamFlag: custom,
      audioId: input.audioId,
      model: input.model ?? SUNO_MODEL(),
      callBackUrl: callbackUrl(),
      prompt: custom ? input.prompt : undefined,
      style: custom ? input.style : undefined,
      title: custom ? input.title : undefined,
      continueAt: custom ? input.continueAt : undefined,
      personaId: input.personaId,
      personaModel: input.personaId ? input.personaModel ?? "style_persona" : undefined,
      styleWeight: SUNO_STYLE_WEIGHT(),
      weirdnessConstraint: SUNO_WEIRDNESS(),
      audioWeight: SUNO_AUDIO_WEIGHT(),
    },
    context
  );
  return taskId;
}

export async function coverAudio(
  input: {
    uploadUrl: string;
    lyrics: string;
    style: string;
    title: string;
    model?: SunoModel;
    negativeTags?: string;
    vocalGender?: VocalGender;
  },
  context: SunoTaskContext
) {
  const { taskId } = await createGenerationTask(
    "/generate/upload-cover",
    {
      uploadUrl: input.uploadUrl,
      customMode: true,
      instrumental: false,
      prompt: input.lyrics,
      style: input.style,
      title: input.title,
      model: input.model ?? SUNO_MODEL(),
      callBackUrl: callbackUrl(),
      negativeTags: input.negativeTags,
      vocalGender: input.vocalGender,
      styleWeight: SUNO_STYLE_WEIGHT(),
      weirdnessConstraint: SUNO_WEIRDNESS(),
      audioWeight: SUNO_AUDIO_WEIGHT(),
    },
    context
  );
  return taskId;
}

export async function replaceSongSection(
  input: {
    taskId?: string;
    audioId?: string;
    uploadUrl?: string;
    model?: SunoModel;
    replacementLyrics: string;
    fullLyrics: string;
    style: string;
    title: string;
    startS: number;
    endS: number;
    negativeTags?: string;
  },
  context: SunoTaskContext
) {
  const { taskId } = await createGenerationTask(
    "/generate/replace-section",
    {
      taskId: input.taskId,
      audioId: input.audioId,
      uploadUrl: input.uploadUrl,
      model: input.uploadUrl ? input.model ?? SUNO_MODEL() : undefined,
      prompt: input.replacementLyrics,
      tags: input.style,
      title: input.title,
      infillStartS: Math.round(input.startS * 100) / 100,
      infillEndS: Math.round(input.endS * 100) / 100,
      fullLyrics: input.fullLyrics,
      negativeTags: input.negativeTags,
      callBackUrl: callbackUrl(),
    },
    context
  );
  return taskId;
}

export async function addVocals(
  input: {
    uploadUrl: string;
    lyrics: string;
    style: string;
    title: string;
    model?: SunoModel;
    negativeTags?: string;
    vocalGender?: VocalGender;
  },
  context: SunoTaskContext
) {
  const { taskId } = await createGenerationTask(
    "/generate/add-vocals",
    {
      prompt: input.lyrics,
      title: input.title,
      style: input.style,
      uploadUrl: input.uploadUrl,
      callBackUrl: callbackUrl(),
      negativeTags: input.negativeTags,
      vocalGender: input.vocalGender,
      styleWeight: SUNO_STYLE_WEIGHT(),
      weirdnessConstraint: SUNO_WEIRDNESS(),
      audioWeight: SUNO_AUDIO_WEIGHT(),
      model: input.model ?? SUNO_MODEL(),
    },
    context
  );
  return taskId;
}

export async function convertSongToWav(
  taskId: string,
  audioId: string,
  context: SunoTaskContext
) {
  const result = await createGenerationTask(
    "/wav/generate",
    { taskId, audioId, callBackUrl: callbackUrl() },
    context
  );
  return result.taskId;
}

export async function separateSongStems(
  taskId: string,
  audioId: string,
  context: SunoTaskContext
) {
  const result = await createGenerationTask(
    "/vocal-removal/generate",
    { taskId, audioId, callBackUrl: callbackUrl(), type: "separate_vocal" },
    context
  );
  return result.taskId;
}

function parseProcessingStatus(response: Record<string, unknown>): ProcessingResult {
  const data = (response.data ?? {}) as Record<string, unknown>;
  const status = normalizedStatus(data.successFlag ?? data.status);
  if (COMPLETED_STATUSES.has(status)) {
    return {
      status: "completed",
      data: (data.response ?? data) as Record<string, unknown>,
    };
  }
  if (FAILED_STATUSES.has(status)) {
    return {
      status: "failed",
      error: String(data.errorMessage ?? data.errorCode ?? "Suno processing failed"),
      data,
    };
  }
  return { status: "pending", data };
}

export async function waitForProcessingTask(
  taskId: string,
  kind: "wav" | "stems",
  maxWaitMs = 300_000
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const endpoint = kind === "wav" ? "/wav/record-info" : "/vocal-removal/record-info";
  while (Date.now() - startedAt < maxWaitMs) {
    await sleep(8_000);
    const response = await sunoFetch(`${endpoint}?taskId=${encodeURIComponent(taskId)}`, {
      method: "GET",
    });
    const result = parseProcessingStatus(response);
    if (result.status === "completed") return result.data ?? {};
    if (result.status === "failed") throw new Error(result.error ?? `${kind} processing failed`);
  }
  throw new Error(`Timeout while waiting for ${kind}`);
}

export async function createVoiceValidationTask(
  input: {
    voiceUrl: string;
    vocalStartS: number;
    vocalEndS: number;
    language?: string;
  },
  context: SunoTaskContext
) {
  const { taskId } = await createGenerationTask(
    "/voice/validate",
    {
      voiceUrl: input.voiceUrl,
      vocalStartS: Math.max(0, Math.round(input.vocalStartS)),
      vocalEndS: Math.max(1, Math.round(input.vocalEndS)),
      language: input.language ?? "ru",
      callBackUrl: callbackUrl(),
    },
    context
  );
  return taskId;
}

export async function getVoiceValidation(taskId: string): Promise<VoiceTaskResult> {
  const response = await sunoFetch(`/voice/validate-info?taskId=${encodeURIComponent(taskId)}`, {
    method: "GET",
  });
  const data = (response.data ?? {}) as Record<string, unknown>;
  const status = String(data.status ?? "wait_processing");
  return {
    status,
    phrase: data.validateInfo ? String(data.validateInfo) : undefined,
    error:
      status.includes("fail") || data.errorMessage
        ? String(data.errorMessage ?? "Не удалось подготовить проверочную фразу")
        : undefined,
  };
}

export async function createCustomVoice(
  input: {
    validationTaskId: string;
    verifyUrl: string;
    voiceName: string;
    description?: string;
    style?: string;
    singerSkillLevel?: "beginner" | "intermediate" | "advanced" | "professional";
  },
  context: SunoTaskContext
) {
  const { taskId } = await createGenerationTask(
    "/voice/generate",
    {
      taskId: input.validationTaskId,
      verifyUrl: input.verifyUrl,
      voiceName: input.voiceName,
      description: input.description,
      style: input.style,
      singerSkillLevel: input.singerSkillLevel ?? "intermediate",
      callBackUrl: callbackUrl(),
    },
    context
  );
  return taskId;
}

export async function getCustomVoice(taskId: string): Promise<VoiceTaskResult> {
  const response = await sunoFetch(`/voice/record-info?taskId=${encodeURIComponent(taskId)}`, {
    method: "GET",
  });
  const data = (response.data ?? {}) as Record<string, unknown>;
  const status = String(data.status ?? "wait_processing");
  return {
    status,
    voiceId: data.voiceId ? String(data.voiceId) : undefined,
    error:
      status.includes("fail") || data.errorMessage
        ? String(data.errorMessage ?? "Не удалось создать профиль голоса")
        : undefined,
  };
}

export async function checkVoiceAvailable(taskId: string) {
  const response = await sunoFetch("/voice/check-voice", {
    method: "POST",
    body: JSON.stringify({ task_id: taskId }),
  });
  return response.data ?? response;
}
