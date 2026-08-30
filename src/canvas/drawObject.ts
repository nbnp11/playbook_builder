import Konva from "konva";
import type { ObjectData } from "../types";

const SEL_STROKE = "#2fd17a"; // акцент выделения (изумруд)

/** Подходящий цвет текста (номер игрока) по яркости фона. */
function readableText(bg: string): string {
  const h = bg.replace("#", "");
  if (h.length < 6) return "#ffffff";
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 150 ? "#1a1a1a" : "#ffffff";
}

/** Доп. флаги отрисовки игрока: кольцо владельца мяча и/или приёмника при передаче. */
export interface DrawFlags {
  carrier?: boolean;
  receiver?: boolean;
}

/**
 * Императивная отрисовка фигур одного объекта в Konva.Group.
 * Единый источник рендера: используется и в редакторе (SceneObject), и в offscreen-экспорте GIF.
 * Координаты фигур — ЛОКАЛЬНЫЕ относительно группы (позиция объекта задаётся на самом Group).
 * Существующие children группы предварительно удаляются.
 *
 * @param selected подсветка выделения (в экспорте всегда false).
 * @param flags    доп. флаги для игроков (владелец/приёмник); в экспорте не передаются.
 */
export function drawObjectInto(
  group: Konva.Group,
  obj: ObjectData,
  selected: boolean,
  flags?: DrawFlags,
): void {
  group.destroyChildren();

  switch (obj.kind) {
    case "player": {
      const { radius } = obj;
      group.add(
        new Konva.Circle({
          radius,
          fill: obj.color,
          stroke: selected ? SEL_STROKE : "#ffffff",
          strokeWidth: selected ? 4 : 2,
        }),
        new Konva.Text({
          text: String(obj.number),
          fontSize: radius,
          fontStyle: "bold",
          fill: readableText(obj.color),
          align: "center",
          verticalAlign: "middle",
          width: radius * 2,
          height: radius * 2,
          x: -radius,
          y: -radius,
          listening: false,
        }),
      );
      // Кольцо владельца мяча (зелёное пунктирное) и приёмника (синее) — индикаторы «липкости».
      if (flags?.carrier) {
        group.add(
          new Konva.Circle({
            radius: radius + 5,
            stroke: "#2fd17a",
            strokeWidth: 2,
            dash: [5, 4],
            listening: false,
          }),
        );
      }
      if (flags?.receiver) {
        group.add(
          new Konva.Circle({
            radius: radius + 5,
            stroke: "#1e88e5",
            strokeWidth: 2.5,
            listening: false,
          }),
        );
      }
      break;
    }
    case "ball": {
      // Регбийный мяч: овал (rx>ry) с тёмным кантом, бликом и швом-перемычкой.
      // Первым — невидимый хит-круг ×2 радиуса: сам овал мелкий, сложно попасть мышью
      // (transparent fill в Konva ловит события, но ничего не рисует и в GIF не попадает).
      const ry = obj.radius;
      const rx = obj.radius * 1.6;
      group.add(
        new Konva.Circle({
          radius: obj.radius * 2,
          fill: "transparent",
        }),
        new Konva.Ellipse({
          radiusX: rx,
          radiusY: ry,
          fill: obj.color,
          stroke: selected ? SEL_STROKE : "#463f31",
          strokeWidth: selected ? 3 : 1.5,
        }),
        new Konva.Ellipse({
          x: -rx * 0.22,
          y: -ry * 0.28,
          radiusX: rx * 0.45,
          radiusY: ry * 0.5,
          fill: "rgba(255,255,255,0.55)",
          listening: false,
        }),
        new Konva.Line({
          points: [-rx * 0.68, 0, rx * 0.68, 0],
          stroke: "#5b5446",
          strokeWidth: 1.3,
          listening: false,
        }),
      );
      break;
    }
    case "arrow": {
      group.add(
        new Konva.Arrow({
          points: [0, 0, obj.points[0], obj.points[1]],
          stroke: obj.stroke,
          fill: obj.stroke,
          strokeWidth: obj.strokeWidth,
          pointerLength: 14,
          pointerWidth: 14,
          hitStrokeWidth: Math.max(obj.strokeWidth, 12),
        }),
      );
      break;
    }
    case "circle": {
      group.add(
        new Konva.Circle({
          radius: obj.radius,
          stroke: obj.stroke,
          fill: obj.fill,
          strokeWidth: 2,
        }),
      );
      break;
    }
    case "text": {
      // грубая оценка ширины для центрирования.
      // listening не выключаем: текст — единственный шейп группы, без него объект
      // не ловил бы события мыши (нельзя выделить/перетащить).
      const approxWidth = Math.max(obj.fontSize * obj.text.length * 0.6, obj.fontSize);
      group.add(
        new Konva.Text({
          text: obj.text,
          fontSize: obj.fontSize,
          fontStyle: "bold",
          fill: obj.fill,
          align: "center",
          verticalAlign: "middle",
          width: approxWidth,
          height: obj.fontSize * 1.3,
          x: -approxWidth / 2,
          y: (-obj.fontSize * 1.3) / 2,
        }),
      );
      break;
    }
    case "rectangle": {
      group.add(
        new Konva.Rect({
          width: obj.width,
          height: obj.height,
          x: -obj.width / 2,
          y: -obj.height / 2,
          stroke: obj.stroke,
          fill: obj.fill,
          strokeWidth: 2,
        }),
      );
      break;
    }
    case "highlight": {
      group.add(
        new Konva.Rect({
          width: obj.width,
          height: obj.height,
          x: -obj.width / 2,
          y: -obj.height / 2,
          fill: obj.color,
          opacity: obj.opacity,
          strokeWidth: 0,
        }),
      );
      break;
    }
  }
}
