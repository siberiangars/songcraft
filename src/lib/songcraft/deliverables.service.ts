import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import prisma from "@/lib/prisma";
import { getMediaAsset, publicMediaUrl, storeMediaBuffer, storeRemoteMedia } from "./media.service";

type DeliverableSong = {
  id: number;
  title: string;
  audioUrl: string;
  imageUrl: string | null;
  qualityScore: number | null;
  variantIndex: number;
};

async function download(url: string, maxBytes = 100 * 1024 * 1024) {
  const response = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!response.ok) throw new Error(`Не удалось загрузить материал: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > maxBytes) throw new Error("Некорректный размер материала");
  return buffer;
}

async function runFfmpeg(args: string[], timeoutMs = 180_000) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    const diagnostics: Buffer[] = [];
    const timeout = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => diagnostics.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(diagnostics).toString("utf8").slice(-2000) || `ffmpeg: ${code}`));
    });
  });
}

async function probeDuration(filePath: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const output: Buffer[] = [];
    const diagnostics: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => diagnostics.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      const duration = Number(Buffer.concat(output).toString("utf8").trim());
      if (code === 0 && Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error(Buffer.concat(diagnostics).toString("utf8") || "Не удалось определить длину трека"));
    });
  });
}

async function prependIntro(input: {
  introPath: string;
  song: DeliverableSong;
  userId: number;
  workDir: string;
}) {
  const songPath = path.join(input.workDir, `song-${input.song.id}.mp3`);
  const outputPath = path.join(input.workDir, `with-intro-${input.song.id}.mp3`);
  await writeFile(songPath, await download(input.song.audioUrl));
  await runFfmpeg([
    "-i", input.introPath,
    "-i", songPath,
    "-filter_complex", "[0:a]aresample=44100,apad=pad_dur=0.6[a0];[1:a]aresample=44100[a1];[a0][a1]concat=n=2:v=0:a=1[out]",
    "-map", "[out]",
    "-c:a", "libmp3lame",
    "-b:a", "256k",
    outputPath,
  ]);
  const stored = await storeMediaBuffer({
    buffer: await readFile(outputPath),
    userId: input.userId,
    kind: "song_with_spoken_intro",
    filename: `${input.song.title}.mp3`,
    mimeType: "audio/mpeg",
  });
  await prisma.song.update({
    where: { id: input.song.id },
    data: { audioUrl: stored.url },
  });
  return { ...input.song, audioUrl: stored.url };
}

function photoLayout(inputLabel: string, outputLabel: string, suffix: string) {
  return [
    `[${inputLabel}]split=2[bg${suffix}][fg${suffix}]`,
    `[bg${suffix}]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=32[blur${suffix}]`,
    `[fg${suffix}]scale=980:1760:force_original_aspect_ratio=decrease[front${suffix}]`,
    `[blur${suffix}][front${suffix}]overlay=(W-w)/2:(H-h)/2,eq=saturation=1.05:contrast=1.025,setsar=1[${outputLabel}]`,
  ].join(";");
}

async function createSlideshowVideo(input: {
  song: DeliverableSong;
  photoPaths: string[];
  userId: number;
  workDir: string;
}) {
  const audioPath = path.join(input.workDir, "video-audio.mp3");
  const outputPath = path.join(input.workDir, "songcraft-video.mp4");
  await writeFile(audioPath, await download(input.song.audioUrl));
  const audioDuration = await probeDuration(audioPath);
  const stillDuration = 5.3;
  const transitionDuration = 0.7;
  const holdSegments: string[] = [];
  const transitionSegments: string[] = [];

  for (let index = 0; index < input.photoPaths.length; index += 1) {
    const segmentPath = path.join(input.workDir, `photo-${index}.mp4`);
    const zoom = index % 2 === 0
      ? "min(zoom+0.00045,1.10)"
      : "if(eq(on,1),1.10,max(zoom-0.00045,1.0))";
    await runFfmpeg([
      "-loop", "1",
      "-framerate", "30",
      "-t", String(stillDuration),
      "-i", input.photoPaths[index],
      "-vf", `${photoLayout("0:v", "photo", `hold${index}`)};[photo]zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,format=yuv420p`,
      "-an",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-r", "30",
      segmentPath,
    ]);
    holdSegments.push(segmentPath);

    const nextIndex = (index + 1) % input.photoPaths.length;
    const transitionPath = path.join(input.workDir, `transition-${index}.mp4`);
    await runFfmpeg([
      "-loop", "1", "-framerate", "30", "-t", String(transitionDuration), "-i", input.photoPaths[index],
      "-loop", "1", "-framerate", "30", "-t", String(transitionDuration), "-i", input.photoPaths[nextIndex],
      "-filter_complex",
      `${photoLayout("0:v", "from", `from${index}`)};${photoLayout("1:v", "to", `to${index}`)};[from][to]xfade=transition=fade:duration=${transitionDuration}:offset=0,format=yuv420p[out]`,
      "-map", "[out]",
      "-an",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-r", "30",
      transitionPath,
    ]);
    transitionSegments.push(transitionPath);
  }

  const cycleDuration = input.photoPaths.length * (stillDuration + transitionDuration);
  const cycles = Math.ceil((audioDuration + 1) / cycleDuration);
  const concatEntries: string[] = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (let index = 0; index < holdSegments.length; index += 1) {
      concatEntries.push(`file '${holdSegments[index].replace(/'/g, "'\\''")}'`);
      concatEntries.push(`file '${transitionSegments[index].replace(/'/g, "'\\''")}'`);
    }
  }
  const concatPath = path.join(input.workDir, "slideshow.txt");
  await writeFile(concatPath, `${concatEntries.join("\n")}\n`, "utf8");

  await runFfmpeg([
    "-f", "concat",
    "-safe", "0",
    "-i", concatPath,
    "-i", audioPath,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    outputPath,
  ], 420_000);
  return storeMediaBuffer({
    buffer: await readFile(outputPath),
    userId: input.userId,
    kind: "order_music_video",
    filename: `${input.song.title}.mp4`,
    mimeType: "video/mp4",
  });
}

export async function buildOrderDeliverables(input: {
  orderId: number;
  userId: number;
  addCover: boolean;
  giftPhotoToken?: string | null;
  addVideo: boolean;
  videoPhotoTokens: string[];
  spokenIntroToken: string | null;
  songs: DeliverableSong[];
}) {
  if (!input.songs.length) return input.songs;
  const workDir = await mkdtemp(path.join(os.tmpdir(), `songcraft-${input.orderId}-`));
  try {
    let songs = input.songs;
    if (input.spokenIntroToken) {
      const intro = await getMediaAsset(input.spokenIntroToken);
      if (!intro || intro.userId !== input.userId || intro.kind !== "spoken_intro") {
        throw new Error("Голосовое вступление заказа не найдено");
      }
      songs = await Promise.all(songs.map((song) => prependIntro({
        introPath: intro.storagePath,
        song,
        userId: input.userId,
        workDir,
      })));
    }

    const bestSong = [...songs].sort((a, b) =>
      (b.qualityScore ?? 0) - (a.qualityScore ?? 0) || a.variantIndex - b.variantIndex
    )[0];
    if (input.addCover && input.giftPhotoToken) {
      const giftPhoto = await getMediaAsset(input.giftPhotoToken);
      if (!giftPhoto || giftPhoto.userId !== input.userId || giftPhoto.kind !== "gift_cover_photo") {
        throw new Error("Фото для обложки подарка не найдено");
      }
      const coverUrl = publicMediaUrl(giftPhoto.token);
      await prisma.song.updateMany({
        where: { id: { in: songs.map((song) => song.id) }, orderId: input.orderId },
        data: { imageUrl: coverUrl, providerImageUrl: coverUrl },
      });
      await prisma.order.update({ where: { id: input.orderId }, data: { coverUrl } });
      songs = songs.map((song) => ({ ...song, imageUrl: coverUrl }));
    } else if (input.addCover && bestSong.imageUrl) {
      const cover = await storeRemoteMedia({
        url: bestSong.imageUrl,
        userId: input.userId,
        kind: "order_cover",
        filename: `${bestSong.title}-cover.jpg`,
        fallbackMimeType: "image/jpeg",
        maxBytes: 20 * 1024 * 1024,
      });
      await prisma.order.update({ where: { id: input.orderId }, data: { coverUrl: cover.url } });
    }
    if (input.addVideo) {
      const photos = await Promise.all(input.videoPhotoTokens.map((token) => getMediaAsset(token)));
      if (photos.length < 3 || photos.some((photo) =>
        !photo || photo.userId !== input.userId || photo.kind !== "slideshow_photo"
      )) {
        throw new Error("Фотографии для видео-слайдшоу не найдены");
      }
      const video = await createSlideshowVideo({
        song: bestSong,
        photoPaths: photos.map((photo) => photo!.storagePath),
        userId: input.userId,
        workDir,
      });
      await prisma.order.update({ where: { id: input.orderId }, data: { videoUrl: video.url } });
    }
    return songs;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => null);
  }
}
