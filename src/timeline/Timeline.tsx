import { useLayoutEffect, useRef, useState } from "react";
import { objectLabel } from "../canvas/objectMeta";
import { carrierAt } from "../canvas/resolvePosition";
import { useProjectStore } from "../store/projectStore";
import type { BallData, ObjectData, PlayerData } from "../types";
import { interpolate } from "./interpolator";
import { usePlayback } from "./usePlayback";

const LABEL_WIDTH = 150; // px, левая колонка с именем объекта
const ROW_HEIGHT = 30; // px
const RULER_HEIGHT = 28; // px
const TRANSPORT_HEIGHT = 50; // px
/** Сколько строк объектов видно без скролла; дальше — внутренний скролл, чтобы не съедать поле. */
const MAX_VISIBLE_ROWS = 5;
const TRACKS_MAX_HEIGHT = ROW_HEIGHT * MAX_VISIBLE_ROWS; // px

const tBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 7,
  border: "1px solid var(--border)",
  background: "var(--panel-2)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 14,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
const tBtnPrimary: React.CSSProperties = {
  ...tBtn,
  width: 44,
  background: "var(--accent)",
  color: "var(--accent-ink)",
  borderColor: "var(--accent)",
  fontWeight: 700,
};

export default function Timeline() {
  const objects = useProjectStore((s) => s.objects);
  const selectedIds = useProjectStore((s) => s.selectedIds);
  const currentTime = useProjectStore((s) => s.currentTime);
  const duration = useProjectStore((s) => s.settings.durationSec);
  const setCurrentTime = useProjectStore((s) => s.setCurrentTime);
  const select = useProjectStore((s) => s.select);
  const setKeyframe = useProjectStore((s) => s.setKeyframe);
  const moveKeyframe = useProjectStore((s) => s.moveKeyframe);
  const removeKeyframe = useProjectStore((s) => s.removeKeyframe);
  const moveBallPass = useProjectStore((s) => s.moveBallPass);
  const removeBallPass = useProjectStore((s) => s.removeBallPass);
  const interpolation = useProjectStore((s) => s.settings.interpolation ?? "linear");
  const step = useProjectStore((s) => s.settings.stepSec ?? 1);
  const { isPlaying, toggle } = usePlayback();

  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(800);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => setTrackWidth(el.clientWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const usableWidth = Math.max(trackWidth - LABEL_WIDTH, 1);
  const pxPerSec = usableWidth / duration;
  const secToX = (t: number) => pxPerSec * t;
  const snapT = (t: number) => Math.max(0, Math.min(duration, Math.round(t / step) * step));
  const totalSteps = Math.max(1, Math.round(duration / step));
  const currentStep = Math.round(currentTime / step);

  const tFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left - LABEL_WIDTH) / pxPerSec;
    return Math.max(0, Math.min(duration, x));
  };

  const stepFrame = (dir: 1 | -1) =>
    setCurrentTime(Math.max(0, Math.min(duration, currentTime + dir * step)));

  // --- Playhead drag (за верхний кружок) ---
  const startPlayheadDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const onMove = (ev: MouseEvent) => setCurrentTime(snapT(tFromClientX(ev.clientX)));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // --- Marker drag (меняет time ключевого кадра) ---
  const startMarkerDrag = (e: React.MouseEvent, objId: string, startTime: number) => {
    e.preventDefault();
    e.stopPropagation();
    let current = startTime;
    const onMove = (ev: MouseEvent) => {
      const rounded = Math.round(tFromClientX(ev.clientX) * 100) / 100;
      if (Math.abs(rounded - current) > 1e-6) {
        moveKeyframe(objId, current, rounded);
        current = rounded;
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // --- Pass drag (сдвиг события передачи мяча по времени) ---
  const startPassDrag = (e: React.MouseEvent, startTime: number) => {
    e.preventDefault();
    e.stopPropagation();
    let current = startTime;
    const onMove = (ev: MouseEvent) => {
      const rounded = Math.round(tFromClientX(ev.clientX) * 100) / 100;
      if (Math.abs(rounded - current) > 1e-6) {
        moveBallPass(current, rounded);
        current = rounded;
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Клики по области дорожек (линейка/дорожки/пустое) — перемотка иглы.
  const handleAreaScrub = (e: React.MouseEvent) => setCurrentTime(snapT(tFromClientX(e.clientX)));

  const handleTrackDoubleClick = (e: React.MouseEvent, obj: ObjectData) => {
    e.stopPropagation();
    if (!selectedIds.includes(obj.id)) select(obj.id);
    const pos = interpolate(obj.track, currentTime, interpolation);
    setKeyframe(obj.id, { time: currentTime, x: pos.x, y: pos.y, rotation: pos.rotation });
  };

  // Какой трек показывать для мяча: если есть владелец — трек владельца (+ подпись «→ #N»).
  const ball = objects.find((o): o is BallData => o.kind === "ball");
  const ballCarrierNow = (() => {
    if (!ball) return null;
    const cid = carrierAt(ball, currentTime);
    if (!cid) return null;
    return objects.find((o): o is PlayerData => o.kind === "player" && o.id === cid) ?? null;
  })();

  const ticks = [];
  for (let s = 0; s <= duration + 1e-6; s += step) ticks.push(s);

  return (
    <div
      style={{
        width: "100%",
        background: "var(--panel)",
        color: "var(--text)",
        userSelect: "none",
        borderTop: "1px solid var(--border)",
      }}
    >
      {/* Транспорт: пред. кадр / play / след. кадр + время + счётчик кадров */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: TRANSPORT_HEIGHT,
          padding: "0 12px",
          borderBottom: "1px solid var(--border-soft)",
        }}
      >
        <button type="button" style={tBtn} onClick={() => setCurrentTime(0)} title="В начало">
          ⏮
        </button>
        <button
          type="button"
          style={tBtn}
          onClick={() => stepFrame(-1)}
          title="Предыдущий кадр (←)"
        >
          ◁
        </button>
        <button type="button" style={tBtnPrimary} onClick={toggle} title="Play / Pause (Space)">
          {isPlaying ? "❚❚" : "►"}
        </button>
        <button type="button" style={tBtn} onClick={() => stepFrame(1)} title="Следующий кадр (→)">
          ▷
        </button>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontVariantNumeric: "tabular-nums",
            fontSize: 13,
            minWidth: 70,
          }}
        >
          {currentTime.toFixed(2)}
          <span style={{ color: "var(--text-faint)" }}>s</span>
        </span>
        <span style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.06em" }}>
          шаг {step}s
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--text-faint)",
          }}
        >
          кадр <b style={{ color: "var(--text)" }}>{currentStep}</b> / {totalSteps}
        </span>
      </div>

      {/* Линейка */}
      <div style={{ display: "flex", height: RULER_HEIGHT, position: "relative" }}>
        <div
          style={{
            width: LABEL_WIDTH,
            borderRight: "1px solid var(--border)",
            fontSize: 10,
            color: "var(--text-faint)",
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Объекты
        </div>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: клик по линейке = перемотка */}
        <div
          style={{ position: "relative", flex: 1, cursor: "pointer" }}
          onMouseDown={handleAreaScrub}
        >
          {ticks.map((s, i) => (
            <div
              key={`band-${s}`}
              style={{
                position: "absolute",
                left: secToX(s),
                top: 0,
                bottom: 0,
                width: secToX(step),
                background: i % 2 ? "rgba(255,255,255,0.035)" : "transparent",
                pointerEvents: "none",
              }}
            />
          ))}
          {ticks.map((s) => (
            <div
              key={s}
              style={{
                position: "absolute",
                left: secToX(s),
                top: 0,
                bottom: 0,
                borderLeft: "1px solid var(--border)",
                fontSize: 11,
                fontFamily: "var(--mono)",
                fontWeight: 700,
                color: "var(--text-dim)",
                paddingLeft: 5,
                display: "flex",
                alignItems: "center",
              }}
            >
              {s}s
            </div>
          ))}
        </div>
      </div>

      {/* Дорожки объектов — список скроллится, чтобы рост числа объектов не съедал поле */}
      <div style={{ position: "relative", maxHeight: TRACKS_MAX_HEIGHT }}>
        <div
          ref={trackRef}
          style={{
            position: "relative",
            maxHeight: TRACKS_MAX_HEIGHT,
            overflowY: "auto",
            scrollbarGutter: "stable",
            backgroundImage: `repeating-linear-gradient(90deg, var(--border-soft) 0, var(--border-soft) 1px, transparent 1px, transparent ${secToX(step)}px)`,
            backgroundPosition: `${LABEL_WIDTH}px 0`,
          }}
        >
          {objects.map((obj) => {
            const selected = selectedIds.includes(obj.id);
            // Мяч: подпись текущего владельца + события-передачи вместо ключей позиции.
            const isBallRow = obj.kind === "ball" && ball?.id === obj.id;
            const label = isBallRow
              ? ballCarrierNow
                ? `Мяч → #${ballCarrierNow.number}`
                : "Мяч (свободен)"
              : objectLabel(obj);
            return (
              <div
                key={obj.id}
                style={{
                  display: "flex",
                  height: ROW_HEIGHT,
                  borderBottom: "1px solid var(--border-soft)",
                  background: selected ? "rgba(47,209,122,0.08)" : "transparent",
                }}
              >
                <button
                  type="button"
                  onClick={(e) => select(obj.id, e.shiftKey)}
                  style={{
                    width: LABEL_WIDTH,
                    borderRight: "1px solid var(--border)",
                    padding: "0 10px",
                    display: "flex",
                    alignItems: "center",
                    fontSize: 12,
                    fontWeight: selected ? 600 : 400,
                    background: "transparent",
                    border: "none",
                    color: selected ? "var(--text)" : "var(--text-dim)",
                    textAlign: "left",
                    cursor: "pointer",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </button>
                {/* biome-ignore lint/a11y/noStaticElementInteractions: дорожка — клик=выделение+перемотка, дабл-клик=ключ */}
                <div
                  style={{ position: "relative", flex: 1, cursor: "pointer" }}
                  onMouseDown={(e) => {
                    select(obj.id, e.shiftKey);
                    setCurrentTime(snapT(tFromClientX(e.clientX)));
                  }}
                  onDoubleClick={(e) => handleTrackDoubleClick(e, obj)}
                >
                  {isBallRow && ball?.passes
                    ? ball.passes.map((p) => (
                        <PassMarker
                          key={`pass-${p.time}`}
                          left={secToX(p.time)}
                          free={p.carrierId == null}
                          onMouseDown={(e) => {
                            startPassDrag(e, p.time);
                            setCurrentTime(p.time);
                          }}
                          onDelete={() => removeBallPass(p.time)}
                        />
                      ))
                    : obj.track.map((kf) => (
                        <Marker
                          key={kf.time}
                          left={secToX(kf.time)}
                          selected={selected}
                          onMouseDown={(e) => {
                            startMarkerDrag(e, obj.id, kf.time);
                            setCurrentTime(kf.time);
                          }}
                          onDelete={() => removeKeyframe(obj.id, kf.time)}
                          canDelete
                        />
                      ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Плейхед (оверлей поверх скролл-области — не уезжает при вертикальном скролле) */}
        <div
          style={{
            position: "absolute",
            left: LABEL_WIDTH + secToX(currentTime),
            top: 0,
            bottom: 0,
            width: 2,
            background: "var(--accent)",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: кружок-плейхед — перетаскивание = перемотка */}
          <div
            style={{
              position: "absolute",
              top: -5,
              left: -6,
              width: 14,
              height: 14,
              background: "var(--accent)",
              borderRadius: "50%",
              boxShadow: "0 0 0 3px rgba(47,209,122,0.25)",
              pointerEvents: "auto",
              cursor: "ew-resize",
            }}
            onMouseDown={startPlayheadDrag}
            title="Перетащите — перемотка"
          />
        </div>
      </div>
    </div>
  );
}

function Marker({
  left,
  selected,
  onMouseDown,
  onDelete,
  canDelete,
}: {
  left: number;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: маркер ключевого кадра — перетаскиваемый кастомный виджет
    <div
      style={{
        position: "absolute",
        left: left - 7,
        top: "50%",
        marginTop: -7,
        width: 14,
        height: 14,
        background: selected ? "var(--accent)" : "var(--text-faint)",
        border: "1px solid var(--bg)",
        borderRadius: 3,
        cursor: "ew-resize",
      }}
      onMouseDown={onMouseDown}
      title="перетащите — сдвинуть по времени; кнопка × — удалить"
    >
      {canDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: -10,
            right: -8,
            width: 14,
            height: 14,
            fontSize: 9,
            lineHeight: "14px",
            padding: 0,
            border: "none",
            background: "var(--danger)",
            color: "#fff",
            borderRadius: "50%",
            cursor: "pointer",
          }}
          aria-label="удалить ключ"
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Маркер события передачи мяча (ромб): синий — новый владелец, серый — мяч свободен. */
function PassMarker({
  left,
  free,
  onMouseDown,
  onDelete,
}: {
  left: number;
  free: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDelete: () => void;
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: маркер передачи — перетаскиваемый виджет
    <div
      style={{
        position: "absolute",
        left: left - 7,
        top: "50%",
        marginTop: -7,
        width: 14,
        height: 14,
        transform: "rotate(45deg)",
        background: free ? "var(--text-faint)" : "#1e88e5",
        border: "1px solid var(--bg)",
        borderRadius: 2,
        cursor: "ew-resize",
      }}
      onMouseDown={onMouseDown}
      title={free ? "мяч свободен с этого момента" : "передача мяча"}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: -12,
          right: -10,
          width: 14,
          height: 14,
          fontSize: 9,
          lineHeight: "14px",
          padding: 0,
          border: "none",
          background: "var(--danger)",
          color: "#fff",
          borderRadius: "50%",
          cursor: "pointer",
          transform: "rotate(-45deg)",
        }}
        aria-label="удалить передачу"
      >
        ×
      </button>
    </div>
  );
}
