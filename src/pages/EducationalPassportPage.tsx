import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { educationApi, fileToBase64 } from "@/lib/api";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";

interface EduFile {
  id: number;
  name: string;
  mime: string;
  size: number;
  parse_status: string;
  created_at: string;
}

interface EduItem {
  id: number;
  kind: string;
  title: string;
  issuer_name?: string;
  institution_name?: string;
  field_of_study?: string;
  level?: string;
  issued_at?: string;
  hours?: number;
  description?: string;
  status: string;
  study_status?: string;
  source_type: string;
  is_confirmed: boolean;
  topics: string[];
  competencies: string[];
  extracted_data?: Record<string, unknown>;
  files?: EduFile[];
  created_at: string;
}

const KIND_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  degree: { label: "Диплом", emoji: "🎓", color: "bg-purple-100 text-purple-700" },
  certificate: { label: "Сертификат", emoji: "📜", color: "bg-amber-100 text-amber-700" },
  course: { label: "Курс", emoji: "🎯", color: "bg-blue-100 text-blue-700" },
  program: { label: "Программа", emoji: "📚", color: "bg-indigo-100 text-indigo-700" },
  book: { label: "Книга", emoji: "📖", color: "bg-green-100 text-green-700" },
  lecture: { label: "Лекция", emoji: "🎤", color: "bg-rose-100 text-rose-700" },
  presentation: { label: "Презентация", emoji: "🖥", color: "bg-cyan-100 text-cyan-700" },
  methodology: { label: "Методичка", emoji: "📋", color: "bg-teal-100 text-teal-700" },
  notes: { label: "Конспект", emoji: "✍️", color: "bg-yellow-100 text-yellow-700" },
  article: { label: "Статья", emoji: "📰", color: "bg-orange-100 text-orange-700" },
  material: { label: "Материал", emoji: "📄", color: "bg-slate-100 text-slate-700" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Черновик", color: "bg-slate-100 text-slate-600" },
  processing: { label: "Обработка...", color: "bg-blue-100 text-blue-700" },
  needs_review: { label: "Требует проверки", color: "bg-amber-100 text-amber-700" },
  confirmed: { label: "Подтверждено", color: "bg-green-100 text-green-700" },
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Вручную",
  uploaded_file: "Из файла",
  ai_extracted: "AI извлёк",
};

const FORMAL_KINDS = ["degree", "certificate", "course", "program"];
const MATERIAL_KINDS = ["book", "lecture", "presentation", "methodology", "notes", "article", "material"];

export default function EducationalPassportPage() {
  const [items, setItems] = useState<EduItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [showCreate, setShowCreate] = useState<null | "formal" | "material">(null);
  const [createKind, setCreateKind] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createIssuer, setCreateIssuer] = useState("");
  const [createField, setCreateField] = useState("");
  const [createIssuedAt, setCreateIssuedAt] = useState("");
  const [createHours, setCreateHours] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createStudyStatus, setCreateStudyStatus] = useState("uploaded_only");
  const [creating, setCreating] = useState(false);
  const [createPendingFile, setCreatePendingFile] = useState<File | null>(null);

  const [confirmItem, setConfirmItem] = useState<EduItem | null>(null);
  const [detailItem, setDetailItem] = useState<EduItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fileUrlLoading, setFileUrlLoading] = useState<number | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editIssuer, setEditIssuer] = useState("");
  const [editField, setEditField] = useState("");
  const [editIssuedAt, setEditIssuedAt] = useState("");
  const [editHours, setEditHours] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPendingFile, setEditPendingFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    educationApi.list(kindFilter, statusFilter)
      .then((d) => setItems(d.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load();   }, [kindFilter, statusFilter]);

  const resetCreate = () => {
    setShowCreate(null);
    setCreateKind("");
    setCreateTitle("");
    setCreateIssuer("");
    setCreateField("");
    setCreateIssuedAt("");
    setCreateHours("");
    setCreateDesc("");
    setCreateStudyStatus("uploaded_only");
    setCreatePendingFile(null);
  };

  const handleCreate = async () => {
    if (!createKind || !createTitle.trim()) {
      alert("Заполните тип и название");
      return;
    }
    setCreating(true);
    try {
      const isFormal = FORMAL_KINDS.includes(createKind);
      const payload: Record<string, unknown> = {
        kind: createKind,
        title: createTitle.trim(),
        issuer_name: createIssuer.trim() || undefined,
        institution_name: createIssuer.trim() || undefined,
        field_of_study: createField.trim() || undefined,
        issued_at: createIssuedAt || undefined,
        hours: createHours ? Number(createHours) : undefined,
        description: createDesc.trim() || undefined,
      };
      if (!isFormal) {
        payload.study_status = createStudyStatus;
      }
      const newItem = await educationApi.create(payload);

      if (createPendingFile) {
        const fileData = await fileToBase64(createPendingFile);
        const uploadResult = await educationApi.uploadFile(
          newItem.id,
          createPendingFile.name,
          createPendingFile.type || "application/octet-stream",
          fileData,
        );
        if (uploadResult.warning) {
          alert("⚠️ " + uploadResult.warning);
        }
      }

      resetCreate();
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (id: number) => {
    if (!confirm("Удалить запись из паспорта? Восстановить можно через поддержку.")) return;
    try {
      await educationApi.archive(id);
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const openDetail = async (item: EduItem) => {
    setEditMode(false);
    setDetailItem(item);
    setDetailLoading(true);
    try {
      const full = await educationApi.get(item.id);
      setDetailItem(full);
    } catch {
      // оставляем базовые данные
    } finally {
      setDetailLoading(false);
    }
  };

  const startEdit = (item: EduItem) => {
    setEditTitle(item.title);
    setEditIssuer(item.institution_name || item.issuer_name || "");
    setEditField(item.field_of_study || "");
    setEditIssuedAt(item.issued_at ? item.issued_at.slice(0, 10) : "");
    setEditHours(item.hours ? String(item.hours) : "");
    setEditDesc(item.description || "");
    setEditPendingFile(null);
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!detailItem) return;
    setSaving(true);
    try {
      await educationApi.update(detailItem.id, {
        title: editTitle.trim(),
        institution_name: editIssuer.trim() || undefined,
        issuer_name: editIssuer.trim() || undefined,
        field_of_study: editField.trim() || undefined,
        issued_at: editIssuedAt || undefined,
        hours: editHours ? Number(editHours) : undefined,
        description: editDesc.trim() || undefined,
      });
      if (editPendingFile) {
        const fileData = await fileToBase64(editPendingFile);
        const uploadResult = await educationApi.uploadFile(
          detailItem.id,
          editPendingFile.name,
          editPendingFile.type || "application/octet-stream",
          fileData,
        );
        if (uploadResult.warning) alert("⚠️ " + uploadResult.warning);
      }
      const updated = await educationApi.get(detailItem.id);
      setDetailItem(updated);
      setEditMode(false);
      setEditPendingFile(null);
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const openConfirmModal = async (item: EduItem) => {
    try {
      const full = await educationApi.get(item.id);
      setConfirmItem(full);
    } catch {
      setConfirmItem(item);
    }
  };

  const openFile = async (file: EduFile) => {
    setFileUrlLoading(file.id);
    try {
      const res = await educationApi.getFileUrl(file.id);
      window.open(res.url, "_blank", "noopener");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Не удалось получить ссылку на файл");
    } finally {
      setFileUrlLoading(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link to="/cabinet" className="hover:text-foreground">Кабинет</Link>
          <Icon name="ChevronRight" size={14} />
          <span className="text-foreground font-medium">Паспорт образования</span>
        </div>

        <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">📜 Паспорт образования</h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
              Добавьте дипломы, сертификаты и материалы, которые вы изучали. Система будет учитывать это
              в образовательном профиле и при построении целей.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreate("formal")}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Icon name="GraduationCap" size={16} />
              Добавить документ
            </button>
            <button
              onClick={() => setShowCreate("material")}
              className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Icon name="BookOpen" size={16} />
              Добавить материал
            </button>
          </div>
        </div>

        {/* Фильтры */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { v: "all", l: "Все" },
            { v: "formal", l: "📜 Документы" },
            { v: "material", l: "📚 Материалы" },
          ].map((f) => (
            <button
              key={f.v}
              onClick={() => setKindFilter(f.v)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                kindFilter === f.v ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {f.l}
            </button>
          ))}
          <div className="w-px bg-slate-200 mx-1" />
          {[
            { v: "all", l: "Любой статус" },
            { v: "confirmed", l: "✅ Подтверждено" },
            { v: "needs_review", l: "⚠️ Требует проверки" },
          ].map((f) => (
            <button
              key={f.v}
              onClick={() => setStatusFilter(f.v)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                statusFilter === f.v ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>

        {/* Список */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Icon name="GraduationCap" size={28} className="text-slate-500" />
            </div>
            <p className="font-medium text-foreground mb-1">Паспорт пока пустой</p>
            <p className="text-sm text-muted-foreground mb-4">Добавьте свои дипломы, сертификаты или учебные материалы</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const kind = KIND_LABELS[item.kind] || KIND_LABELS.material;
              const status = STATUS_LABELS[item.status] || STATUS_LABELS.draft;
              return (
                <div
                  key={item.id}
                  className="border border-slate-200 rounded-xl p-4 bg-card hover:shadow-sm hover:border-slate-300 transition-all cursor-pointer"
                  onClick={() => openDetail(item)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${kind.color}`}>
                      {kind.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${kind.color}`}>{kind.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>{status.label}</span>
                        <span className="text-xs text-slate-400">{SOURCE_LABELS[item.source_type] || item.source_type}</span>
                        {item.is_confirmed && <span className="text-xs text-green-600">✓ подтверждено</span>}
                      </div>
                      <p className="text-sm font-semibold mb-0.5">{item.title}</p>
                      {(item.institution_name || item.issuer_name) && (
                        <p className="text-xs text-muted-foreground">{item.institution_name || item.issuer_name}</p>
                      )}
                      {item.field_of_study && (
                        <p className="text-xs text-muted-foreground">Направление: {item.field_of_study}</p>
                      )}
                      {item.issued_at && (
                        <p className="text-xs text-muted-foreground">Выдан: {new Date(item.issued_at).toLocaleDateString("ru-RU")}</p>
                      )}
                      {item.topics && item.topics.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {item.topics.slice(0, 5).map((t, i) => (
                            <span key={i} className="text-xs bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                              {t}
                            </span>
                          ))}
                          {item.topics.length > 5 && (
                            <span className="text-xs text-slate-400">+{item.topics.length - 5}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {item.status === "needs_review" && (
                        <button
                          onClick={() => openConfirmModal(item)}
                          className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium"
                        >
                          ⚠️ Проверить
                        </button>
                      )}
                      <button
                        onClick={() => openDetail(item)}
                        className="text-xs text-slate-500 hover:text-slate-900 border border-slate-200 hover:border-slate-400 px-2 py-1 rounded-lg"
                      >
                        Открыть
                      </button>
                      <button
                        onClick={() => handleArchive(item.id)}
                        className="text-xs text-slate-400 hover:text-red-600 p-1"
                        title="Удалить"
                      >
                        <Icon name="Trash2" size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Детальная карточка записи — боковая панель */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-end z-50" onClick={() => setDetailItem(null)}>
          <div
            className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl flex-shrink-0">{(KIND_LABELS[detailItem.kind] || KIND_LABELS.material).emoji}</span>
                <span className="font-semibold truncate">{editMode ? "Редактирование" : detailItem.title}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!editMode && !detailLoading && (
                  <button onClick={() => startEdit(detailItem)} className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-400 rounded-lg px-2.5 py-1.5 transition-colors">
                    <Icon name="Pencil" size={13} />
                    Изменить
                  </button>
                )}
                <button onClick={() => { setDetailItem(null); setEditMode(false); }} className="text-slate-400 hover:text-slate-700">
                  <Icon name="X" size={20} />
                </button>
              </div>
            </div>

            {detailLoading && (
              <div className="p-5 space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}
              </div>
            )}

            {!detailLoading && editMode && (
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Название *</label>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Учреждение / организация</label>
                  <input value={editIssuer} onChange={e => setEditIssuer(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Направление / специальность</label>
                  <input value={editField} onChange={e => setEditField(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 block mb-1">Дата выдачи</label>
                    <input type="date" value={editIssuedAt} onChange={e => setEditIssuedAt(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                  </div>
                  <div className="w-28">
                    <label className="text-xs text-slate-500 block mb-1">Часы (необязательно)</label>
                    <input type="number" value={editHours} onChange={e => setEditHours(e.target.value)} placeholder="0"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Описание / что изучал</label>
                  <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none" />
                </div>
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1">📎 Прикрепить файл для AI-анализа</p>
                  <p className="text-xs text-slate-400 mb-2">PDF, DOCX — извлечение текста · JPG, PNG — OCR скана</p>
                  <input type="file" accept=".pdf,.docx,.pptx,.txt,.jpg,.jpeg,.png,.webp"
                    onChange={e => setEditPendingFile(e.target.files?.[0] || null)}
                    className="text-xs w-full" />
                  {editPendingFile && (
                    <p className="text-xs text-slate-700 mt-1.5">Выбран: <strong>{editPendingFile.name}</strong></p>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={handleSaveEdit} disabled={saving || !editTitle.trim()}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg py-2 text-sm font-medium transition-colors">
                    {saving ? (editPendingFile ? "Загружаю файл..." : "Сохраняю...") : "Сохранить"}
                  </button>
                  <button onClick={() => setEditMode(false)}
                    className="border border-slate-200 hover:border-slate-400 text-slate-600 rounded-lg px-4 py-2 text-sm transition-colors">
                    Отмена
                  </button>
                </div>
              </div>
            )}

            {!detailLoading && !editMode && (
              <div className="p-5 space-y-5">
                {/* Статус и тип */}
                <div className="flex flex-wrap gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(KIND_LABELS[detailItem.kind] || KIND_LABELS.material).color}`}>
                    {(KIND_LABELS[detailItem.kind] || KIND_LABELS.material).label}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(STATUS_LABELS[detailItem.status] || STATUS_LABELS.draft).color}`}>
                    {(STATUS_LABELS[detailItem.status] || STATUS_LABELS.draft).label}
                  </span>
                  {detailItem.is_confirmed && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">✓ Подтверждено</span>
                  )}
                </div>

                {/* Основные поля */}
                <div className="space-y-2">
                  {(detailItem.institution_name || detailItem.issuer_name) && (
                    <div>
                      <p className="text-xs text-slate-500">Учреждение / организация</p>
                      <p className="text-sm font-medium">{detailItem.institution_name || detailItem.issuer_name}</p>
                    </div>
                  )}
                  {detailItem.field_of_study && (
                    <div>
                      <p className="text-xs text-slate-500">Направление / специальность</p>
                      <p className="text-sm">{detailItem.field_of_study}</p>
                    </div>
                  )}
                  {detailItem.level && (
                    <div>
                      <p className="text-xs text-slate-500">Уровень</p>
                      <p className="text-sm">{detailItem.level}</p>
                    </div>
                  )}
                  {detailItem.issued_at && (
                    <div>
                      <p className="text-xs text-slate-500">Дата выдачи</p>
                      <p className="text-sm">{new Date(detailItem.issued_at).toLocaleDateString("ru-RU")}</p>
                    </div>
                  )}
                  {detailItem.hours && (
                    <div>
                      <p className="text-xs text-slate-500">Объём (часы)</p>
                      <p className="text-sm">{detailItem.hours} ч.</p>
                    </div>
                  )}
                  {detailItem.description && (
                    <div>
                      <p className="text-xs text-slate-500">Описание</p>
                      <p className="text-sm text-slate-700">{detailItem.description}</p>
                    </div>
                  )}
                  {detailItem.study_status && (
                    <div>
                      <p className="text-xs text-slate-500">Статус изучения</p>
                      <p className="text-sm">{({"uploaded_only": "Только загружен", "started": "Начал изучать", "partial": "Частично изучено", "studied": "Изучено", "applied": "Применял в работе"} as Record<string,string>)[detailItem.study_status] || detailItem.study_status}</p>
                    </div>
                  )}
                </div>

                {/* Темы */}
                {detailItem.topics && detailItem.topics.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Темы (AI извлёк)</p>
                    <div className="flex flex-wrap gap-1">
                      {detailItem.topics.map((t, i) => (
                        <span key={i} className="text-xs bg-slate-50 border border-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Компетенции */}
                {detailItem.competencies && detailItem.competencies.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Предполагаемые компетенции</p>
                    <ul className="space-y-1">
                      {detailItem.competencies.map((c, i) => (
                        <li key={i} className="text-xs text-slate-700 flex items-start gap-1"><span className="text-slate-400 mt-0.5">▸</span>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Прикреплённые файлы */}
                {detailItem.files && detailItem.files.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Прикреплённые файлы</p>
                    <div className="space-y-2">
                      {detailItem.files.map((f) => (
                        <div key={f.id} className="flex items-center gap-2 border border-slate-200 rounded-lg p-2">
                          <Icon name="FileText" size={16} className="text-slate-400 flex-shrink-0" />
                          <span className="text-xs flex-1 truncate">{f.name}</span>
                          <span className="text-xs text-slate-400">{(f.size / 1024).toFixed(0)} КБ</span>
                          <button
                            onClick={() => openFile(f)}
                            disabled={fileUrlLoading === f.id}
                            className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-2 py-1 rounded-md disabled:opacity-50 flex-shrink-0"
                          >
                            {fileUrlLoading === f.id ? "..." : "Открыть"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Кнопки действий */}
                <div className="flex gap-2 pt-2">
                  {detailItem.status === "needs_review" && (
                    <button
                      onClick={() => { setDetailItem(null); openConfirmModal(detailItem); }}
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg py-2 text-sm font-medium"
                    >
                      ⚠️ Проверить AI-извлечение
                    </button>
                  )}
                  <button
                    onClick={() => handleArchive(detailItem.id)}
                    className="border border-slate-200 hover:border-red-300 text-slate-500 hover:text-red-600 rounded-lg px-3 py-2 text-sm"
                  >
                    <Icon name="Trash2" size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Модалка создания */}
      {showCreate && (
        <CreateModal
          mode={showCreate}
          createKind={createKind}
          setCreateKind={setCreateKind}
          createTitle={createTitle}
          setCreateTitle={setCreateTitle}
          createIssuer={createIssuer}
          setCreateIssuer={setCreateIssuer}
          createField={createField}
          setCreateField={setCreateField}
          createIssuedAt={createIssuedAt}
          setCreateIssuedAt={setCreateIssuedAt}
          createHours={createHours}
          setCreateHours={setCreateHours}
          createDesc={createDesc}
          setCreateDesc={setCreateDesc}
          createStudyStatus={createStudyStatus}
          setCreateStudyStatus={setCreateStudyStatus}
          createPendingFile={createPendingFile}
          setCreatePendingFile={setCreatePendingFile}
          creating={creating}
          onSubmit={handleCreate}
          onClose={resetCreate}
        />
      )}

      {/* Модалка подтверждения AI-извлечения */}
      {confirmItem && (
        <ConfirmModal
          item={confirmItem}
          onClose={() => setConfirmItem(null)}
          onConfirmed={() => { setConfirmItem(null); load(); }}
        />
      )}
    </Layout>
  );
}


function CreateModal(props: {
  mode: "formal" | "material";
  createKind: string; setCreateKind: (v: string) => void;
  createTitle: string; setCreateTitle: (v: string) => void;
  createIssuer: string; setCreateIssuer: (v: string) => void;
  createField: string; setCreateField: (v: string) => void;
  createIssuedAt: string; setCreateIssuedAt: (v: string) => void;
  createHours: string; setCreateHours: (v: string) => void;
  createDesc: string; setCreateDesc: (v: string) => void;
  createStudyStatus: string; setCreateStudyStatus: (v: string) => void;
  createPendingFile: File | null; setCreatePendingFile: (f: File | null) => void;
  creating: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const kinds = props.mode === "formal" ? FORMAL_KINDS : MATERIAL_KINDS;
  const title = props.mode === "formal" ? "Добавить документ об образовании" : "Добавить учебный материал";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 py-8 overflow-y-auto">
      <div className="bg-white border rounded-2xl p-6 w-full max-w-lg shadow-xl my-auto">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Тип *</label>
            <select
              value={props.createKind}
              onChange={(e) => props.setCreateKind(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— выберите —</option>
              {kinds.map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]?.emoji} {KIND_LABELS[k]?.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Название *</label>
            <input
              value={props.createTitle}
              onChange={(e) => props.setCreateTitle(e.target.value)}
              placeholder={props.mode === "formal" ? "Например: Магистр менеджмента" : "Например: Книга «Управление проектами»"}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              {props.mode === "formal" ? "Учреждение / платформа" : "Автор / источник"}
            </label>
            <input
              value={props.createIssuer}
              onChange={(e) => props.setCreateIssuer(e.target.value)}
              placeholder={props.mode === "formal" ? "Например: МГУ / Coursera / Stepik" : "Например: Том ДеМарко"}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>

          {props.mode === "formal" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Направление</label>
                  <input
                    value={props.createField}
                    onChange={(e) => props.setCreateField(e.target.value)}
                    placeholder="Менеджмент"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Дата выдачи</label>
                  <input
                    type="date"
                    value={props.createIssuedAt}
                    onChange={(e) => props.setCreateIssuedAt(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Часы (необязательно)</label>
                <input
                  type="number"
                  value={props.createHours}
                  onChange={(e) => props.setCreateHours(e.target.value)}
                  placeholder="72"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                />
              </div>
            </>
          )}

          {props.mode === "material" && (
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Статус изучения</label>
              <select
                value={props.createStudyStatus}
                onChange={(e) => props.setCreateStudyStatus(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="uploaded_only">Только загрузил</option>
                <option value="started">Начал изучать</option>
                <option value="partial">Изучено частично</option>
                <option value="studied">Изучено</option>
                <option value="applied">Использовал в работе</option>
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Описание / что изучал</label>
            <textarea
              value={props.createDesc}
              onChange={(e) => props.setCreateDesc(e.target.value)}
              rows={2}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white resize-none"
            />
          </div>

          {/* Файл (опционально, запустит AI-анализ) */}
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-700 mb-2">📎 Прикрепить файл (опционально)</p>
            <p className="text-xs text-slate-500 mb-2">
              PDF, DOCX, PPTX, TXT — извлечение текста.<br />
              JPG, PNG — для сканов дипломов (OCR через Yandex Vision)
            </p>
            <input
              type="file"
              accept=".pdf,.docx,.pptx,.txt,.jpg,.jpeg,.png,.webp"
              onChange={(e) => props.setCreatePendingFile(e.target.files?.[0] || null)}
              className="text-xs"
            />
            {props.createPendingFile && (
              <p className="text-xs text-slate-700 mt-2">Выбран: <strong>{props.createPendingFile.name}</strong></p>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-5 mt-2">
          <button onClick={props.onClose} className="flex-1 border border-slate-300 rounded-lg py-2 text-sm font-medium hover:bg-slate-50">
            Отмена
          </button>
          <button
            onClick={props.onSubmit}
            disabled={props.creating || !props.createKind || !props.createTitle.trim()}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
          >
            {props.creating ? "Создаю..." : (props.createPendingFile ? "Создать и проанализировать" : "Создать")}
          </button>
        </div>
      </div>
    </div>
  );
}


function ConfirmModal(props: { item: EduItem & { extracted_data?: Record<string, unknown> }; onClose: () => void; onConfirmed: () => void }) {
  const [title, setTitle] = useState(props.item.title || "");
  const [institution, setInstitution] = useState(props.item.institution_name || "");
  const [field, setField] = useState(props.item.field_of_study || "");
  const [level, setLevel] = useState(props.item.level || "");
  const [topics, setTopics] = useState<string[]>(props.item.topics || []);
  const [competencies, setCompetencies] = useState<string[]>(props.item.competencies || []);
  const [studyStatus, setStudyStatus] = useState(props.item.study_status || "");
  const [saving, setSaving] = useState(false);
  const isMaterial = MATERIAL_KINDS.includes(props.item.kind);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await educationApi.confirm(props.item.id, {
        title, institution_name: institution, field_of_study: field, level,
        topics, competencies,
        study_status: isMaterial ? studyStatus : undefined,
      });
      props.onConfirmed();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 py-8 overflow-y-auto">
      <div className="bg-white border rounded-2xl p-6 w-full max-w-xl shadow-xl my-auto">
        <h2 className="text-lg font-semibold mb-1">🤖 Проверка AI-извлечения</h2>
        <p className="text-xs text-slate-500 mb-4">
          AI распознал данные из файла. Проверьте и при необходимости поправьте — мы храним и то что извлёк AI, и что подтвердили вы.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Название</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Учреждение / источник</label>
            <input value={institution} onChange={(e) => setInstitution(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Направление</label>
              <input value={field} onChange={(e) => setField(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Уровень</label>
              <input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="bachelor / online / ..." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
            </div>
          </div>

          {isMaterial && (
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Статус изучения</label>
              <select value={studyStatus} onChange={(e) => setStudyStatus(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="uploaded_only">Только загрузил</option>
                <option value="started">Начал изучать</option>
                <option value="partial">Изучено частично</option>
                <option value="studied">Изучено</option>
                <option value="applied">Использовал в работе</option>
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Темы (AI извлёк) — отредактируйте если что-то лишнее
            </label>
            <textarea
              value={topics.join(", ")}
              onChange={(e) => setTopics(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              rows={2}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              {isMaterial ? "Компетенции которые материал ПОКРЫВАЕТ" : "Компетенции (предположение AI)"}
            </label>
            <textarea
              value={competencies.join(", ")}
              onChange={(e) => setCompetencies(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              rows={2}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white resize-none"
            />
            {isMaterial && (
              <p className="text-xs text-slate-500 mt-1">
                ⚠️ AI указал темы, которые материал затрагивает. Это НЕ значит, что вы их освоили.
              </p>
            )}
          </div>

          {/* Debug — сырой ответ AI (для приёмки и отладки) */}
          {props.item.extracted_data && (
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-700 select-none">
                🔍 Показать сырой JSON от AI (для отладки)
              </summary>
              <pre className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded text-[10px] overflow-x-auto">
{JSON.stringify(props.item.extracted_data, null, 2)}
              </pre>
            </details>
          )}
        </div>

        <div className="flex gap-2 pt-5">
          <button onClick={props.onClose} className="flex-1 border border-slate-300 rounded-lg py-2 text-sm font-medium hover:bg-slate-50">
            Отмена
          </button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
            {saving ? "Сохраняю..." : "Подтвердить"}
          </button>
        </div>
      </div>
    </div>
  );
}