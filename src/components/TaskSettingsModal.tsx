import { useEffect, useState } from "react";
import { tasksApi } from "@/lib/api";
import Icon from "@/components/ui/icon";

interface TaskDoc {
  id: number;
  name: string;
  file_type: string;
  role: string;
  usage_mode?: string;
  priority?: string;
  must_use?: boolean;
  instruction?: string;
}

interface Task {
  id: number;
  title: string;
  topic?: string;
  goal?: string;
  audience?: string;
  style?: string;
  requested_slide_count?: number;
  additional_instructions?: string;
  style_preset?: string;
  documents: TaskDoc[];
}

interface ProjectDoc {
  id: number;
  name: string;
  file_type: string;
  attached_role: string | null;
}

const STYLES = ["академический", "деловой", "формальный", "краткий"];

const STYLE_PRESETS = [
  { value: "from_template", label: "🎨 По образцу из задания", desc: "Берём стиль из приложенного PPTX-образца" },
  { value: "dark_corporate", label: "🌑 Тёмный корпоративный", desc: "Тёмно-синий фон, белый текст" },
  { value: "light_minimal", label: "☀️ Светлый минимализм", desc: "Белый фон, лаконично" },
  { value: "academic", label: "📚 Академический", desc: "Бежевый фон, Times New Roman" },
  { value: "marketing", label: "💗 Маркетинговый", desc: "Розовые акценты, Montserrat" },
  { value: "scientific", label: "🔬 Научный", desc: "Светло-голубой, Roboto" },
];

const ROLES = [
  { value: "standard", label: "📜 Стандарт / норматив" },
  { value: "content", label: "📚 Содержательный материал" },
  { value: "methodology", label: "🧭 Методика" },
  { value: "template", label: "🎨 Образец формата" },
  { value: "background", label: "📎 Фоновый контекст" },
  { value: "excluded", label: "⛔ Не использовать" },
];

type Tab = "params" | "style" | "docs" | "add_doc";

interface Props {
  task: Task;
  onClose: () => void;
  onSaved: () => void;
}

export default function TaskSettingsModal({ task, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>("params");
  const [saving, setSaving] = useState(false);

  // Params tab state
  const [title, setTitle] = useState(task.title || "");
  const [topic, setTopic] = useState(task.topic || "");
  const [goal, setGoal] = useState(task.goal || "");
  const [audience, setAudience] = useState(task.audience || "");
  const [style, setStyle] = useState(task.style || "");
  const [slides, setSlides] = useState(task.requested_slide_count?.toString() || "");
  const [addInstructions, setAddInstructions] = useState(task.additional_instructions || "");
  const [stylePreset, setStylePreset] = useState(task.style_preset || "from_template");

  // Docs tab — локальная копия для inline-edit
  const [docs, setDocs] = useState<TaskDoc[]>(task.documents || []);

  // Add doc tab
  const [projectDocs, setProjectDocs] = useState<ProjectDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  useEffect(() => {
    if (tab === "add_doc" && projectDocs.length === 0) {
      setLoadingDocs(true);
      tasksApi.listProjectDocuments(task.id)
        .then((d) => setProjectDocs(d.documents || []))
        .catch(() => {})
        .finally(() => setLoadingDocs(false));
    }
  }, [tab, task.id, projectDocs.length]);

  const saveParams = async () => {
    setSaving(true);
    try {
      await tasksApi.updateSettings(task.id, {
        title: title.trim(),
        topic: topic.trim(),
        goal: goal.trim(),
        audience: audience.trim(),
        style,
        requested_slide_count: slides ? Number(slides) : undefined,
        additional_instructions: addInstructions.trim(),
        style_preset: stylePreset,
      });
      onSaved();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const updateDocLocal = (docId: number, patch: Partial<TaskDoc>) => {
    setDocs((ds) => ds.map((d) => (d.id === docId ? { ...d, ...patch } : d)));
  };

  const saveDoc = async (doc: TaskDoc) => {
    setSaving(true);
    try {
      await tasksApi.setDocRole(task.id, doc.id, {
        role: doc.role,
        instruction: doc.instruction || "",
        must_use: doc.must_use || false,
        priority: doc.priority || "medium",
      });
      onSaved();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const detachDoc = async (docId: number) => {
    if (!confirm("Открепить документ от задания?")) return;
    setSaving(true);
    try {
      await tasksApi.detachDocument(task.id, docId);
      setDocs((ds) => ds.filter((d) => d.id !== docId));
      setProjectDocs([]);
      onSaved();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const attachDoc = async (docId: number, role: string) => {
    setSaving(true);
    try {
      await tasksApi.attachDocument(task.id, docId, role);
      setProjectDocs([]);
      onSaved();
      setTab("docs");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 px-4 py-8 overflow-y-auto">
      <div className="bg-white border rounded-2xl w-full max-w-3xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="Settings" size={20} />
            Настройки задания
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <Icon name="X" size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-2 overflow-x-auto">
          {[
            { id: "params" as Tab, label: "📝 Параметры" },
            { id: "style" as Tab, label: "🎨 Стиль PPTX" },
            { id: "docs" as Tab, label: `📂 Документы (${docs.length})` },
            { id: "add_doc" as Tab, label: "➕ Прикрепить" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === t.id ? "border-slate-800 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {tab === "params" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Название задания</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Тема</label>
                <input value={topic} onChange={(e) => setTopic(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Цель</label>
                <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Аудитория</label>
                <input value={audience} onChange={(e) => setAudience(e.target.value)}
                  placeholder="например: руководство, клиенты, преподаватели"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Стиль текста</label>
                  <select value={style} onChange={(e) => setStyle(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">— не задан —</option>
                    {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Число слайдов</label>
                  <input type="number" value={slides} onChange={(e) => setSlides(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Дополнительные инструкции</label>
                <textarea value={addInstructions} onChange={(e) => setAddInstructions(e.target.value)} rows={3}
                  placeholder="что важно учесть, чего избегать, особые требования"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white resize-none" />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                ℹ️ Изменения применятся при следующей генерации версии. Уже созданные версии не меняются.
              </div>
            </div>
          )}

          {tab === "style" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 mb-2">
                Выберите визуальный пресет для экспорта PPTX. Если выбран «По образцу» — извлекаем цвета и шрифт из приложенного к заданию PPTX-образца (роль 🎨 Образец формата).
              </p>
              {STYLE_PRESETS.map((p) => (
                <label key={p.value}
                  className={`block border rounded-lg p-3 cursor-pointer transition-colors ${
                    stylePreset === p.value ? "border-slate-800 bg-slate-50" : "border-slate-200 hover:bg-slate-50"
                  }`}>
                  <div className="flex items-start gap-2">
                    <input type="radio" name="style_preset" value={p.value}
                      checked={stylePreset === p.value}
                      onChange={() => setStylePreset(p.value)}
                      className="mt-1" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{p.label}</div>
                      <div className="text-xs text-slate-500">{p.desc}</div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {tab === "docs" && (
            <div className="space-y-3">
              {docs.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">К заданию не привязано документов</p>
              ) : docs.map((doc) => (
                <div key={doc.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Icon name="FileText" size={16} className="text-slate-400 flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{doc.name}</span>
                      <span className="text-xs text-slate-400">{doc.file_type}</span>
                    </div>
                    <button onClick={() => detachDoc(doc.id)} disabled={saving}
                      className="text-xs text-red-500 hover:text-red-700 p-1">
                      <Icon name="Trash2" size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={doc.role}
                      onChange={(e) => updateDocLocal(doc.id, { role: e.target.value })}
                      className="border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white">
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={!!doc.must_use}
                        onChange={(e) => updateDocLocal(doc.id, { must_use: e.target.checked })} />
                      <span>🔴 Обязателен (AI не может проигнорировать)</span>
                    </label>
                  </div>
                  <textarea value={doc.instruction || ""}
                    onChange={(e) => updateDocLocal(doc.id, { instruction: e.target.value })}
                    rows={2}
                    placeholder="📝 Инструкция к документу: как использовать в задании (например: «возьми только главу 3 и пример из приложения А»)"
                    className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white resize-none" />
                  <button onClick={() => saveDoc(doc)} disabled={saving}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-md font-medium disabled:opacity-50">
                    Сохранить
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === "add_doc" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Документы проекта, которые можно прикрепить к этому заданию. Уже прикреплённые отмечены ✅.
              </p>
              {loadingDocs ? (
                <p className="text-sm text-slate-500 text-center py-4">Загрузка...</p>
              ) : projectDocs.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">В проекте пока нет других документов</p>
              ) : projectDocs.map((pd) => (
                <div key={pd.id} className="border border-slate-200 rounded-lg p-3 flex items-center gap-2">
                  <Icon name="FileText" size={16} className="text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium flex-1 truncate">{pd.name}</span>
                  <span className="text-xs text-slate-400">{pd.file_type}</span>
                  {pd.attached_role ? (
                    <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">✅ прикреплён</span>
                  ) : (
                    <AttachControl onAttach={(role) => attachDoc(pd.id, role)} disabled={saving} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-3 flex justify-end gap-2">
          <button onClick={onClose}
            className="border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-50">
            Закрыть
          </button>
          {(tab === "params" || tab === "style") && (
            <button onClick={saveParams} disabled={saving}
              className="bg-slate-800 hover:bg-slate-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
              {saving ? "Сохраняю..." : "Сохранить"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


function AttachControl({ onAttach, disabled }: { onAttach: (role: string) => void; disabled: boolean }) {
  const [role, setRole] = useState("content");
  return (
    <div className="flex items-center gap-1">
      <select value={role} onChange={(e) => setRole(e.target.value)}
        className="border border-slate-300 rounded-md px-1.5 py-1 text-xs bg-white">
        {ROLES.filter((r) => r.value !== "excluded").map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <button onClick={() => onAttach(role)} disabled={disabled}
        className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded-md font-medium disabled:opacity-50">
        Прикрепить
      </button>
    </div>
  );
}
