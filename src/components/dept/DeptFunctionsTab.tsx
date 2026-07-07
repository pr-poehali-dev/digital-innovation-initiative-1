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

// source_id — внутренний стабильный идентификатор элемента очереди (не имя файла!),
// используется для замены/сборки draft. source_file — только человекочитаемое имя для UI,
// два разных файла с одинаковым именем НЕ должны конфликтовать между собой.
type DraftFunction = { title: string; description: string; goals: string; category: string; dept_name: string; checked: boolean; source_id?: string; source_file?: string };

type QueueFileStatus = "queued" | "processing" | "done" | "error";
type QueueFile = { id: string; file: File; status: QueueFileStatus; error?: string; foundCount?: number; extractedFunctions?: DraftFunction[] };

// Пересобирает draft в порядке файлов очереди (по внутреннему source_id, НЕ по имени файла —
// имена могут совпадать у разных файлов). Нужно, чтобы retry/дозагрузка не ломали порядок
// и не теряли правки пользователя в уже готовых функциях.
function buildOrderedDraft(items: DraftFunction[], queueSnapshot: QueueFile[]): DraftFunction[] {
  const orderIndex = new Map<string, number>();
  queueSnapshot.forEach((item, idx) => orderIndex.set(item.id, idx));
  return [...items].sort((a, b) => {
    const ia = a.source_id !== undefined ? orderIndex.get(a.source_id) ?? 9999 : 9999;
    const ib = b.source_id !== undefined ? orderIndex.get(b.source_id) ?? 9999 : 9999;
    return ia - ib;
  });
}

type LinkedProcess = {
  id: number;
  title: string;
  description: string;
  department: string;
  maturity_level: string;
  digital_maturity: string;
  ai_potential: string;
  step_count: number;
};

type ProcessOption = { id: number; title: string; department?: string };

type Props = {
  projectId: number;
  functions: DeptFunction[];
  loading?: boolean;
  onReload: () => void;
  allProcesses?: ProcessOption[];
  onNavigateToProcess?: (processId: number) => void;
};

export default function DeptFunctionsTab({ projectId, functions, loading = false, onReload, allProcesses = [], onNavigateToProcess }: Props) {
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

  // Multi-upload скриншотов: очередь файлов + обработка по одному через extract_functions
  const [queue, setQueue] = useState<QueueFile[] | null>(null);
  const [queueRunning, setQueueRunning] = useState(false);
  // Монотонный счётчик для генерации гарантированно уникального id элемента очереди —
  // защищает от коллизий при дозагрузке файлов с одинаковым именем в ту же миллисекунду.
  const queueIdCounter = useRef(0);

  // Связанные процессы: кэш по function_id + состояния формы привязки/создания
  const [processesByFunction, setProcessesByFunction] = useState<Record<number, LinkedProcess[] | undefined>>({});
  const [processesLoading, setProcessesLoading] = useState<Record<number, boolean>>({});
  const [linkFormOpen, setLinkFormOpen] = useState<number | null>(null);
  const [linkMode, setLinkMode] = useState<"existing" | "new">("existing");
  const [selectedProcessId, setSelectedProcessId] = useState("");
  const [newProcessTitle, setNewProcessTitle] = useState("");
  const [linking, setLinking] = useState(false);

  const loadFunctionProcesses = async (functionId: number) => {
    setProcessesLoading(p => ({ ...p, [functionId]: true }));
    try {
      const res = await deptFunctionsApi.getFunctionProcesses(projectId, functionId) as { ok: boolean; processes?: LinkedProcess[] };
      if (res.ok) setProcessesByFunction(p => ({ ...p, [functionId]: res.processes || [] }));
    } finally {
      setProcessesLoading(p => ({ ...p, [functionId]: false }));
    }
  };

  const toggleExpand = (functionId: number) => {
    const next = expanded === functionId ? null : functionId;
    setExpanded(next);
    if (next !== null && processesByFunction[next] === undefined) {
      loadFunctionProcesses(next);
    }
  };

  const handleLinkExisting = async (functionId: number) => {
    if (!selectedProcessId) return;
    setLinking(true);
    try {
      await deptFunctionsApi.linkProcess({ project_id: projectId, function_id: functionId, process_id: Number(selectedProcessId) });
      setSelectedProcessId("");
      setLinkFormOpen(null);
      loadFunctionProcesses(functionId);
    } finally {
      setLinking(false);
    }
  };

  const handleCreateAndLink = async (functionId: number) => {
    if (!newProcessTitle.trim()) return;
    setLinking(true);
    try {
      await deptFunctionsApi.createAndLinkProcess({ project_id: projectId, function_id: functionId, title: newProcessTitle.trim() });
      setNewProcessTitle("");
      setLinkFormOpen(null);
      loadFunctionProcesses(functionId);
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (functionId: number, processId: number) => {
    await deptFunctionsApi.unlinkProcess({ project_id: projectId, function_id: functionId, process_id: processId });
    loadFunctionProcesses(functionId);
  };

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

  // ── Multi-upload: выбор нескольких PNG/JPG за раз ──────────────
  // Если очередь уже существует (пользователь ранее что-то обработал) — новые файлы
  // добавляются в конец, а не заменяют её. Уже обработанные файлы, их статусы и уже
  // собранный/отредактированный draft при этом не трогаются.
  const handleMultiSelect = (files: FileList) => {
    const accepted: QueueFile[] = [];
    Array.from(files).forEach((file) => {
      const isImage = file.type.startsWith("image/") || /\.(png|jpe?g)$/i.test(file.name);
      if (isImage) {
        queueIdCounter.current += 1;
        accepted.push({ id: `qf_${queueIdCounter.current}_${Date.now()}`, file, status: "queued" });
      }
    });
    if (accepted.length === 0) {
      setOcrError("Выберите файлы в формате PNG или JPG");
      return;
    }
    setOcrError(null);
    setConfirmResult(null);
    setQueue(q => q ? [...q, ...accepted] : accepted);
  };

  const removeFromQueue = (id: string) => {
    setQueue(q => q ? q.filter(f => f.id !== id) : q);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve((e.target?.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Добавляет/заменяет функции конкретного файла в общем draft: сначала убирает старые
  // функции этого же файла по его внутреннему source_id (НЕ по имени — два файла могут
  // называться одинаково), затем добавляет свежие и пересобирает список в порядке очереди.
  // Так retry и дозагрузка никогда не создают дублей и не трогают функции других файлов
  // (в т.ч. правки пользователя в уже готовых).
  const addFunctionsToDraft = (sourceId: string, newFunctions: DraftFunction[], orderSnapshot: QueueFile[]) => {
    setDraft(d => {
      const base = d || [];
      const withoutSource = base.filter(f => f.source_id !== sourceId);
      const merged = [...withoutSource, ...newFunctions];
      return buildOrderedDraft(merged, orderSnapshot);
    });
  };

  // Обрабатывает один файл очереди: запрашивает OCR/AI, обновляет статус в queue и,
  // при успехе, кладёт результат в draft. Используется первым проходом, retry и дозагрузкой.
  // Возвращает true, если файл дал хотя бы одну функцию — нужно для итогового сообщения об ошибке.
  const processQueueFile = async (item: QueueFile, orderSnapshot: QueueFile[]): Promise<boolean> => {
    setQueue(q => q ? q.map(f => f.id === item.id ? { ...f, status: "processing" } : f) : q);
    try {
      const b64 = await fileToBase64(item.file);
      const res = await deptFunctionsApi.extractFunctions({
        project_id: projectId, image_b64: b64, dept_name: deptName,
      }) as { ok: boolean; functions?: Array<{ title: string; description: string; goals: string; category: string }>; error?: string };

      if (res.ok && res.functions) {
        const extracted = res.functions.map(f => ({ ...f, dept_name: deptName, checked: true, source_id: item.id, source_file: item.file.name }));
        setQueue(q => q ? q.map(f => f.id === item.id ? { ...f, status: "done", foundCount: extracted.length, extractedFunctions: extracted, error: undefined } : f) : q);
        addFunctionsToDraft(item.id, extracted, orderSnapshot);
        return extracted.length > 0;
      } else {
        setQueue(q => q ? q.map(f => f.id === item.id ? { ...f, status: "error", error: res.error || "Не удалось распознать" } : f) : q);
        return false;
      }
    } catch {
      setQueue(q => q ? q.map(f => f.id === item.id ? { ...f, status: "error", error: "Ошибка обработки файла" } : f) : q);
      return false;
    }
  };

  // Обрабатывает только файлы со статусом "queued" — используется и первым запуском,
  // и после дозагрузки новых файлов в уже существующую очередь (done/error не трогаются).
  const runQueue = async () => {
    if (!queue || queue.length === 0) return;
    const toProcess = queue.filter(f => f.status === "queued");
    if (toProcess.length === 0) return;
    setQueueRunning(true);
    const orderSnapshot = queue;
    let anyFound = false;

    for (const item of toProcess) {
      const found = await processQueueFile(item, orderSnapshot);
      anyFound = anyFound || found;
    }

    setQueueRunning(false);
    const stillEmpty = !anyFound && !queue.some(f => f.status === "done");
    if (stillEmpty) {
      setOcrError("AI не нашёл ни одной функции ни в одном из файлов. Попробуйте другие файлы или добавьте функции вручную.");
    }
  };

  // Повторная обработка только файлов со статусом "error" — успешные файлы (в т.ч. новые
  // дозагруженные) не трогаются, их функции в draft остаются как есть.
  const retryFailedFiles = async () => {
    if (!queue || queueRunning) return;
    const failed = queue.filter(f => f.status === "error");
    if (failed.length === 0) return;
    setQueueRunning(true);
    const orderSnapshot = queue;

    for (const item of failed) {
      await processQueueFile(item, orderSnapshot);
    }

    setQueueRunning(false);
  };

  const clearQueue = () => { setQueue(null); setDraft(null); };

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
        setQueue(null);
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
      {/* Загрузка положения о подразделении — DOCX или PDF с текстовым слоем */}
      <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 bg-slate-50">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex-1">
            <p className="font-medium text-slate-800">Загрузить положение о подразделении</p>
            <p className="text-sm text-muted-foreground mt-0.5">AI распознает текст и автоматически извлечёт функции и цели — скриншот, DOCX или PDF</p>
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
              onClick={() => fileRef.current?.click()}
              disabled={uploading || queueRunning}
              className="gap-2"
            >
              <Icon name="Images" size={14} />
              {queue ? "Добавить ещё скрины" : "Загрузить скрины"}
            </Button>
            <Button
              size="sm"
              onClick={() => docRef.current?.click()}
              disabled={uploading || !!queue}
              className="gap-2"
            >
              {uploading ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="FileText" size={14} />}
              {uploading ? "Распознаю..." : "Загрузить DOCX / PDF"}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <Icon name="Info" size={13} className="flex-shrink-0" />
          Можно выбрать сразу несколько скриншотов (PNG/JPG) — AI распознает каждый и соберёт все функции в один список. Файлы можно дозагружать в уже открытую очередь. PDF-скан без текстового слоя распознаётся, если в нём 1 страница.
        </p>
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
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => { if (e.target.files?.length) handleMultiSelect(e.target.files); e.target.value = ""; }} />
        <input ref={docRef} type="file" accept=".pdf,.docx" className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleDocSelect(e.target.files[0]); e.target.value = ""; }} />
      </div>

      {/* Очередь multi-upload: список выбранных скриншотов со статусами обработки */}
      {queue && (
        <div className="border border-blue-200 rounded-xl bg-blue-50/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Выбрано файлов: {queue.length}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {queueRunning
                  ? `Обрабатываю... (${queue.filter(f => f.status === "done" || f.status === "error").length}/${queue.length})`
                  : queue.some(f => f.status === "queued")
                    ? "Проверьте список и запустите распознавание"
                    : "Все файлы обработаны — можно дозагрузить ещё или подтвердить результат"}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={clearQueue} disabled={queueRunning} className="gap-1.5 flex-shrink-0">
              <Icon name="X" size={14} /> Очистить
            </Button>
          </div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {queue.map(item => (
              <div key={item.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                <Icon
                  name={
                    item.status === "queued" ? "Clock" :
                    item.status === "processing" ? "Loader2" :
                    item.status === "done" ? "CheckCircle2" : "AlertCircle"
                  }
                  size={14}
                  className={`flex-shrink-0 ${
                    item.status === "processing" ? "animate-spin text-blue-500" :
                    item.status === "done" ? "text-green-600" :
                    item.status === "error" ? "text-red-600" : "text-slate-400"
                  }`}
                />
                <span className="flex-1 text-sm text-slate-700 truncate">{item.file.name}</span>
                {item.status === "done" && <span className="text-xs text-green-700 flex-shrink-0">найдено: {item.foundCount}</span>}
                {item.status === "error" && <span className="text-xs text-red-600 flex-shrink-0">{item.error}</span>}
                {item.status === "queued" && !queueRunning && (
                  <button onClick={() => removeFromQueue(item.id)} className="text-slate-300 hover:text-red-600 flex-shrink-0">
                    <Icon name="X" size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            {(() => {
              const failedCount = queue.filter(f => f.status === "error").length;
              const hasQueued = queue.some(f => f.status === "queued");
              return (
                <>
                  {failedCount > 0 && (
                    <Button size="sm" variant="outline" onClick={retryFailedFiles} disabled={queueRunning} className="gap-1.5">
                      {queueRunning ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="RotateCw" size={14} />}
                      {queueRunning ? "Повторяю..." : `Повторить ошибки (${failedCount})`}
                    </Button>
                  )}
                  {hasQueued && (
                    <Button size="sm" onClick={runQueue} disabled={queueRunning || queue.length === 0} className="gap-1.5">
                      {queueRunning ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Play" size={14} />}
                      {queueRunning ? "Распознаю..." : `Распознать все (${queue.length})`}
                    </Button>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

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
                    {item.source_file && (
                      <p className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Icon name="Image" size={10} /> Источник: {item.source_file}
                      </p>
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
          <p className="text-sm mt-1">Загрузи положение — скриншот, DOCX или PDF — AI сам извлечёт все функции</p>
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
                        onClick={() => toggleExpand(fn.id)}
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

                          {/* Связанные процессы */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-xs font-medium text-muted-foreground">
                                Связанные процессы {processesByFunction[fn.id]?.length ? `(${processesByFunction[fn.id]!.length})` : ""}
                              </p>
                              <div className="flex gap-1">
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-6 px-2 text-xs gap-1"
                                  onClick={() => { setLinkFormOpen(linkFormOpen === fn.id ? null : fn.id); setLinkMode("existing"); setSelectedProcessId(""); setNewProcessTitle(""); }}
                                >
                                  <Icon name="Link2" size={12} /> Привязать
                                </Button>
                              </div>
                            </div>

                            {processesLoading[fn.id] ? (
                              <div className="h-8 bg-slate-50 rounded-lg animate-pulse" />
                            ) : !processesByFunction[fn.id] || processesByFunction[fn.id]!.length === 0 ? (
                              <p className="text-xs text-slate-400">Процессы пока не привязаны</p>
                            ) : (
                              <div className="space-y-1.5">
                                {processesByFunction[fn.id]!.map(proc => (
                                  <div key={proc.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                                    <Icon name="Workflow" size={12} className="text-slate-400 flex-shrink-0" />
                                    <button
                                      className="flex-1 text-left text-xs text-slate-700 hover:text-slate-900 hover:underline truncate"
                                      onClick={() => onNavigateToProcess?.(proc.id)}
                                    >
                                      {proc.title}
                                    </button>
                                    <span className="text-[10px] text-slate-400 flex-shrink-0">{proc.step_count} шагов</span>
                                    <button
                                      className="text-slate-300 hover:text-red-600 transition-colors flex-shrink-0"
                                      onClick={() => handleUnlink(fn.id, proc.id)}
                                      title="Отвязать процесс"
                                    >
                                      <Icon name="X" size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {linkFormOpen === fn.id && (
                              <div className="mt-2 border border-slate-200 rounded-lg p-2.5 bg-white space-y-2">
                                <div className="flex gap-1.5">
                                  <button
                                    className={`flex-1 text-xs rounded-md py-1.5 font-medium transition-colors ${linkMode === "existing" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
                                    onClick={() => setLinkMode("existing")}
                                  >
                                    Существующий
                                  </button>
                                  <button
                                    className={`flex-1 text-xs rounded-md py-1.5 font-medium transition-colors ${linkMode === "new" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
                                    onClick={() => setLinkMode("new")}
                                  >
                                    Создать новый
                                  </button>
                                </div>

                                {linkMode === "existing" ? (
                                  allProcesses.length === 0 ? (
                                    <p className="text-xs text-slate-400 py-1">В проекте пока нет ни одного процесса — создайте новый</p>
                                  ) : (
                                    <div className="flex gap-1.5">
                                      <select
                                        className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white min-w-0"
                                        value={selectedProcessId}
                                        onChange={e => setSelectedProcessId(e.target.value)}
                                      >
                                        <option value="">Выберите процесс...</option>
                                        {allProcesses
                                          .filter(p => !processesByFunction[fn.id]?.some(lp => lp.id === p.id))
                                          .map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                                      </select>
                                      <Button size="sm" disabled={!selectedProcessId || linking} onClick={() => handleLinkExisting(fn.id)} className="flex-shrink-0">
                                        {linking ? "..." : "Привязать"}
                                      </Button>
                                    </div>
                                  )
                                ) : (
                                  <div className="flex gap-1.5">
                                    <input
                                      className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs min-w-0"
                                      placeholder="Название нового процесса"
                                      value={newProcessTitle}
                                      onChange={e => setNewProcessTitle(e.target.value)}
                                    />
                                    <Button size="sm" disabled={!newProcessTitle.trim() || linking} onClick={() => handleCreateAndLink(fn.id)} className="flex-shrink-0">
                                      {linking ? "..." : "Создать"}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
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