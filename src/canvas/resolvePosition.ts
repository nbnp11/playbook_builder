import type { InterpolationMode } from "../timeline/interpolator";
import type { BallData, ObjectData, PassEvent, PlayerData } from "../types";

export interface Vec2 {
  x: number;
  y: number;
  rotation: number;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (k: number) => k * k * (3 - 2 * k);

/** Игрок по id (или undefined). */
export function getPlayer(
  objects: ObjectData[],
  id: string | null | undefined,
): PlayerData | undefined {
  const found = objects.find((o) => o.id === id);
  return found && found.kind === "player" ? found : undefined;
}

/** Дефолтное смещение мяча относительно центра владельца (field units). */
export const DEFAULT_BALL_OFFSET = { x: 11, y: 11 };

/** Дефолтная длительность полёта при передаче (сек), если на событии не задана. */
export const DEFAULT_PASS_DURATION = 1;

/**
 * Фреймовая интерполяция с удержанием позы (pose-to-pose).
 * Время квантуется шагом step: на границах фреймов поза «удерживается»
 * (последний ключ <= границы фрейма), а СМЕЖНЫЕ фреймы плавно интерполируются.
 * Итог: объект движется только внутри того фрейма, где его поза меняется,
 * и стоит на месте в остальных — действия не накладываются («10 и 9 одновременно»).
 *
 * Ключи ожидаемо лежат на границах фреймов (квантируются при редактировании).
 */
function posAtFrame(
  track: { time: number; x: number; y: number; rotation?: number }[],
  t: number,
  step: number,
  mode: InterpolationMode,
): Vec2 {
  if (track.length === 0) return { x: 0, y: 0, rotation: 0 };
  const s = [...track].sort((a, b) => a.time - b.time);
  const first = s[0];
  const last = s[s.length - 1];
  const rot = (k: { rotation?: number }) => k.rotation ?? 0;
  if (t <= first.time) return { x: first.x, y: first.y, rotation: rot(first) };
  if (t >= last.time) return { x: last.x, y: last.y, rotation: rot(last) };
  // Поза на границе фрейма = последний ключ <= этой границы (удержание).
  const poseAt = (ft: number) => {
    let p = first;
    for (const k of s) {
      if (k.time <= ft + 1e-6) p = k;
      else break;
    }
    return p;
  };
  const f0 = Math.floor(t / step + 1e-9) * step;
  const f1 = f0 + step;
  const p0 = poseAt(f0);
  const p1 = poseAt(f1);
  let k = (t - f0) / step;
  if (mode === "ease") k = ease(k);
  return { x: lerp(p0.x, p1.x, k), y: lerp(p0.y, p1.y, k), rotation: lerp(rot(p0), rot(p1), k) };
}

/**
 * Логический владелец мяча в момент t (для кольца/подписи/селектора):
 * последний event с time<=t. До первого / при отсутствии — null (свободен).
 * Back-compat: старые файлы без passes, но с carrierId → владение на всё время.
 *
 * ВНИМАНИЕ: это индикатор, а не позиция — позиция мяча считается с учётом полёта
 * (см. resolvePosition / resolveBallPosition).
 */
export function carrierAt(ball: BallData, t: number): string | null {
  if (ball.passes && ball.passes.length > 0) {
    let carrier: string | null = null;
    for (const p of [...ball.passes].sort((a, b) => a.time - b.time)) {
      if (p.time <= t + 1e-6) carrier = p.carrierId;
      else break;
    }
    return carrier;
  }
  return ball.carrierId ?? null;
}

/** Вставить/заменить событие владения в момент time (дедуп по времени), отсортировать. */
export function upsertPass(
  passes: PassEvent[] | undefined,
  time: number,
  carrierId: string | null,
  duration?: number,
): PassEvent[] {
  const rest = (passes ?? []).filter((p) => Math.abs(p.time - time) > 1e-6);
  const ev: PassEvent = duration != null ? { time, carrierId, duration } : { time, carrierId };
  return [...rest, ev].sort((a, b) => a.time - b.time);
}

/**
 * Позиция мяча в момент t с учётом плавного полёта при передачах.
 * Событие передачи (pass.time) = момент прилёта к новому владельцу.
 * Фазы по проходу вперёд по passes:
 *  - до отрыва (t < arrival-duration): мяч у прошлого владельца (или свободен);
 *  - полёт [arrival-duration, arrival): интерполяция от позиции передающего
 *    (в момент отрыва) к позиции принимающего (в момент прилёта) — со смещением «в руках»;
 *  - с момента прилёта: мяч у нового владельца.
 * Полёт только если есть от кого передавать. Позиции владельцев — фреймовые (posAtFrame).
 */
function resolveBallPosition(
  objects: ObjectData[],
  ball: BallData,
  t: number,
  mode: InterpolationMode,
  step: number,
): Vec2 {
  const ox = ball.offsetX ?? DEFAULT_BALL_OFFSET.x;
  const oy = ball.offsetY ?? DEFAULT_BALL_OFFSET.y;

  const carryPos = (cid: string | null, time: number): Vec2 => {
    const c = getPlayer(objects, cid);
    if (c) {
      const p = posAtFrame(c.track, time, step, mode);
      return { x: p.x + ox, y: p.y + oy, rotation: p.rotation };
    }
    return posAtFrame(ball.track, time, step, mode);
  };
  const freePos = (time: number): Vec2 => posAtFrame(ball.track, time, step, mode);

  const passes =
    ball.passes && ball.passes.length > 0 ? [...ball.passes].sort((a, b) => a.time - b.time) : null;

  if (!passes) return ball.carrierId ? carryPos(ball.carrierId, t) : freePos(t);

  let carrier: string | null = null;
  for (const p of passes) {
    const arrival = p.time;
    const dur = p.duration ?? step; // передача = один фрейм
    const flightStart = arrival - dur;
    const passer = carrier;
    if (passer != null) {
      if (t < flightStart - 1e-6) return carryPos(passer, t);
      if (t < arrival - 1e-6) {
        const from = carryPos(passer, flightStart);
        const to = carryPos(p.carrierId, arrival);
        const k = (t - flightStart) / dur;
        return {
          x: lerp(from.x, to.x, k),
          y: lerp(from.y, to.y, k),
          rotation: lerp(from.rotation ?? 0, to.rotation ?? 0, k),
        };
      }
    } else {
      if (t < arrival - 1e-6) return freePos(t);
    }
    carrier = p.carrierId;
  }
  return carrier ? carryPos(carrier, t) : freePos(t);
}

/**
 * Позиция объекта в момент t. Для мяча — с учётом плавных передач.
 * step — шаг таймлайна (фрейм): для не-мяча используется фреймовая интерполяция
 * с удержанием позы. Единый источник позиции для редактора и экспорта.
 */
export function resolvePosition(
  objects: ObjectData[],
  obj: ObjectData,
  t: number,
  mode: InterpolationMode,
  step: number,
): Vec2 {
  if (obj.kind === "ball") return resolveBallPosition(objects, obj, t, mode, step);
  return posAtFrame(obj.track, t, step, mode);
}

/**
 * Ближайший к (x,y) игрок в пределах reach (field units) или undefined.
 * Позиции игроков — фреймовые.
 */
export function nearestPlayer(
  objects: ObjectData[],
  t: number,
  mode: InterpolationMode,
  step: number,
  x: number,
  y: number,
  reach: number,
): PlayerData | undefined {
  let best: PlayerData | undefined;
  let bd = reach;
  for (const o of objects) {
    if (o.kind !== "player") continue;
    const p = posAtFrame(o.track, t, step, mode);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

/** Радиус захвата приёмника при передаче (field units, ~2.9 радиуса игрока). */
export const PASS_REACH = 35;
