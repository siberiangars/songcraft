import { REDIS_URL } from "./config";
import { logger } from "./logger";

export const MUSIC_QUEUE = "music-generation";

let _queue: import("bullmq").Queue | null = null;
let _unavailable = false;

export async function getMusicQueue() {
  if (_unavailable) return null;
  if (_queue) return _queue;

  try {
    const { Queue } = await import("bullmq");
    _queue = new Queue(MUSIC_QUEUE, {
      connection: { url: REDIS_URL() },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
    return _queue;
  } catch (e) {
    logger.warn("BullMQ unavailable — Redis not running", { e: String(e) });
    _unavailable = true;
    return null;
  }
}

export async function enqueueGeneration(orderId: number) {
  const queue = await getMusicQueue();
  if (!queue) {
    logger.warn("Queue unavailable, order will not be processed automatically", { orderId });
    return null;
  }
  const job = await queue.add(
    "generate",
    { kind: "generate", orderId },
    { jobId: `order-${orderId}` }
  );
  return job.id;
}

export async function enqueueDeliverables(orderId: number, songId: number) {
  const queue = await getMusicQueue();
  if (!queue) {
    logger.warn("Queue unavailable, video will not be processed automatically", { orderId, songId });
    return null;
  }
  const job = await queue.add(
    "deliverables",
    { kind: "deliverables", orderId, songId },
    { jobId: `deliverables-${orderId}-${songId}-${Date.now()}` }
  );
  return job.id;
}

export async function enqueueSongAction(actionId: number) {
  const queue = await getMusicQueue();
  if (!queue) {
    logger.warn("Queue unavailable, song action will remain pending", { actionId });
    return null;
  }
  const job = await queue.add(
    "song-action",
    { kind: "song-action", actionId },
    { jobId: `song-action-${actionId}` }
  );
  return job.id;
}
