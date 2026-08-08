"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HERO_SCENES, SCENE_COUNT } from "./heroScenes";

const WHEEL_THRESHOLD = 55;
const SCENE_COOLDOWN_MS = 700;

/** Per-scene auto-progress duration (ms) while the scene is active. */
const SCENE_PROGRESS_MS: Partial<Record<string, number>> = {
  how: 6200,
  work: 4800,
};

type UseSceneNavigationOptions = {
  enabled?: boolean;
};

export function useSceneNavigation({ enabled = true }: UseSceneNavigationOptions = {}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const activeRef = useRef(0);
  const wheelAccum = useRef(0);
  const lastChange = useRef(0);
  const touchStartY = useRef(0);

  activeRef.current = activeIndex;

  const goTo = useCallback((index: number) => {
    const next = Math.max(0, Math.min(SCENE_COUNT - 1, index));
    if (next === activeRef.current) return;

    setTransitioning(true);
    setSceneProgress(0);
    setActiveIndex(next);
    lastChange.current = Date.now();
    window.setTimeout(() => setTransitioning(false), 420);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (Date.now() - lastChange.current < SCENE_COOLDOWN_MS) return;

      wheelAccum.current += e.deltaY;
      if (Math.abs(wheelAccum.current) < WHEEL_THRESHOLD) return;

      const dir = wheelAccum.current > 0 ? 1 : -1;
      wheelAccum.current = 0;
      goTo(activeRef.current + dir);
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0]?.clientY ?? 0;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (Date.now() - lastChange.current < SCENE_COOLDOWN_MS) return;
      const endY = e.changedTouches[0]?.clientY ?? 0;
      const delta = touchStartY.current - endY;
      if (Math.abs(delta) < 60) return;
      goTo(activeRef.current + (delta > 0 ? 1 : -1));
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        goTo(activeRef.current + 1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        goTo(activeRef.current - 1);
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [goTo, enabled]);

  useEffect(() => {
    if (!enabled) return;

    setSceneProgress(0);
    const start = Date.now();
    const sceneId = HERO_SCENES[activeIndex]?.id;
    const duration =
      (sceneId ? SCENE_PROGRESS_MS[sceneId] : undefined) ?? 2800;
    let frame: number;

    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setSceneProgress(t);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, enabled]);

  return { activeIndex, sceneProgress, transitioning, goTo };
}
