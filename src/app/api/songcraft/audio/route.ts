import { NextRequest, NextResponse } from "next/server";

const ALLOWED_PROTOCOLS = new Set(["https:"]);
const ALLOWED_HOST_SUFFIXES = [
  "suno.ai",
  "sunoapi.org",
  "aiquickdraw.com",
  "v3techbots.online",
];

function allowedHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`)
  );
}

function validateUpstreamUrl(value: string) {
  const url = new URL(value);
  if (!ALLOWED_PROTOCOLS.has(url.protocol) || !allowedHostname(url.hostname)) {
    throw new Error("Blocked upstream URL");
  }
  if (url.username || url.password) throw new Error("Credentials are not allowed in upstream URL");
  return url;
}

async function fetchAudio(url: URL, headers: Headers, redirects = 0): Promise<Response> {
  if (redirects > 4) throw new Error("Too many redirects");
  const response = await fetch(url, {
    method: "GET",
    headers,
    redirect: "manual",
    cache: "no-store",
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirect without location");
    return fetchAudio(validateUpstreamUrl(new URL(location, url).toString()), headers, redirects + 1);
  }
  return response;
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("src");
  const download = req.nextUrl.searchParams.get("download") === "1";
  const rawName = req.nextUrl.searchParams.get("name") ?? "songcraft-track.mp3";
  if (!src) return NextResponse.json({ error: "Missing src" }, { status: 400 });

  let upstreamUrl: URL;
  try {
    upstreamUrl = validateUpstreamUrl(src);
  } catch {
    return NextResponse.json({ error: "Invalid or blocked src URL" }, { status: 400 });
  }

  const headers = new Headers();
  const range = req.headers.get("range");
  if (range) headers.set("Range", range);

  let upstream: Response;
  try {
    upstream = await fetchAudio(upstreamUrl, headers);
  } catch {
    return NextResponse.json({ error: "Upstream audio unavailable" }, { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json({ error: "Upstream audio unavailable" }, { status: 502 });
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type") ?? "audio/mpeg";
  if (!contentType.startsWith("audio/") && contentType !== "application/octet-stream") {
    return NextResponse.json({ error: "Upstream did not return audio" }, { status: 502 });
  }
  responseHeaders.set("Content-Type", contentType);
  if (download) {
    const safeName =
      rawName
        .replace(/[^\p{L}\p{N}\s._-]+/gu, "")
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 80) || "songcraft-track.mp3";
    responseHeaders.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`);
  }

  for (const key of [
    "accept-ranges",
    "content-length",
    "content-range",
    "etag",
    "last-modified",
    "cache-control",
  ]) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
}
