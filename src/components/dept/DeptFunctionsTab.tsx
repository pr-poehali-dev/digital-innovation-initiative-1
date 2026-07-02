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

type Props = {
  projectId: number;
  functions: DeptFunction[];
  onReload: () => void;
};

export default function DeptFunctionsTab({ projectId, functions, onReload }: Props) {
  const [uploading, setUploading] = useState(false);
  const [deptName, setDeptName] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newFunc, setNewFunc] = useState({ title: "", description: "", goals: "", category: "operational", dept_name: "" });
  const [saving, setSaving] = useState(false);
  const [ocrResult, setOcrResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setOcrResult(null);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const b64 = (e.target?.result as string).split(",")[1];
        const res = await deptFunctionsApi.extractFunctions({
          project_id: projectId,
          image_b64: b64,
          dept_name: deptName,
        }) as { ok: boolean; created: number; ocr_text?: string };
        if (res.ok) {
          setOcrResult(`Распознано и добавлено функций: ${res.created}`);
          onReload();
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
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
      {/* Загрузка скрина */}
      <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 bg-slate-50">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex-1">
            <p className="font-medium text-slate-800">Загрузить скрин положения о подразделении</p>
            <p className="text-sm text-muted-foreground mt-0.5">AI распознает текст и автоматически извлечёт функции и цели</p>
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
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="gap-2"
            >
              {uploading ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Upload" size={14} />}
              {uploading ? "Распознаю..." : "Загрузить скрин"}
            </Button>
          </div>
        </div>
        {ocrResult && (
          <div className="mt-3 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2">
            <Icon name="CheckCircle" size={14} />
            {ocrResult}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }} />
      </div>

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
      {functions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Icon name="ListTodo" size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Функции не добавлены</p>
          <p className="text-sm mt-1">Загрузи скрин положения — AI сам извлечёт все функции</p>
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
