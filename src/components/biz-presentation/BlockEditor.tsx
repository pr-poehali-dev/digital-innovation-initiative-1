import Icon from "@/components/ui/icon";
import type { Block, BlockKind } from "@/lib/bizPresentationsApi";
import { COVER_COLORS } from "@/lib/bizPresentationsApi";

const COLOR_OPTIONS = ["green", "amber", "red", "blue", "violet", "pink", "orange", "gray"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] text-gray-500 mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600";

function ColorPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLOR_OPTIONS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          className={`w-5 h-5 rounded-full border-2 transition-all ${
            value === c ? "border-white scale-110" : "border-transparent opacity-60"
          }`}
          style={{
            background: {
              green: "#10b981", amber: "#f59e0b", red: "#ef4444", blue: "#3b82f6",
              violet: "#8b5cf6", pink: "#ec4899", orange: "#f97316", gray: "#9ca3af",
            }[c],
          }}
        />
      ))}
    </div>
  );
}

export default function BlockEditor({
  block,
  onChange,
  onRemove,
}: {
  block: Block;
  onChange: (b: Block) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof Block>(k: K, v: Block[K]) => onChange({ ...block, [k]: v });

  const KIND_LABEL: Record<BlockKind, string> = {
    text: "Текст",
    bullets: "Список",
    metrics: "Метрики",
    cards: "Карточки",
    steps: "Шаги процесса",
    roles: "Роли",
    quote: "Цитата",
    banner: "Баннер",
    table: "Таблица",
  };

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-violet-400">
          {KIND_LABEL[block.kind]}
        </span>
        <button onClick={onRemove} className="text-gray-500 hover:text-red-400 transition-colors">
          <Icon name="Trash2" size={13} />
        </button>
      </div>

      {block.kind === "text" && (
        <Field label="Текст">
          <textarea
            rows={3}
            value={block.text || ""}
            onChange={(e) => set("text", e.target.value)}
            className={inputCls + " resize-none"}
          />
        </Field>
      )}

      {block.kind === "bullets" && (
        <Field label="Пункты (по одному на строку)">
          <textarea
            rows={4}
            value={(block.items || []).join("\n")}
            onChange={(e) => set("items", e.target.value.split("\n"))}
            className={inputCls + " resize-none"}
          />
        </Field>
      )}

      {block.kind === "metrics" && (
        <div className="space-y-2">
          {(block.metrics || []).map((m, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                placeholder="Значение"
                value={m.value}
                onChange={(e) => {
                  const next = [...(block.metrics || [])];
                  next[i] = { ...m, value: e.target.value };
                  set("metrics", next);
                }}
                className={inputCls + " w-20"}
              />
              <input
                placeholder="Подпись"
                value={m.label}
                onChange={(e) => {
                  const next = [...(block.metrics || [])];
                  next[i] = { ...m, label: e.target.value };
                  set("metrics", next);
                }}
                className={inputCls + " flex-1"}
              />
              <button
                onClick={() => set("metrics", (block.metrics || []).filter((_, j) => j !== i))}
                className="text-gray-500 hover:text-red-400"
              >
                <Icon name="X" size={13} />
              </button>
            </div>
          ))}
          <button
            onClick={() => set("metrics", [...(block.metrics || []), { value: "", label: "" }])}
            className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
          >
            <Icon name="Plus" size={11} /> Добавить метрику
          </button>
        </div>
      )}

      {block.kind === "cards" && (
        <div className="space-y-2.5">
          {(block.cards || []).map((c, i) => (
            <div key={i} className="border border-gray-700 rounded-lg p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  placeholder="Иконка (lucide)"
                  value={c.icon || ""}
                  onChange={(e) => {
                    const next = [...(block.cards || [])];
                    next[i] = { ...c, icon: e.target.value };
                    set("cards", next);
                  }}
                  className={inputCls + " w-24"}
                />
                <input
                  placeholder="Заголовок"
                  value={c.title}
                  onChange={(e) => {
                    const next = [...(block.cards || [])];
                    next[i] = { ...c, title: e.target.value };
                    set("cards", next);
                  }}
                  className={inputCls + " flex-1"}
                />
                <button
                  onClick={() => set("cards", (block.cards || []).filter((_, j) => j !== i))}
                  className="text-gray-500 hover:text-red-400"
                >
                  <Icon name="X" size={13} />
                </button>
              </div>
              <textarea
                placeholder="Описание"
                rows={2}
                value={c.text || ""}
                onChange={(e) => {
                  const next = [...(block.cards || [])];
                  next[i] = { ...c, text: e.target.value };
                  set("cards", next);
                }}
                className={inputCls + " resize-none"}
              />
              <ColorPicker
                value={c.color}
                onChange={(v) => {
                  const next = [...(block.cards || [])];
                  next[i] = { ...c, color: v };
                  set("cards", next);
                }}
              />
            </div>
          ))}
          <button
            onClick={() => set("cards", [...(block.cards || []), { title: "", color: "violet" }])}
            className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
          >
            <Icon name="Plus" size={11} /> Добавить карточку
          </button>
        </div>
      )}

      {(block.kind === "steps" || block.kind === "roles") && (
        <div className="space-y-2.5">
          {(block.kind === "steps" ? block.steps : block.roles)?.map((s, i) => (
            <div key={i} className="border border-gray-700 rounded-lg p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                {block.kind === "roles" && (
                  <input
                    placeholder="Иконка"
                    value={(s as { icon?: string }).icon || ""}
                    onChange={(e) => {
                      const arr = [...(block.roles || [])];
                      arr[i] = { ...arr[i], icon: e.target.value };
                      set("roles", arr);
                    }}
                    className={inputCls + " w-20"}
                  />
                )}
                <input
                  placeholder="Заголовок"
                  value={s.title}
                  onChange={(e) => {
                    if (block.kind === "steps") {
                      const arr = [...(block.steps || [])];
                      arr[i] = { ...arr[i], title: e.target.value };
                      set("steps", arr);
                    } else {
                      const arr = [...(block.roles || [])];
                      arr[i] = { ...arr[i], title: e.target.value };
                      set("roles", arr);
                    }
                  }}
                  className={inputCls + " flex-1"}
                />
                <button
                  onClick={() => {
                    if (block.kind === "steps") set("steps", (block.steps || []).filter((_, j) => j !== i));
                    else set("roles", (block.roles || []).filter((_, j) => j !== i));
                  }}
                  className="text-gray-500 hover:text-red-400"
                >
                  <Icon name="X" size={13} />
                </button>
              </div>
              <textarea
                placeholder="Описание"
                rows={2}
                value={s.text || ""}
                onChange={(e) => {
                  if (block.kind === "steps") {
                    const arr = [...(block.steps || [])];
                    arr[i] = { ...arr[i], text: e.target.value };
                    set("steps", arr);
                  } else {
                    const arr = [...(block.roles || [])];
                    arr[i] = { ...arr[i], text: e.target.value };
                    set("roles", arr);
                  }
                }}
                className={inputCls + " resize-none"}
              />
              <ColorPicker
                value={s.color}
                onChange={(v) => {
                  if (block.kind === "steps") {
                    const arr = [...(block.steps || [])];
                    arr[i] = { ...arr[i], color: v };
                    set("steps", arr);
                  } else {
                    const arr = [...(block.roles || [])];
                    arr[i] = { ...arr[i], color: v };
                    set("roles", arr);
                  }
                }}
              />
            </div>
          ))}
          <button
            onClick={() => {
              if (block.kind === "steps") set("steps", [...(block.steps || []), { title: "", color: "violet" }]);
              else set("roles", [...(block.roles || []), { title: "", color: "violet" }]);
            }}
            className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
          >
            <Icon name="Plus" size={11} /> Добавить
          </button>
        </div>
      )}

      {block.kind === "quote" && (
        <div className="space-y-2">
          <Field label="Текст цитаты">
            <textarea
              rows={2}
              value={block.text || ""}
              onChange={(e) => set("text", e.target.value)}
              className={inputCls + " resize-none"}
            />
          </Field>
          <Field label="Автор">
            <input value={block.author || ""} onChange={(e) => set("author", e.target.value)} className={inputCls} />
          </Field>
        </div>
      )}

      {block.kind === "banner" && (
        <div className="space-y-2">
          <Field label="Текст баннера">
            <input value={block.text || ""} onChange={(e) => set("text", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Цвет">
            <div className="flex gap-1.5">
              {COVER_COLORS.map((c) => (
                <button
                  key={c.code}
                  onClick={() => set("color", c.code)}
                  className={`w-6 h-6 rounded-full bg-gradient-to-br ${c.from} ${c.to} border-2 ${
                    block.color === c.code ? "border-white" : "border-transparent opacity-60"
                  }`}
                />
              ))}
            </div>
          </Field>
        </div>
      )}

      {block.kind === "table" && (
        <div className="space-y-2">
          <Field label="Заголовки колонок (через запятую)">
            <input
              value={(block.headers || []).join(", ")}
              onChange={(e) => set("headers", e.target.value.split(",").map((s) => s.trim()))}
              className={inputCls}
            />
          </Field>
          <Field label="Строки (каждая строка — ячейки через ;)">
            <textarea
              rows={3}
              value={(block.rows || []).map((r) => r.join("; ")).join("\n")}
              onChange={(e) =>
                set(
                  "rows",
                  e.target.value.split("\n").map((line) => line.split(";").map((c) => c.trim())),
                )
              }
              className={inputCls + " resize-none"}
            />
          </Field>
        </div>
      )}
    </div>
  );
}