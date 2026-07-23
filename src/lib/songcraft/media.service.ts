import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { MEDIA_STORAGE_DIR, PUBLIC_BASE_URL } from "./config";

const MIME_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/ogg": ".ogg",
  "audio/webm": ".webm",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
};

function safeFilename(filename: string) {
  return (
    filename
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}\s._-]+/gu, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 100) || "songcraft-file"
  );
}

function extensionFor(filename: string, mimeType: string) {
  const fromName = path.extname(filename).toLowerCase();
  if (fromName && fromName.length <= 8) return fromName;
  return MIME_EXTENSIONS[mimeType.toLowerCase()] ?? ".bin";
}

export function publicMediaUrl(token: string) {
  return `${PUBLIC_BASE_URL()}/api/songcraft/media/${token}`;
}

export interface StoredMedia {
  id: number;
  token: string;
  url: string;
  storagePath: string;
  filename: string;
  mimeType: string;
  size: number;
}

export async function storeMediaBuffer(input: {
  buffer: Buffer;
  userId?: number | null;
  kind: string;
  filename: string;
  mimeType: string;
  originalUrl?: string | null;
  isPublic?: boolean;
}): Promise<StoredMedia> {
  const baseDir = path.resolve(/* turbopackIgnore: true */ MEDIA_STORAGE_DIR());
  await mkdir(baseDir, { recursive: true });

  const filename = safeFilename(input.filename);
  const extension = extensionFor(filename, input.mimeType);
  const storagePath = path.join(
    /* turbopackIgnore: true */ baseDir,
    `${randomUUID()}${extension}`
  );
  await writeFile(storagePath, input.buffer, { flag: "wx" });

  try {
    const asset = await prisma.mediaAsset.create({
      data: {
        userId: input.userId ?? null,
        kind: input.kind,
        storagePath,
        filename,
        mimeType: input.mimeType || "application/octet-stream",
        size: input.buffer.length,
        originalUrl: input.originalUrl ?? null,
        isPublic: input.isPublic ?? true,
      },
    });
    return {
      ...asset,
      url: publicMediaUrl(asset.token),
    };
  } catch (error) {
    await rm(storagePath, { force: true }).catch(() => null);
    throw error;
  }
}

export async function storeRemoteMedia(input: {
  url: string;
  userId?: number | null;
  kind: string;
  filename: string;
  fallbackMimeType: string;
  maxBytes?: number;
}): Promise<StoredMedia> {
  const response = await fetch(input.url, {
    method: "GET",
    redirect: "follow",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Unable to archive ${input.kind}: HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  const maxBytes = input.maxBytes ?? 80 * 1024 * 1024;
  if (contentLength > maxBytes) {
    throw new Error(`Unable to archive ${input.kind}: file is too large`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw new Error(`Unable to archive ${input.kind}: file is too large`);
  }

  return storeMediaBuffer({
    buffer,
    userId: input.userId,
    kind: input.kind,
    filename: input.filename,
    mimeType: response.headers.get("content-type")?.split(";")[0] || input.fallbackMimeType,
    originalUrl: input.url,
  });
}

export async function getMediaAsset(token: string) {
  return prisma.mediaAsset.findUnique({ where: { token } });
}

export async function getOwnedMediaAsset(token: string, userId: number) {
  return prisma.mediaAsset.findFirst({ where: { token, userId } });
}

export async function readMediaAsset(token: string) {
  const asset = await getMediaAsset(token);
  if (!asset) return null;

  const baseDir = path.resolve(/* turbopackIgnore: true */ MEDIA_STORAGE_DIR());
  const resolvedPath = path.resolve(/* turbopackIgnore: true */ asset.storagePath);
  if (resolvedPath !== baseDir && !resolvedPath.startsWith(`${baseDir}${path.sep}`)) {
    throw new Error("Stored media path is outside the configured media directory");
  }

  const buffer = await readFile(resolvedPath);
  return { asset, buffer };
}

export async function deleteMediaAsset(token: string, userId?: number) {
  const asset = await prisma.mediaAsset.findUnique({ where: { token } });
  if (!asset || (userId && asset.userId !== userId)) return false;

  await prisma.mediaAsset.delete({ where: { id: asset.id } });
  await rm(asset.storagePath, { force: true }).catch(() => null);
  return true;
}
