import type { KonvaEventObject } from "konva/lib/Node";
import { useEffect, useRef, useState } from "react";
import { Layer, Stage } from "react-konva";
import { FIELD } from "../config/field";
import { useProjectStore } from "../store/projectStore";
import Field from "./Field";
import SceneObject from "./SceneObject";

/** Минимальный масштаб авто-вписывания: ниже поле нечитаемо. */
const MIN_SCALE = 0.4;

/**
 * Канвас: Konva-стейдж фиксированного размера FIELD, вписанный в контейнер через CSS scale.
 * События мыши Konva мапит сам (через content rect), так что drag/клики работают при любом
 * масштабе. Экспорт GIF отдельным offscreen-стейджем — на него scale не влияет.
 */
export default function Canvas() {
  const objects = useProjectStore((s) => s.objects);
  const select = useProjectStore((s) => s.select);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Авто-вписывание: scale = min(1, доступно/поле) — уменьшаем, но не увеличиваем сверх 1:1.
  useEffect(() => {
    const stageHost = wrapRef.current?.parentElement;
    if (!stageHost) return;
    const update = () => {
      const cs = getComputedStyle(stageHost);
      const availW =
        stageHost.clientWidth -
        Number.parseFloat(cs.paddingLeft) -
        Number.parseFloat(cs.paddingRight);
      const availH =
        stageHost.clientHeight -
        Number.parseFloat(cs.paddingTop) -
        Number.parseFloat(cs.paddingBottom);
      const s = Math.min(1, availW / FIELD.width, availH / FIELD.height);
      setScale(Math.max(MIN_SCALE, Math.round(s * 1000) / 1000));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stageHost);
    return () => ro.disconnect();
  }, []);

  // Клик по пустому месту (таргет — сам Stage, т.к. фигуры поля non-listening) снимает выделение.
  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (e.target === e.target.getStage()) select(null);
  };

  return (
    <div ref={wrapRef} style={{ width: FIELD.width * scale, height: FIELD.height * scale }}>
      <div
        style={{
          width: FIELD.width,
          height: FIELD.height,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        <Stage width={FIELD.width} height={FIELD.height} onMouseDown={handleStageMouseDown}>
          <Layer>
            <Field />
            {[...objects]
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((o) => (
                <SceneObject key={o.id} obj={o} />
              ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
