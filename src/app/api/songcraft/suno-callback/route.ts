import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/songcraft/logger";
import { SUNO_CALLBACK_SECRET } from "@/lib/songcraft/config";

export async function POST(req: NextRequest) {
  const callbackSecret = SUNO_CALLBACK_SECRET();
  if (callbackSecret && req.nextUrl.searchParams.get("token") !== callbackSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.text();
  if (!raw || raw.length > 2_000_000) {
    return NextResponse.json({ error: "Invalid callback body" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data = (body.data ?? {}) as Record<string, unknown>;
  const taskId = String(
    data.task_id ?? data.taskId ?? body.task_id ?? body.taskId ?? ""
  );
  const callbackType = String(data.callbackType ?? body.callbackType ?? "");
  const code = Number(body.code ?? 0);

  if (!taskId) {
    logger.warn("Suno callback without task id", { code, callbackType });
    return NextResponse.json({ ok: true });
  }

  const failed =
    code >= 400 ||
    ["error", "failed", "fail"].includes(String(data.status ?? "").toLowerCase());
  const completed =
    callbackType === "complete" ||
    ["SUCCESS", "success", "completed", "complete"].includes(String(data.status ?? ""));

  await prisma.sunoTask.upsert({
    where: { taskId },
    update: {
      callbackType: callbackType || null,
      responseJson: raw,
      status: failed ? "FAILED" : completed ? "COMPLETED" : "PROCESSING",
      errorMessage: failed
        ? String(data.errorMessage ?? body.msg ?? "Suno callback reported a failure")
        : null,
    },
    create: {
      taskId,
      kind: "unknown",
      callbackType: callbackType || null,
      responseJson: raw,
      status: failed ? "FAILED" : completed ? "COMPLETED" : "PROCESSING",
      errorMessage: failed
        ? String(data.errorMessage ?? body.msg ?? "Suno callback reported a failure")
        : null,
    },
  });

  logger.info("Suno callback received", {
    code,
    taskId,
    callbackType,
  });

  return NextResponse.json({ ok: true });
}
