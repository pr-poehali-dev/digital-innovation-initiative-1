import { useState, useRef } from "react";
import { deptFunctionsApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type DeptFunction = {
  id: number;
  dept_name: string;
  title: string;
  description: string;
  goals: string;
  category: string;
  priority: number;
  source_image_url: string | null;
  created_at: string;
};

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  regulatory:    { label: "Нормативная",    color: "bg-purple-100 text-purple-700" },
  operational:   { label: "Операционная",   color: "bg-blue-100 text-blue-700" },
  analytical:    { label: "Аналитическая",  color: "bg-amber-100 text-amber-700" },
  communication: { label: "Коммуникации",   color: "bg-green-100 text-green-700" },
  control:       { label: "Контроль",       color: "bg-red-100 text-red-700" },
  planning:      { label: "Планирование",   color: "bg-indigo-100 text-indigo-700" },
};

type DraftFunction = { title: string; description: string; goals: string; category: string; dept_name: string; checked: boolean };

type Props = {
  projectId: number;
  functions: DeptFunction[];
  loading?: boolean;
  onReload: () => void;
};

export default function DeptFunctionsTab({ projectId, functions, loading = false, onReload }: Props) {
  const [uploading, setUploading] = useState(false);
  const [deptName, setDeptName] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newFunc, setNewFunc] = useState({ title: "", description: "", goals: "", category: "operational", dept_name: "" });
  const [saving, setSaving] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftFunction[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File, kind: "image" | "pdf" | "docx") => {
    setUploading(true);
    setOcrError(null);
    setConfirmResult(null);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const b64 = (e.target?.result as string).split(",")[1];
        try {
          const res = await deptFunctionsApi.extractFunctions(
            kind === "image"
              ? { project_id: projectId, image_b64: b64, dept_name: deptName }
              : { project_id: projectId, file_b64: b64, file_type: kind, dept_name: deptName }
          ) as { ok: boolean; functions?: Array<{ title: string; description: string; goals: string; category: string }>; error?: string };
          if (res.ok && res.functions) {
            if (res.functions.length === 0) {
              setOcrError("AI не нашёл ни одной функции в документе. Попробуйте другой файл или добавьте функции вручную.");
            } else {
              setDraft(res.functions.map(f => ({ ...f, dept_name: deptName, checked: true })));
            }
          } else {
            setOcrError(res.error || "Не удалось распознать документ");
          }
        } catch {
          setOcrError("Не удалось распознать документ. Попробуйте ещё раз.");
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
  };

  const handleDocSelect = (file: File) => {
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext === "pdf") handleUpload(file, "pdf");
    else if (ext === "docx") handleUpload(file, "docx");
    else setOcrError("Поддерживаются только PDF и DOCX");
  };

  const updateDraftItem = (idx: number, patch: Partial<DraftFunction>) => {
    setDraft(d => d ? d.map((item, i) => i === idx ? { ...item, ...patch } : item) : d);
  };

  const handleConfirmDraft = async () => {
    if (!draft) return;
    const selected = draft.filter(f => f.checked && f.title.trim());
    if (selected.length === 0) return;
    setConfirming(true);
    try {
      const res = await deptFunctionsApi.confirmFunctions({
        project_id: projectId,
        functions: selected.map(({ title, description, goals, category, dept_name }) => ({ title, description, goals, category, dept_name })),
      }) as { ok: boolean; created: number };
      if (res.ok) {
        setConfirmResult(`Добавлено функций: ${res.created}`);
        setDraft(null);
        onReload();
      }
    } finally {
      setConfirming(false);
    }
  };

  const handleAdd = async () => {
    if (!newFunc.title.trim()) return;
    setSaving(true);
    try {
      await deptFunctionsApi.createFunction({ ...newFunc, project_id: projectId });
      setAddOpen(false);
      setNewFunc({ title: "", description: "", goals: "", category: "operational", dept_name: "" });
      onReload();
    } finally {
      setSaving(false);
    }
  };

  const grouped = functions.reduce<Record<string, DeptFunction[]>>((acc, f) => {
    const key = f.dept_name || "Без подразделения";
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Загрузка положения о подразделении — скрин или PDF/DOCX */}
      <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 bg-slate-50">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex-1">
            <p className="font-medium text-slate-800">Загрузить положение о подразделении</p>
            <p className="text-sm text-muted-foreground mt-0.5">AI распознает текст и автоматически извлечёт функции и цели — PDF или DOCX</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <input
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-48"
              placeholder="Название подразделения"
              value={deptName}
              onChange={e => setDeptName(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled
              title="Временно недоступно — распознавание изображений будет включено после настройки прав в Yandex Cloud"
              className="gap-2 cursor-not-allowed"
            >
              <Icon name="Image" size={14} />
              Загрузить скрин (скоро)
            </Button>
            <Button
              size="sm"
              onClick={() => docRef.current?.click()}
              disabled={uploading}
              className="gap-2"
            >
              {uploading ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="FileText" size={14} />}
              {uploading ? "Распознаю..." : "Загрузить PDF / DOCX"}
            </Button>
          </div>
        </div>
        {confirmResult && (
          <div className="mt-3 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2">
            <Icon name="CheckCircle" size={14} />
            {confirmResult}
          </div>
        )}
        {ocrError && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2">
            <Icon name="AlertTriangle" size={14} />
            {ocrError}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0], "image"); e.target.value = ""; }} />
        <input ref={docRef} type="file" accept=".pdf,.docx" className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleDocSelect(e.target.files[0]); e.target.value = ""; }} />
      </div>

      {/* Экран подтверждения распознанных функций перед сохранением */}
      {draft && (
        <div className="border border-violet-200 rounded-xl bg-violet-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">AI нашёл {draft.length} функций — проверьте перед сохранением</p>
              <p className="text-sm text-muted-foreground mt-0.5">Снимите галочку, чтобы не создавать функцию, или отредактируйте текст</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)} className="gap-1.5 flex-shrink-0">
              <Icon name="X" size={14} /> Отменить всё
            </Button>
          </div>

          <div className="space-y-2 max-h-[480px] overflow-y-auto">
            {draft.map((item, idx) => (
              <div key={idx} className={`border rounded-lg p-3 bg-white space-y-2 transition-opacity ${item.checked ? "border-slate-200" : "border-slate-100 opacity-50"}`}>
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1.5 flex-shrink-0"
                    checked={item.checked}
                    onChange={e => updateDraftItem(idx, { checked: e.target.checked })}
                  />
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex gap-2">
                      <input
                        className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-medium flex-1"
                        value={item.title}
                        onChange={e => updateDraftItem(idx, { title: e.target.value })}
                        placeholder="Название функции"
                      />
                      <select
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white flex-shrink-0"
                        value={item.category}
                        onChange={e => updateDraftItem(idx, { category: e.target.value })}
                      >
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    {item.description && (
                      <textarea
                        className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 w-full resize-none"
                        rows={2}
                        value={item.description}
                        onChange={e => updateDraftItem(idx, { description: e.target.value })}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="outline" onClick={() => setDraft(null)} disabled={confirming}>
              Отмена
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmDraft}
              disabled={confirming || draft.every(f => !f.checked || !f.title.trim())}
              className="gap-1.5"
            >
              {confirming ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Check" size={14} />}
              {confirming ? "Сохраняю..." : `Подтвердить и создать (${draft.filter(f => f.checked && f.title.trim()).length})`}
            </Button>
          </div>
        </div>
      )}

      {/* Кнопка добавить вручную */}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-800">
          Функции подразделения <span className="text-muted-foreground font-normal">({functions.length})</span>
        </h3>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
          <Icon name="Plus" size={14} />
          Добавить вручную
        </Button>
      </div>

      {/* Форма добавления */}
      {addOpen && (
        <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
          <p className="font-medium text-sm">Новая функция</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" placeholder="Название подразделения"
              value={newFunc.dept_name} onChange={e => setNewFunc(p => ({ ...p, dept_name: e.target.value }))} />
            <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
              value={newFunc.category} onChange={e => setNewFunc(p => ({ ...p, category: e.target.value }))}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <input className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-full" placeholder="Название функции*"
            value={newFunc.title} onChange={e => setNewFunc(p => ({ ...p, title: e.target.value }))} />
          <textarea className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-full resize-none" rows={2} placeholder="Описание функции"
            value={newFunc.description} onChange={e => setNewFunc(p => ({ ...p, description: e.target.value }))} />
          <textarea className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-full resize-none" rows={2} placeholder="Цели функции"
            value={newFunc.goals} onChange={e => setNewFunc(p => ({ ...p, goals: e.target.value }))} />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setAddOpen(false)}>Отмена</Button>
            <Button size="sm" onClick={handleAdd} disabled={saving || !newFunc.title.trim()}>
              {saving ? "Сохранение..." : "Добавить"}
            </Button>
          </div>
        </div>
      )}

      {/* Список функций по подразделениям */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="border border-slate-200 rounded-xl p-3 h-14 animate-pulse bg-slate-50" />
          ))}
        </div>
      ) : functions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Icon name="ListTodo" size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Функции не добавлены</p>
          <p className="text-sm mt-1">Загрузи положение в PDF или DOCX — AI сам извлечёт все функции</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([dept, fns]) => (
            <div key={dept}>
              <div className="flex items-center gap-2 mb-3">
                <Icon name="Building2" size={15} className="text-slate-400" />
                <span className="text-sm font-semibold text-slate-600 uppercase tracking-wide">{dept}</span>
                <span className="text-xs text-muted-foreground">({fns.length})</span>
              </div>
              <div className="space-y-2">
                {fns.map(fn => {
                  const cat = CATEGORY_LABELS[fn.category] || { label: fn.category, color: "bg-slate-100 text-slate-600" };
                  const isOpen = expanded === fn.id;
                  return (
                    <div key={fn.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                        onClick={() => setExpanded(isOpen ? null : fn.id)}
                      >
                        <Icon name={isOpen ? "ChevronDown" : "ChevronRight"} size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="flex-1 font-medium text-sm text-slate-800">{fn.title}</span>
                        <Badge className={`text-xs ${cat.color} border-0 flex-shrink-0`}>{cat.label}</Badge>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3">
                          {fn.description && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Описание</p>
                              <p className="text-sm text-slate-700 leading-relaxed">{fn.description}</p>
                            </div>
                          )}
                          {fn.goals && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Цели</p>
                              <p className="text-sm text-slate-700 leading-relaxed">{fn.goals}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}