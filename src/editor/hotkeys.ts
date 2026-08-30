import { useEffect } from "react";
import { downloadProjectJson } from "../serialization/jsonSaver";
import { useProjectStore } from "../store/projectStore";

/** Активный элемент — поле ввода текста (инпут/текстареа/contenteditable)? */
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

/**
 * Единый обработчик горячих клавиш редактора. Подключается один раз в App.
 * Читает свежее состояние через getState() — без подписок и без устаревших замыканий.
 *
 * Маппинг:
 *  - Space — play/pause
 *  - ←/→ — шаг плейхеда на один «кадр» таймлайна (settings.stepSec)
 *  - Delete/Backspace — удалить выделенное
 *  - Ctrl/Cmd+D — дублировать
 *  - Ctrl/Cmd+S — сохранить JSON (работает и при фокусе в инпуте)
 *  - Ctrl/Cmd+Z — undo; Ctrl/Cmd+Shift+Z или Ctrl+Y — redo
 *
 * Guard: при фокусе в поле ввода все хоткеи (кроме Ctrl+S) отключены.
 */
export function useHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const s = useProjectStore.getState();

      // Ctrl/Cmd+S работает всегда (даже в инпуте) — сохранение проекта.
      if (mod && key === "s") {
        e.preventDefault();
        downloadProjectJson(s.settings, s.objects);
        return;
      }

      // Остальные хоткеи не срабатывают при вводе текста (печать пробела и т.п.).
      if (isTyping()) return;

      if (mod && key === "z") {
        e.preventDefault();
        const t = useProjectStore.temporal.getState();
        if (e.shiftKey) t.redo();
        else t.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        useProjectStore.temporal.getState().redo();
        return;
      }
      if (mod && key === "d") {
        e.preventDefault();
        s.duplicateSelected();
        return;
      }

      // Без модификаторов.
      if (e.code === "Space") {
        // Если сфокусирована кнопка — не перехватываем (пусть сработает сама), иначе двойное действие.
        const ae = document.activeElement as HTMLElement | null;
        if (ae && ae.tagName === "BUTTON") return;
        e.preventDefault();
        s.setPlaying(!s.isPlaying);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const step = s.settings.stepSec ?? 1;
        s.setCurrentTime(Math.max(0, s.currentTime - step));
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const step = s.settings.stepSec ?? 1;
        s.setCurrentTime(Math.min(s.settings.durationSec, s.currentTime + step));
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        s.removeSelected();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
