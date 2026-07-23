"use client";

import { useEffect, useRef } from "react";

interface WaveformAnimationProps {
  isPlaying: boolean;
  analyserNode?: AnalyserNode | null;
  bars?: number;
  color?: string;
}

export function WaveformAnimation({
  isPlaying,
  analyserNode,
  bars = 24,
  color = "#C9A84C",
}: WaveformAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const barW = W / bars - 2;

    function drawIdle() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < bars; i++) {
        const phase = (Date.now() / 400 + i * 0.4) % (Math.PI * 2);
        const h = (Math.sin(phase) * 0.4 + 0.6) * H * 0.4;
        const x = i * (W / bars);
        const y = (H - h) / 2;
        ctx.fillStyle = color + "66";
        ctx.beginPath();
        ctx.roundRect(x, y, barW, h, 2);
        ctx.fill();
      }
    }

    function drawAnalyser(dataArray: Uint8Array) {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const step = Math.floor(dataArray.length / bars);
      for (let i = 0; i < bars; i++) {
        const value = dataArray[i * step] / 255;
        const h = Math.max(4, value * H * 0.9);
        const x = i * (W / bars);
        const y = (H - h) / 2;
        const alpha = 0.6 + value * 0.4;
        ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0");
        ctx.beginPath();
        ctx.roundRect(x, y, barW, h, 2);
        ctx.fill();
      }
    }

    function loop() {
      if (analyserNode) {
        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteFrequencyData(dataArray);
        drawAnalyser(dataArray);
      } else {
        drawIdle();
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    if (isPlaying) {
      loop();
    } else {
      cancelAnimationFrame(rafRef.current);
      drawIdle();
    }

    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, analyserNode, bars, color]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={48}
      style={{ width: "100%", height: "48px", display: "block" }}
    />
  );
}
