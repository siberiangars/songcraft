import { NextRequest, NextResponse } from "next/server";
import { getMediaAsset } from "@/lib/songcraft/media.service";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const asset = await getMediaAsset(token);
  if (!asset || !asset.isPublic) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  let stat;
  try {
    stat = statSync(asset.storagePath);
  } catch {
    return NextResponse.json({ error: "Media unavailable" }, { status: 404 });
  }

  const range = req.headers.get("range");
  const download = req.nextUrl.searchParams.get("download") === "1";
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": asset.mimeType,
  });

  if (download) {
    const encoded = encodeURIComponent(asset.filename);
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encoded}`);
  }

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stat.size - 1;
    if (start < 0 || end >= stat.size || start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }

    headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(createReadStream(asset.storagePath, { start, end })) as ReadableStream;
    return new NextResponse(stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(stat.size));
  const stream = Readable.toWeb(createReadStream(asset.storagePath)) as ReadableStream;
  return new NextResponse(stream, { status: 200, headers });
}

