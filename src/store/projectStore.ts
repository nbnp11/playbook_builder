import { temporal } from "zundo";
import { create, useStore } from "zustand";
import { upsertPass } from "../canvas/resolvePosition";
import type {
  ArrowData,
  BallData,
  CircleData,
  HighlightData,
  Keyframe,
  ObjectData,
  PlayerData,
  ProjectSettings,
  RectangleData,
  TextData,
} from "../types";

export const SCHEMA_VERSION = 1;

/** Патч для объекта: объединение частичных видов по всем типам (без kind — дискриминант не меняем). */
export type ObjectPatch = {
  [K in ObjectData["kind"]]: Partial<Omit<Extract<ObjectData, { kind: K }>, "kind">>;
}[ObjectData["kind"]];

const DEFAULT_SETTINGS: ProjectSettings = {
  fps: 24,
  size: 1080,
  durationSec: 10,
  playbackSpeed: 1,
  interpolation: "linear",
  stepSec: 1,
};

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function withSortedTrack<T extends ObjectData>(obj: T): T {
  return { ...obj, track: [...obj.track].sort((a, b) => a.time - b.time) };
}

/** Округлить время до границы фрейма (шага таймлайна). */
function quantizeTime(t: number, step: number): number {
  if (step <= 0) return t;
  return Math.round(t / step) * step;
}

/** Фабрики для новых объектов (используются в тулбаре и дефолтном проекте). */
export function createPlayer(
  n: number,
  x: number,
  y: number,
  team: PlayerData["team"] = "blue",
): PlayerData {
  return {
    id: uid("p"),
    kind: "player",
    visible: true,
    zIndex: 1,
    number: n,
    team,
    color: team === "blue" ? "#1e88e5" : "#e53935",
    radius: 12,
    track: [{ time: 0, x, y, rotation: 0 }],
  };
}

export function createBall(x: number, y: number): BallData {
  return {
    id: uid("b"),
    kind: "ball",
    visible: true,
    zIndex: 2,
    radius: 6,
    color: "#f0e7d2",
    passes: [],
    offsetX: 11,
    offsetY: 11,
    track: [{ time: 0, x, y, rotation: 0 }],
  };
}

export function createArrow(x: number, y: number): ArrowData {
  return {
    id: uid("a"),
    kind: "arrow",
    visible: true,
    zIndex: 3,
    points: [80, 0],
    stroke: "#ffffff",
    strokeWidth: 5,
    track: [{ time: 0, x, y, rotation: 0 }],
  };
}

export function createCircle(x: number, y: number): CircleData {
  return {
    id: uid("c"),
    kind: "circle",
    visible: true,
    zIndex: 1,
    radius: 40,
    stroke: "#ffffff",
    fill: "#fdd835",
    track: [{ time: 0, x, y, rotation: 0 }],
  };
}

export function createText(x: number, y: number): TextData {
  return {
    id: uid("t"),
    kind: "text",
    visible: true,
    zIndex: 4,
    text: "Текст",
    fontSize: 28,
    fill: "#ffffff",
    track: [{ time: 0, x, y, rotation: 0 }],
  };
}

export function createRectangle(x: number, y: number): RectangleData {
  return {
    id: uid("r"),
    kind: "rectangle",
    visible: true,
    zIndex: 1,
    width: 120,
    height: 80,
    stroke: "#ffffff",
    fill: "#1a1a1a",
    track: [{ time: 0, x, y, rotation: 0 }],
  };
}

export function createHighlight(x: number, y: number): HighlightData {
  return {
    id: uid("h"),
    kind: "highlight",
    visible: true,
    zIndex: 0,
    width: 160,
    height: 120,
    color: "#fdd835",
    opacity: 0.25,
    track: [{ time: 0, x, y, rotation: 0 }],
  };
}

interface ProjectState {
  settings: ProjectSettings;
  objects: ObjectData[];
  selectedIds: string[];
  currentTime: number;
  isPlaying: boolean;
  snapEnabled: boolean;
  /** Transient: id игрока-приёмника во время драга мяча (подсветка). В историю не попадает. */
  receiverId: string | null;
  addObject: (obj: ObjectData) => void;
  removeObject: (id: string) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  /** Удалить все объекты со сцены (отменяемо через undo). */
  clearAll: () => void;
  reorderObject: (id: string, direction: "up" | "down") => void;
  updateObject: (id: string, patch: ObjectPatch) => void;
  setKeyframe: (id: string, kf: Keyframe) => void;
  moveKeyframe: (id: string, oldTime: number, newTime: number) => void;
  removeKeyframe: (id: string, time: number) => void;
  select: (id: string | null, additive?: boolean) => void;
  clearSelection: () => void;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;
  toggleSnap: () => void;
  /** Назначить владельца мяча в текущем кадре (id игрока) или null (свободен). */
  setBallCarrier: (carrierId: string | null) => void;
  /** Сдвинуть событие передачи мяча по времени. */
  moveBallPass: (oldTime: number, newTime: number) => void;
  /** Удалить событие передачи мяча. */
  removeBallPass: (time: number) => void;
  setReceiver: (id: string | null) => void;
  loadProject: (p: { settings: ProjectSettings; objects: ObjectData[] }) => void;
}

function patchObject<T extends ObjectData>(obj: T, patch: ObjectPatch): T {
  // kind не входит в ObjectPatch, поэтому просто объединяем; T сохраняет дискриминант.
  return { ...obj, ...(patch as Partial<T>) } as T;
}

/** Префикс id по типу объекта (для клонов). */
function prefixForKind(kind: ObjectData["kind"]): string {
  return {
    player: "p",
    ball: "b",
    arrow: "a",
    circle: "c",
    text: "t",
    rectangle: "r",
    highlight: "h",
  }[kind];
}

/** Глубокий клон объекта с новым id, новым z-order и смещением всех ключей трека. */
function cloneObject(src: ObjectData, zIndex: number, offset = 20): ObjectData {
  const clone = structuredClone(src) as ObjectData;
  clone.id = uid(prefixForKind(src.kind));
  clone.zIndex = zIndex;
  clone.track = src.track.map((k) => ({ ...k, x: k.x + offset, y: k.y + offset }));
  return clone;
}

export const useProjectStore = create<ProjectState>()(
  temporal(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      objects: createDefaultProject(),
      selectedIds: [],
      currentTime: 0,
      isPlaying: false,
      snapEnabled: true,
      receiverId: null,

      addObject: (obj) => set((s) => ({ objects: [...s.objects, withSortedTrack(obj)] })),

      removeObject: (id) =>
        set((s) => {
          const objects = s.objects.filter((o) => o.id !== id);
          // если удалили владельца — события передач этого игрока обнуляются (мяч свободен)
          const patched = objects.map((o) => {
            if (o.kind !== "ball") return o;
            const passes = (o.passes ?? []).map((p) =>
              p.carrierId === id ? { ...p, carrierId: null } : p,
            );
            return { ...o, passes, carrierId: o.carrierId === id ? null : o.carrierId };
          });
          return {
            objects: patched,
            selectedIds: s.selectedIds.filter((x) => x !== id),
          };
        }),

      removeSelected: () =>
        set((s) => {
          if (s.selectedIds.length === 0) return {};
          const ids = new Set(s.selectedIds);
          const filtered = s.objects.filter((o) => !ids.has(o.id));
          // если удалили владельца — события передач этого игрока обнуляются (мяч свободен)
          const patched = filtered.map((o) => {
            if (o.kind !== "ball") return o;
            const passes = (o.passes ?? []).map((p) =>
              p.carrierId && ids.has(p.carrierId) ? { ...p, carrierId: null } : p,
            );
            return {
              ...o,
              passes,
              carrierId: o.carrierId && ids.has(o.carrierId) ? null : o.carrierId,
            };
          });
          return { objects: patched, selectedIds: [] };
        }),

      duplicateSelected: () =>
        set((s) => {
          if (s.selectedIds.length === 0) return {};
          const maxZ = s.objects.reduce((m, o) => Math.max(m, o.zIndex), 0);
          const clones = s.selectedIds
            .map((id) => s.objects.find((o) => o.id === id))
            .filter((o): o is ObjectData => Boolean(o))
            .map((src, i) => cloneObject(src, maxZ + 1 + i));
          return { objects: [...s.objects, ...clones], selectedIds: clones.map((c) => c.id) };
        }),

      clearAll: () =>
        set({
          objects: [],
          selectedIds: [],
          receiverId: null,
          isPlaying: false,
          currentTime: 0,
        }),

      reorderObject: (id, direction) =>
        set((s) => {
          const sorted = [...s.objects].sort((a, b) => a.zIndex - b.zIndex);
          const idx = sorted.findIndex((o) => o.id === id);
          if (idx === -1) return {};
          // up = вперёд (выше z, рисуется поверх) → к концу массива
          const swapWith = direction === "up" ? idx + 1 : idx - 1;
          if (swapWith < 0 || swapWith >= sorted.length) return {};
          const a = sorted[idx];
          const b = sorted[swapWith];
          const aZ = a.zIndex;
          const bZ = b.zIndex;
          return {
            objects: s.objects.map((o) => {
              if (o.id === a.id) return { ...o, zIndex: bZ };
              if (o.id === b.id) return { ...o, zIndex: aZ };
              return o;
            }),
          };
        }),

      updateObject: (id, patch) =>
        set((s) => ({ objects: s.objects.map((o) => (o.id === id ? patchObject(o, patch) : o)) })),

      setKeyframe: (id, kf) =>
        set((s) => {
          const step = s.settings.stepSec ?? 1;
          const t = quantizeTime(kf.time, step);
          return {
            objects: s.objects.map((o) => {
              if (o.id !== id) return o;
              const rest = o.track.filter((k) => Math.abs(k.time - t) > 1e-6);
              return {
                ...o,
                track: [...rest, { ...kf, time: t }].sort((a, b) => a.time - b.time),
              };
            }),
          };
        }),

      moveKeyframe: (id, oldTime, newTime) =>
        set((s) => {
          const step = s.settings.stepSec ?? 1;
          const nt = quantizeTime(newTime, step);
          return {
            objects: s.objects.map((o) => {
              if (o.id !== id) return o;
              const moved = o.track.map((k) =>
                Math.abs(k.time - oldTime) <= 1e-6 ? { ...k, time: nt } : k,
              );
              return { ...o, track: moved.sort((a, b) => a.time - b.time) };
            }),
          };
        }),

      removeKeyframe: (id, time) =>
        set((s) => ({
          objects: s.objects.map((o) =>
            o.id === id
              ? { ...o, track: o.track.filter((k) => Math.abs(k.time - time) > 1e-6) }
              : o,
          ),
        })),

      select: (id, additive) =>
        set((s) => {
          if (id === null) return { selectedIds: [] };
          if (!additive) return { selectedIds: [id] };
          const has = s.selectedIds.includes(id);
          return {
            selectedIds: has ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id],
          };
        }),
      clearSelection: () => set({ selectedIds: [] }),
      setCurrentTime: (t) => set({ currentTime: t }),
      setPlaying: (p) => set({ isPlaying: p }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
      setBallCarrier: (carrierId) =>
        set((s) => {
          const step = s.settings.stepSec ?? 1;
          const t = quantizeTime(s.currentTime, step);
          return {
            objects: s.objects.map((o) =>
              o.kind === "ball" ? { ...o, passes: upsertPass(o.passes, t, carrierId, step) } : o,
            ),
          };
        }),
      moveBallPass: (oldTime, newTime) =>
        set((s) => {
          const step = s.settings.stepSec ?? 1;
          const nt = quantizeTime(newTime, step);
          return {
            objects: s.objects.map((o) => {
              if (o.kind !== "ball" || !o.passes) return o;
              const moved = o.passes
                .map((p) => (Math.abs(p.time - oldTime) <= 1e-6 ? { ...p, time: nt } : p))
                .sort((a, b) => a.time - b.time);
              return { ...o, passes: moved };
            }),
          };
        }),
      removeBallPass: (time) =>
        set((s) => ({
          objects: s.objects.map((o) =>
            o.kind === "ball" && o.passes
              ? { ...o, passes: o.passes.filter((p) => Math.abs(p.time - time) > 1e-6) }
              : o,
          ),
        })),
      setReceiver: (id) => set({ receiverId: id }),
      loadProject: (p) =>
        set({
          settings: { interpolation: "linear", playbackSpeed: 1, ...p.settings },
          objects: p.objects.map(withSortedTrack),
          selectedIds: [],
          currentTime: 0,
          isPlaying: false,
          receiverId: null,
        }),
    }),
    {
      // В историю попадают только объекты и настройки сцены — но НЕ currentTime/isPlaying/selectedId.
      partialize: (s) => ({ objects: s.objects, settings: s.settings }),
      // Если objects/settings не изменились (например, тикает только currentTime при playback) — не сохраняем.
      equality: (a, b) => a.objects === b.objects && a.settings === b.settings,
      limit: 100,
    },
  ),
);

/** Реактивный доступ к истории: undo/redo/clear + canUndo/canRedo. */
export function useHistory() {
  const past = useStore(useProjectStore.temporal, (s) => s.pastStates);
  const future = useStore(useProjectStore.temporal, (s) => s.futureStates);
  const undo = useStore(useProjectStore.temporal, (s) => s.undo);
  const redo = useStore(useProjectStore.temporal, (s) => s.redo);
  const clear = useStore(useProjectStore.temporal, (s) => s.clear);
  return { undo, redo, clear, canUndo: past.length > 0, canRedo: future.length > 0 };
}

export function createDefaultProject(): ObjectData[] {
  const p1 = createPlayer(10, 120, 200, "blue");
  const p2 = createPlayer(9, 200, 300, "blue");
  const ball = createBall(100, 100);
  ball.passes = [{ time: 0, carrierId: p1.id }]; // мяч сразу у первого игрока
  return [p1, p2, ball];
}
