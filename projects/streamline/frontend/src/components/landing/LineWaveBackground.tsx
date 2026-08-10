"use client";

import { useEffect, useRef } from "react";
import type { SceneTheme } from "./heroScenes";

type LineWaveBackgroundProps = {
  theme?: SceneTheme;
};

type LinePalette = {
  bg: string;
  strokeRgb: string;
  alpha: number;
  lineWidth: number;
  lineSpacing: number;
};

const PALETTES: Record<SceneTheme, LinePalette> = {
  light: {
    bg: "#ffffff",
    strokeRgb: "0, 0, 0",
    alpha: 0.045,
    lineWidth: 0.5,
    lineSpacing: 24,
  },
  pro: {
    bg: "#0a0a0a",
    strokeRgb: "255, 255, 255",
    alpha: 0.055,
    lineWidth: 0.5,
    lineSpacing: 24,
  },
};

const MAX_DPR = 2;

export function LineWaveBackground({ theme = "light" }: LineWaveBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const palette = PALETTES[theme];
  const isPro = theme === "pro";

  useEffect(() => {
    const container = containerRef.current;
    const canvasHost = canvasHostRef.current;
    if (!container || !canvasHost) return;

    const canvas = document.createElement("canvas");
    canvas.className = "h-full w-full";
    canvasHost.appendChild(canvas);

    const context = canvas.getContext("2d");
    if (!context) return;

    const draw = (viewW: number, viewH: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(viewW * dpr);
      canvas.height = Math.round(viewH * dpr);
      canvas.style.width = `${viewW}px`;
      canvas.style.height = `${viewH}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, viewW, viewH);

      context.lineCap = "butt";
      context.lineWidth = palette.lineWidth;
      context.strokeStyle = `rgba(${palette.strokeRgb}, ${palette.alpha})`;

      for (let x = 0; x <= viewW + palette.lineSpacing; x += palette.lineSpacing) {
        context.beginPath();
        context.moveTo(x + 0.5, 0);
        context.lineTo(x + 0.5, viewH);
        context.stroke();
      }

      context.save();
      context.globalCompositeOperation = "destination-in";
      const fade = context.createLinearGradient(0, 0, 0, viewH);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(0.08, "rgba(0,0,0,0.72)");
      fade.addColorStop(0.5, "rgba(0,0,0,1)");
      fade.addColorStop(0.92, "rgba(0,0,0,0.72)");
      fade.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = fade;
      context.fillRect(0, 0, viewW, viewH);
      context.restore();
    };

    const resize = () => {
      draw(container.clientWidth, container.clientHeight);
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (canvas.parentNode === canvasHost) {
        canvasHost.removeChild(canvas);
      }
    };
  }, [
    palette.alpha,
    palette.bg,
    palette.lineSpacing,
    palette.lineWidth,
    palette.strokeRgb,
  ]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden transition-colors duration-700"
      style={{ backgroundColor: palette.bg }}
      aria-hidden
    >
      <div ref={canvasHostRef} className="absolute inset-0" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isPro
            ? "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, transparent 42%, transparent 58%, rgba(255,255,255,0.02) 100%)"
            : "linear-gradient(145deg, rgba(0,0,0,0.02) 0%, transparent 42%, transparent 58%, rgba(0,0,0,0.015) 100%)",
        }}
      />
    </div>
  );
}
