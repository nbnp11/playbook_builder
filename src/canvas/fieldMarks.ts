import { FIELD } from "../config/field";

export interface FieldRect {
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill?: string;
}

export interface FieldLine {
  points: number[];
  stroke: string;
  strokeWidth: number;
}

export interface FieldMarks {
  background: FieldRect;
  rects: FieldRect[];
  lines: FieldLine[];
}

/**
 * Декларативное описание регбийной разметки (упрощённой) в условных единицах поля FIELD.
 * Используется и в react-konva Field.tsx, и в offscreen-рендере экспорта GIF — единый источник разметки.
 *
 * Масштаб: между try-линиями (10%..90% ширины) — 100 м игрового поля. Отсюда единицы
 * на метр (u) и производные размеры: просвет ворот 5.6 м, глубина ворот 2.5 м,
 * линии 5 м и 15 м от аутов.
 */
export function getFieldMarks(): FieldMarks {
  const { width, height, background, lineColor } = FIELD;

  const u = (width * 0.8) / 100; // условных единиц на метр
  const tryLeft = width * 0.1;
  const tryRight = width * 0.9;
  const cy = height / 2;

  // Ворота: схематичное «H» плашмя на try-линии, по центру каждой.
  // Стойки — перпендикулярно try-линии (наружу от поля), перекладина — между их серединами.
  const g2 = Math.round((5.6 * u) / 2); // полупросвет ворот
  const d = Math.round(2.5 * u); // глубина (вынос стоек за try-линию)
  const goalLines: FieldLine[] = [
    // левые ворота (стойки уходят влево, к ближнему краю поля)
    { points: [tryLeft, cy - g2, tryLeft - d, cy - g2], stroke: lineColor, strokeWidth: 3 },
    { points: [tryLeft, cy + g2, tryLeft - d, cy + g2], stroke: lineColor, strokeWidth: 3 },
    {
      points: [tryLeft - d / 2, cy - g2, tryLeft - d / 2, cy + g2],
      stroke: lineColor,
      strokeWidth: 3,
    },
    // правые ворота (стойки уходят вправо)
    { points: [tryRight, cy - g2, tryRight + d, cy - g2], stroke: lineColor, strokeWidth: 3 },
    { points: [tryRight, cy + g2, tryRight + d, cy + g2], stroke: lineColor, strokeWidth: 3 },
    {
      points: [tryRight + d / 2, cy - g2, tryRight + d / 2, cy + g2],
      stroke: lineColor,
      strokeWidth: 3,
    },
  ];

  // 5 м и 15 м от аутов (верх/низ): горизонтальные линии на всю длину поля, самые тонкие.
  const y5 = Math.round(5 * u);
  const y15 = Math.round(15 * u);
  const touchLines: FieldLine[] = [
    { points: [0, y5, width, y5], stroke: lineColor, strokeWidth: 0.75 },
    { points: [0, height - y5, width, height - y5], stroke: lineColor, strokeWidth: 0.75 },
    { points: [0, y15, width, y15], stroke: lineColor, strokeWidth: 0.75 },
    { points: [0, height - y15, width, height - y15], stroke: lineColor, strokeWidth: 0.75 },
  ];

  return {
    background: { x: 0, y: 0, width, height, fill: background, stroke: lineColor, strokeWidth: 3 },
    rects: [],
    lines: [
      // центральная (halfway) линия
      { points: [width / 2, 0, width / 2, height], stroke: lineColor, strokeWidth: 2 },
      // try-линии (упрощённо)
      { points: [tryLeft, 0, tryLeft, height], stroke: lineColor, strokeWidth: 2 },
      { points: [tryRight, 0, tryRight, height], stroke: lineColor, strokeWidth: 2 },
      // 22-метровые (упрощённо)
      { points: [width * 0.25, 0, width * 0.25, height], stroke: lineColor, strokeWidth: 1 },
      { points: [width * 0.75, 0, width * 0.75, height], stroke: lineColor, strokeWidth: 1 },
      ...touchLines,
      ...goalLines,
    ],
  };
}
