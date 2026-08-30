import type { InterpolationMode } from "../timeline/interpolator";

export type ObjectKind =
  | "player"
  | "ball"
  | "arrow"
  | "circle"
  | "text"
  | "rectangle"
  | "highlight";

export interface Keyframe {
  time: number; // секунды
  x: number;
  y: number;
  rotation?: number; // градусы
}

export interface BaseObjectData {
  id: string;
  kind: ObjectKind;
  visible: boolean;
  zIndex: number;
  track: Keyframe[]; // ключевые кадры этого объекта, отсортированы по time
}

export interface PlayerData extends BaseObjectData {
  kind: "player";
  number: number;
  team: "blue" | "red";
  color: string;
  radius: number;
}

export interface PassEvent {
  /** Момент времени (сек) прилёта мяча к новому владельцу (завершение передачи). */
  time: number;
  /** Новый владелец (id игрока) или null — мяч свободен с этого момента. */
  carrierId: string | null;
  /** Длительность полёта мяча при передаче (сек). По умолчанию DEFAULT_PASS_DURATION. */
  duration?: number;
}

export interface BallData extends BaseObjectData {
  kind: "ball";
  radius: number;
  color: string;
  /** События владения на таймлайне (отсортированы по time): кто владеет мячом начиная с time.
   *  Владелец в момент t = последний event с time<=t (или null до первого/при отсутствии).
   *  Старые файлы без passes, но с carrierId — трактуется как владение на всё время. */
  passes?: PassEvent[];
  /** Back-compat: одиночный владелец на всё время (старые файлы). */
  carrierId?: string | null;
  /** Смещение мяча относительно центра владельца (field units). */
  offsetX?: number;
  offsetY?: number;
}

export interface ArrowData extends BaseObjectData {
  kind: "arrow";
  points: [number, number]; // конец стрелки относительно позиции объекта (локальные координаты группы)
  stroke: string;
  strokeWidth: number;
}

export interface CircleData extends BaseObjectData {
  kind: "circle";
  radius: number;
  stroke: string;
  fill: string;
}

export interface TextData extends BaseObjectData {
  kind: "text";
  text: string;
  fontSize: number;
  fill: string;
}

export interface RectangleData extends BaseObjectData {
  kind: "rectangle";
  width: number;
  height: number;
  stroke: string;
  fill: string;
}

export interface HighlightData extends BaseObjectData {
  kind: "highlight";
  width: number;
  height: number;
  color: string;
  opacity: number;
}

export type ObjectData =
  | PlayerData
  | BallData
  | ArrowData
  | CircleData
  | TextData
  | RectangleData
  | HighlightData;

export type ProjectSettings = {
  fps: 15 | 24 | 30;
  size: 720 | 1080 | 1440;
  durationSec: number;
  /** Множитель скорости воспроизведения в редакторе (1 = реальное время).
   *  На экспорт GIF не влияет — только на проигрывание в редакторе. По умолчанию 1. */
  playbackSpeed?: number;
  /** Режим интерполяции внутри фрейма (linear/ease). catmullrom трактуется как linear. */
  interpolation?: InterpolationMode;
  /** Шаг таймлайна («фрейм»), сек. Ключи и передачи только на границах шага. По умолчанию 1. */
  stepSec?: number;
};

export type ProjectSchema = {
  schemaVersion: number;
  field: "rugby";
  settings: ProjectSettings;
  objects: ObjectData[]; // каждый объект со своим треком ключей
};
