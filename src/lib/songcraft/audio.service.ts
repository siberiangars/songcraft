import { spawn } from "node:child_process";

const CONVERSION_TIMEOUT_MS = 45_000;
const MAX_NORMALIZED_AUDIO_BYTES = 20 * 1024 * 1024;

export class InvalidAudioError extends Error {
  constructor(message = "The uploaded file does not contain supported audio") {
    super(message);
    this.name = "InvalidAudioError";
  }
}

export async function normalizeVoiceAudio(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-map",
        "0:a:0",
        "-t",
        "300",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "44100",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        "-map_metadata",
        "-1",
        "-f",
        "mp3",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    const output: Buffer[] = [];
    const diagnostics: Buffer[] = [];
    let outputSize = 0;
    let diagnosticsSize = 0;
    let settled = false;

    const finish = (error?: Error, result?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(result ?? Buffer.alloc(0));
    };

    const timeout = setTimeout(() => {
      ffmpeg.kill("SIGKILL");
      finish(new InvalidAudioError("Audio conversion timed out"));
    }, CONVERSION_TIMEOUT_MS);

    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      outputSize += chunk.length;
      if (outputSize > MAX_NORMALIZED_AUDIO_BYTES) {
        ffmpeg.kill("SIGKILL");
        finish(new InvalidAudioError("Normalized audio is too large"));
        return;
      }
      output.push(chunk);
    });

    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      if (diagnosticsSize >= 8_192) return;
      diagnostics.push(chunk);
      diagnosticsSize += chunk.length;
    });

    ffmpeg.once("error", (error) => finish(error));
    ffmpeg.once("close", (code) => {
      if (code === 0 && outputSize > 0) {
        finish(undefined, Buffer.concat(output, outputSize));
        return;
      }
      const details = Buffer.concat(diagnostics).toString("utf8").trim();
      finish(new InvalidAudioError(details || `ffmpeg exited with code ${code}`));
    });

    ffmpeg.stdin.on("error", () => null);
    ffmpeg.stdin.end(input);
  });
}
