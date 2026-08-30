import { carrierAt, resolvePosition } from "../canvas/resolvePosition";
import { useProjectStore } from "../store/projectStore";
import type { BallData, ObjectData, PlayerData } from "../types";
import { Field, FieldRow, NumberInput, Palette, Select, SideHead, TextInput } from "../ui";

const TEAM_COLORS: Record<PlayerData["team"], string> = {
  blue: "#1e88e5",
  red: "#e53935",
};

/** Полная панель свойств: общие поля + поля по типу объекта; при пустом/множественном выделении — настройки сцены. */
export default function PropertiesPanel() {
  const selectedIds = useProjectStore((s) => s.selectedIds);
  const objects = useProjectStore((s) => s.objects);
  const currentTime = useProjectStore((s) => s.currentTime);
  const updateObject = useProjectStore((s) => s.updateObject);
  const setKeyframe = useProjectStore((s) => s.setKeyframe);
  const setBallCarrier = useProjectStore((s) => s.setBallCarrier);
  const settings = useProjectStore((s) => s.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);

  // Свойства объекта показываем только при ровно одном выделенном; иначе — настройки сцены.
  const obj = selectedIds.length === 1 ? objects.find((o) => o.id === selectedIds[0]) : undefined;

  if (!obj) {
    return (
      <>
        <SideHead>Сцена</SideHead>
        <div style={{ padding: 14 }}>
          <Field label="Скорость воспроизведения">
            <Select
              value={String(settings.playbackSpeed ?? 1)}
              onChange={(e) => updateSettings({ playbackSpeed: Number(e.target.value) })}
            >
              <option value="0.25">0.25× — очень медленно</option>
              <option value="0.5">0.5× — медленно</option>
              <option value="0.75">0.75×</option>
              <option value="1">1× — обычно</option>
              <option value="1.5">1.5×</option>
              <option value="2">2× — быстро</option>
              <option value="4">4× — очень быстро</option>
            </Select>
          </Field>
          <Field label="Размер GIF (по ширине)">
            <Select
              value={String(settings.size)}
              onChange={(e) =>
                updateSettings({ size: Number(e.target.value) as 720 | 1080 | 1440 })
              }
            >
              <option value="720">720</option>
              <option value="1080">1080</option>
              <option value="1440">1440</option>
            </Select>
          </Field>
          <Field label="Длительность (сек)">
            <NumberInput
              value={settings.durationSec}
              min={1}
              step={1}
              onChange={(e) =>
                updateSettings({ durationSec: Math.max(1, Number(e.target.value) || 0) })
              }
            />
          </Field>
          <Field label="Шаг / фрейм (сек)">
            <NumberInput
              value={settings.stepSec ?? 1}
              min={0.1}
              step={0.5}
              onChange={(e) =>
                updateSettings({
                  stepSec: Math.max(0.1, Number(e.target.value) || 1),
                })
              }
            />
          </Field>
          <Field label="Интерполяция">
            <Select
              value={settings.interpolation ?? "linear"}
              onChange={(e) =>
                updateSettings({
                  interpolation: e.target.value as "linear" | "ease" | "catmullrom",
                })
              }
            >
              <option value="linear">linear</option>
              <option value="ease">ease</option>
              <option value="catmullrom">catmullrom</option>
            </Select>
          </Field>
          {selectedIds.length > 1 ? (
            <p style={{ fontSize: 12, color: "#ffb74d", margin: "8px 0 0" }}>
              Выбрано объектов: {selectedIds.length}. Свойства доступны при одном выделении.
            </p>
          ) : (
            <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "8px 0 0" }}>
              Выделите объект на канвасе или в таймлайне.
            </p>
          )}
        </div>
      </>
    );
  }

  const up = (patch: Parameters<typeof updateObject>[1]) => updateObject(obj.id, patch);
  const interpolation = settings.interpolation ?? "linear";
  const step = settings.stepSec ?? 1;
  const pos = resolvePosition(objects, obj, currentTime, interpolation, step);
  const ball = objects.find((o): o is BallData => o.kind === "ball");
  const ballCarrierNow = ball ? carrierAt(ball, currentTime) : null;

  // rotation правит rotation ключа в текущий момент времени (модель та же, что у drag→key).
  const setRotation = (deg: number) =>
    setKeyframe(obj.id, { time: currentTime, x: pos.x, y: pos.y, rotation: deg });

  return (
    <>
      <SideHead>Свойства · {obj.kind}</SideHead>
      <div style={{ padding: 14 }}>
        {/* Общие */}
        <Field label="Видимость">
          <input
            type="checkbox"
            checked={obj.visible}
            onChange={(e) => up({ visible: e.target.checked })}
          />
        </Field>
        <FieldRow>
          <Field label="Z-index">
            <NumberInput
              value={obj.zIndex}
              onChange={(e) => up({ zIndex: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Поворот °">
            <NumberInput
              value={Math.round(pos.rotation)}
              onChange={(e) => setRotation(Number(e.target.value) || 0)}
            />
          </Field>
        </FieldRow>

        <div style={{ borderTop: "1px solid var(--border-soft)", margin: "6px 0 12px" }} />

        {obj.kind === "player" && (
          <>
            <FieldRow>
              <Field label="Команда">
                <Select
                  value={obj.team}
                  onChange={(e) => {
                    const team = e.target.value as PlayerData["team"];
                    up({ team, color: TEAM_COLORS[team] });
                  }}
                >
                  <option value="blue">Синяя</option>
                  <option value="red">Красная</option>
                </Select>
              </Field>
              <Field label="Номер">
                <NumberInput
                  value={obj.number}
                  min={0}
                  onChange={(e) => up({ number: Number(e.target.value) || 0 })}
                />
              </Field>
            </FieldRow>
            <Field label="Цвет">
              <Palette value={obj.color} onChange={(v) => up({ color: v })} />
            </Field>
            <Field label="Радиус">
              <NumberInput
                value={obj.radius}
                min={1}
                onChange={(e) => up({ radius: Number(e.target.value) || 0 })}
              />
            </Field>
            {ball && (
              <CarrierField value={ballCarrierNow} objects={objects} onChange={setBallCarrier} />
            )}
          </>
        )}

        {obj.kind === "ball" && (
          <>
            <Field label="Цвет">
              <Palette value={obj.color} onChange={(v) => up({ color: v })} />
            </Field>
            <Field label="Радиус">
              <NumberInput
                value={obj.radius}
                min={1}
                onChange={(e) => up({ radius: Number(e.target.value) || 0 })}
              />
            </Field>
            {ball && (
              <CarrierField value={ballCarrierNow} objects={objects} onChange={setBallCarrier} />
            )}
          </>
        )}

        {obj.kind === "arrow" && (
          <>
            <Field label="Цвет линии">
              <Palette value={obj.stroke} onChange={(v) => up({ stroke: v })} />
            </Field>
            <Field label="Толщина">
              <NumberInput
                value={obj.strokeWidth}
                min={1}
                onChange={(e) => up({ strokeWidth: Number(e.target.value) || 0 })}
              />
            </Field>
            <FieldRow>
              <Field label="Конец X (отн.)">
                <NumberInput
                  value={obj.points[0]}
                  onChange={(e) => up({ points: [Number(e.target.value) || 0, obj.points[1]] })}
                />
              </Field>
              <Field label="Конец Y (отн.)">
                <NumberInput
                  value={obj.points[1]}
                  onChange={(e) => up({ points: [obj.points[0], Number(e.target.value) || 0] })}
                />
              </Field>
            </FieldRow>
          </>
        )}

        {obj.kind === "circle" && (
          <>
            <Field label="Радиус">
              <NumberInput
                value={obj.radius}
                min={1}
                onChange={(e) => up({ radius: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Обводка">
              <Palette value={obj.stroke} onChange={(v) => up({ stroke: v })} />
            </Field>
            <Field label="Заливка">
              <Palette value={obj.fill} onChange={(v) => up({ fill: v })} />
            </Field>
          </>
        )}

        {obj.kind === "text" && (
          <>
            <Field label="Текст">
              <TextInput value={obj.text} onChange={(e) => up({ text: e.target.value })} />
            </Field>
            <Field label="Размер шрифта">
              <NumberInput
                value={obj.fontSize}
                min={6}
                onChange={(e) => up({ fontSize: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Цвет">
              <Palette value={obj.fill} onChange={(v) => up({ fill: v })} />
            </Field>
          </>
        )}

        {obj.kind === "rectangle" && (
          <>
            <FieldRow>
              <Field label="Ширина">
                <NumberInput
                  value={obj.width}
                  min={1}
                  onChange={(e) => up({ width: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Высота">
                <NumberInput
                  value={obj.height}
                  min={1}
                  onChange={(e) => up({ height: Number(e.target.value) || 0 })}
                />
              </Field>
            </FieldRow>
            <Field label="Обводка">
              <Palette value={obj.stroke} onChange={(v) => up({ stroke: v })} />
            </Field>
            <Field label="Заливка">
              <Palette value={obj.fill} onChange={(v) => up({ fill: v })} />
            </Field>
          </>
        )}

        {obj.kind === "highlight" && (
          <>
            <FieldRow>
              <Field label="Ширина">
                <NumberInput
                  value={obj.width}
                  min={1}
                  onChange={(e) => up({ width: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Высота">
                <NumberInput
                  value={obj.height}
                  min={1}
                  onChange={(e) => up({ height: Number(e.target.value) || 0 })}
                />
              </Field>
            </FieldRow>
            <Field label="Цвет">
              <Palette value={obj.color} onChange={(v) => up({ color: v })} />
            </Field>
            <Field label="Прозрачность (0–1)">
              <NumberInput
                value={obj.opacity}
                min={0}
                step={0.05}
                onChange={(e) =>
                  up({ opacity: Math.max(0, Math.min(1, Number(e.target.value) || 0)) })
                }
              />
            </Field>
          </>
        )}
      </div>
    </>
  );
}

/** Селектор владельца мяча в текущем кадре: игрок из списка либо «свободен».
 *  Смена значения создаёт событие передачи на таймлайне в текущем кадре. */
function CarrierField({
  value,
  objects,
  onChange,
}: {
  value: string | null | undefined;
  objects: ObjectData[];
  onChange: (id: string | null) => void;
}) {
  const players = objects.filter((o): o is PlayerData => o.kind === "player");
  return (
    <Field label="Владелец (в кадре)">
      <Select
        value={value ?? "free"}
        onChange={(e) => onChange(e.target.value === "free" ? null : e.target.value)}
      >
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            #{p.number} · {p.team === "blue" ? "синий" : "красный"}
          </option>
        ))}
        <option value="free">свободен</option>
      </Select>
    </Field>
  );
}
