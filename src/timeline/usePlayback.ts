import { useEffect, useRef } from "react";
import { useProjectStore } from "../store/projectStore";

/**
 * Проигрывание через requestAnimationFrame. Читает актуальный currentTime через getState(),
 * чтобы не перезапускать цикл каждый кадр (currentTime не в зависимостях эффекта).
 * Скорость — множитель к реальному времени (settings.playbackSpeed), 1 = реальное время.
 * Loop: по достижении duration — возврат на 0.
 */
export function usePlayback() {
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const setPlaying = useProjectStore((s) => s.setPlaying);
  const setCurrentTime = useProjectStore((s) => s.setCurrentTime);
  const duration = useProjectStore((s) => s.settings.durationSec);
  const speed = useProjectStore((s) => s.settings.playbackSpeed ?? 1);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      last.current = null;
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      return;
    }
    const tick = (ts: number) => {
      if (last.current == null) last.current = ts;
      const dt = ((ts - last.current) / 1000) * speed;
      last.current = ts;
      let next = useProjectStore.getState().currentTime + dt;
      if (next >= duration) next = 0; // loop
      setCurrentTime(next);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [isPlaying, duration, speed, setCurrentTime]);

  return { isPlaying, toggle: () => setPlaying(!useProjectStore.getState().isPlaying) };
}
