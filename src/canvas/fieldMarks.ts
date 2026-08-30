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
 * Разметка поля регби в реальных пропорциях (масштаб FIELD.unitsPerMeter = 10 у.е./м):
 *   длина 120 м = 100 м игровое поле + 2×10 м зачетные зоны; ширина 70 м.
 * Линии:
 *   - периметр (ауты + лицевые) — контур поля;
 *   - try-линии в 10 м от лицевых; 22-метровые в 22 м от try-линий; центральная — 50 м;
 *   - 5 м и 15 м от аутов на всю длину — самые тонкие (0.75);
 *   - ворота: схематичное «H» плашмя на try-линии, просвет 5 м, глубина 2.5 м.
 * Используется и в react-konva Field.tsx, и в offscreen-рендере экспорта GIF — единый источник.
 */
export function getFieldMarks(): FieldMarks {
  const { width, height, background, lineColor, unitsPerMeter } = FIELD;
  const m = (meters: number) => meters * unitsPerMeter;

  const IN_GOAL = 10; // зачетная зона, м
  const tryLeft = m(IN_GOAL);
  const tryRight = width - m(IN_GOAL);

  // Ворота: стойки на try-линии, наружу от поля; перекладина — между серединами стоек.
  const cy = height / 2;
  const g2 = m(2.5); // полупросвет ворот (итого 5 м)
  const d = m(2.5); // вынос стоек за try-линию
  const goalLines: FieldLine[] = [
    // левые ворота (стойки уходят к ближней лицевой)
    { points: [tryLeft, cy - g2, tryLeft - d, cy - g2], stroke: lineColor, strokeWidth: 3 },
    { points: [tryLeft, cy + g2, tryLeft - d, cy + g2], stroke: lineColor, strokeWidth: 3 },
    {
      points: [tryLeft - d / 2, cy - g2, tryLeft - d / 2, cy + g2],
      stroke: lineColor,
      strokeWidth: 3,
    },
    // правые ворота (стойки уходят к дальней лицевой)
    { points: [tryRight, cy - g2, tryRight + d, cy - g2], stroke: lineColor, strokeWidth: 3 },
    { points: [tryRight, cy + g2, tryRight + d, cy + g2], stroke: lineColor, strokeWidth: 3 },
    {
      points: [tryRight + d / 2, cy - g2, tryRight + d / 2, cy + g2],
      stroke: lineColor,
      strokeWidth: 3,
    },
  ];

  // 5 м и 15 м от аутов (верх/низ): на всю длину поля, включая зачетные зоны.
  const touchLines: FieldLine[] = [
    { points: [0, m(5), width, m(5)], stroke: lineColor, strokeWidth: 0.75 },
    { points: [0, height - m(5), width, height - m(5)], stroke: lineColor, strokeWidth: 0.75 },
    { points: [0, m(15), width, m(15)], stroke: lineColor, strokeWidth: 0.75 },
    { points: [0, height - m(15), width, height - m(15)], stroke: lineColor, strokeWidth: 0.75 },
  ];

  return {
    background: { x: 0, y: 0, width, height, fill: background, stroke: lineColor, strokeWidth: 3 },
    rects: [],
    lines: [
      // центральная (halfway) — 50 м от каждой try-линии
      { points: [width / 2, 0, width / 2, height], stroke: lineColor, strokeWidth: 2 },
      // try-линии: начало зачетных зон (10 м от лицевых)
      { points: [tryLeft, 0, tryLeft, height], stroke: lineColor, strokeWidth: 2 },
      { points: [tryRight, 0, tryRight, height], stroke: lineColor, strokeWidth: 2 },
      // 22-метровые
      { points: [tryLeft + m(22), 0, tryLeft + m(22), height], stroke: lineColor, strokeWidth: 1 },
      {
        points: [tryRight - m(22), 0, tryRight - m(22), height],
        stroke: lineColor,
        strokeWidth: 1,
      },
      ...touchLines,
      ...goalLines,
    ],
  };
}
