import { useRef, useState } from "react";
import { downloadBlob, exportGif } from "../export/gifExporter";
import { loadProjectFile } from "../serialization/jsonLoader";
import { downloadProjectJson } from "../serialization/jsonSaver";
import { loadProjectYamlFile } from "../serialization/yamlLoader";
import { downloadProjectYaml } from "../serialization/yamlSaver";
import {
  createArrow,
  createBall,
  createCircle,
  createHighlight,
  createPlayer,
  createRectangle,
  createText,
  useHistory,
  useProjectStore,
} from "../store/projectStore";
import { Button, ButtonGroup, Cta, Dropdown } from "../ui";

export default function Toolbar() {
  const objects = useProjectStore((s) => s.objects);
  const selectedIds = useProjectStore((s) => s.selectedIds);
  const addObject = useProjectStore((s) => s.addObject);
  const removeSelected = useProjectStore((s) => s.removeSelected);
  const duplicateSelected = useProjectStore((s) => s.duplicateSelected);
  const clearAll = useProjectStore((s) => s.clearAll);
  const snapEnabled = useProjectStore((s) => s.snapEnabled);
  const toggleSnap = useProjectStore((s) => s.toggleSnap);
  const settings = useProjectStore((s) => s.settings);
  const loadProject = useProjectStore((s) => s.loadProject);
  const { undo, redo, canUndo, canRedo, clear } = useHistory();
  const jsonInput = useRef<HTMLInputElement>(null);
  const yamlInput = useRef<HTMLInputElement>(null);
  const [exportState, setExportState] = useState<{ busy: boolean; progress: number }>({
    busy: false,
    progress: 0,
  });

  const nextPlayerNumber = () => {
    const nums = objects
      .filter((o) => o.kind === "player")
      .map((o) => (o.kind === "player" ? o.number : 0));
    return nums.length === 0 ? 1 : Math.max(...nums) + 1;
  };

  const hasSelection = selectedIds.length > 0;

  const loadFrom = async (file: File | undefined, kind: "json" | "yaml") => {
    if (!file) return;
    try {
      const project =
        kind === "json" ? await loadProjectFile(file) : await loadProjectYamlFile(file);
      loadProject({ settings: project.settings, objects: project.objects });
      clear(); // загруженный проект — новая точка отсчёта, историю чистим
    } catch (err) {
      console.error(`${kind.toUpperCase()} load failed`, err);
      window.alert(err instanceof Error ? err.message : "Не удалось открыть файл");
    }
  };

  const handleExport = async () => {
    if (exportState.busy) return;
    setExportState({ busy: true, progress: 0 });
    try {
      const blob = await exportGif(objects, settings, (p) =>
        setExportState({ busy: true, progress: p }),
      );
      downloadBlob(blob, "playbook.gif");
    } catch (err) {
      console.error("GIF export failed", err);
    } finally {
      setExportState({ busy: false, progress: 0 });
    }
  };

  return (
    <div className="pb-topbar">
      <div className="pb-brand">
        <span className="dot" />
        Playbook<b>Builder</b>
      </div>

      <ButtonGroup label="История">
        <Button onClick={() => undo()} disabled={!canUndo} title="Отменить (Ctrl+Z)">
          Отменить
        </Button>
        <Button onClick={() => redo()} disabled={!canRedo} title="Вернуть (Ctrl+Shift+Z)">
          Вернуть
        </Button>
      </ButtonGroup>

      <ButtonGroup label="Добавить">
        <Button onClick={() => addObject(createPlayer(nextPlayerNumber(), 300, 360, "blue"))}>
          Игрок
        </Button>
        <Button onClick={() => addObject(createBall(300, 360))}>Мяч</Button>
        <Button onClick={() => addObject(createArrow(300, 360))}>Стрелка</Button>
        <Button onClick={() => addObject(createCircle(300, 360))}>Круг</Button>
        <Button onClick={() => addObject(createText(300, 360))}>Текст</Button>
        <Button onClick={() => addObject(createRectangle(300, 360))}>Прямоуг</Button>
        <Button onClick={() => addObject(createHighlight(300, 360))}>Зона</Button>
      </ButtonGroup>

      <ButtonGroup label="Правка">
        <Button onClick={duplicateSelected} disabled={!hasSelection} title="Дублировать (Ctrl+D)">
          Дублировать
        </Button>
        <Button
          variant="danger"
          onClick={removeSelected}
          disabled={!hasSelection}
          title="Удалить (Delete)"
        >
          Удалить
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            if (objects.length === 0) return;
            if (window.confirm(`Удалить все объекты (${objects.length})? Отменить можно Ctrl+Z.`))
              clearAll();
          }}
          disabled={objects.length === 0}
          title="Удалить все объекты со сцены (отменяемо через Ctrl+Z)"
        >
          Очистить всё
        </Button>
        <Button
          variant={snapEnabled ? "active" : "default"}
          onClick={toggleSnap}
          title="Привязка к сетке"
        >
          Сетка
        </Button>
      </ButtonGroup>

      <ButtonGroup label="Файл">
        <Dropdown
          label="Сохранить"
          items={[
            { label: "JSON", onClick: () => downloadProjectJson(settings, objects) },
            { label: "YAML", onClick: () => downloadProjectYaml(settings, objects) },
          ]}
        />
        <Dropdown
          label="Открыть"
          items={[
            { label: "JSON", onClick: () => jsonInput.current?.click() },
            { label: "YAML", onClick: () => yamlInput.current?.click() },
          ]}
        />
      </ButtonGroup>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", height: 50 }}>
        <Cta onClick={handleExport} disabled={exportState.busy}>
          {exportState.busy ? `Экспорт… ${Math.round(exportState.progress * 100)}%` : "Экспорт GIF"}
        </Cta>
      </div>

      <input
        ref={jsonInput}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(e) => {
          loadFrom(e.target.files?.[0], "json");
          e.target.value = "";
        }}
      />
      <input
        ref={yamlInput}
        type="file"
        accept="text/yaml,.yaml,.yml"
        style={{ display: "none" }}
        onChange={(e) => {
          loadFrom(e.target.files?.[0], "yaml");
          e.target.value = "";
        }}
      />
    </div>
  );
}
