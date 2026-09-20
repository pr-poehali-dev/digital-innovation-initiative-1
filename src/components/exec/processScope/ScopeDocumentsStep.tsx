import { useState } from "react";
import Icon from "@/components/ui/icon";
import { TextField, TextArea, SelectField, DateField, Modal } from "@/components/exec/ExecForm";
import {
  CONFIDENTIALITY_LABEL,
  DOC_STATE_LABEL,
  ScopeDocument,
  ScopeUnit,
  ScopeRefs,
  fileToBase64,
  downloadBase64File,
  processScopeApi,
} from "@/lib/execProcessScopeApi";

const ACCEPT = ".pdf,.docx,.doc,.rtf,.txt";
const MAX_SIZE = 20 * 1024 * 1024;

function UploadForm({
  scopeId,
  refs,
  units,
  onClose,
  onUploaded,
}: {
  scopeId: number;
  refs: ScopeRefs;
  units: ScopeUnit[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState("block_regulation");
  const [orgUnitId, setOrgUnitId] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [state, setState] = useState("active");
  const [confidentiality, setConfidentiality] = useState("internal");
  const [versionLabel, setVersionLabel] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    const ext = chosen.name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "docx", "doc", "rtf", "txt"].includes(ext)) {
      setError("Поддерживаются PDF, DOCX, DOC, RTF, TXT");
      return;
    }
    if (chosen.size > MAX_SIZE) {
      setError("Файл больше 20 МБ");
      return;
    }
    setError("");
    setFile(chosen);
    if (!title.trim()) setTitle(chosen.name.replace(/\.[^.]+$/, ""));
  };

  const save = async () => {
    if (!file) {
      setError("Выберите файл");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const b64 = await fileToBase64(file);
      await processScopeApi.uploadDocument({
        scope_id: scopeId,
        filename: file.name,
        file_data: b64,
        title: title.trim() || file.name,
        source_type: sourceType,
        org_unit_id: orgUnitId ? Number(orgUnitId) : null,
        doc_number: docNumber.trim() || undefined,
        doc_date: docDate || undefined,
        valid_from: validFrom || undefined,
        state,
        confidentiality_level: confidentiality,
        version_label: versionLabel.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      onUploaded();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Загрузить документ"
      subtitle="Файл сохраняется как есть — текст не извлекается, ИИ не вызывается"
      onClose={onClose}
      onSave={save}
      saving={saving}
      saveLabel="Загрузить"
      canSave={!!file}
      error={error}
      wide
    >
      <div>
        <span className="text-xs text-slate-500 mb-1.5 block">
          Файл <span className="text-violet-600">*</span>
        </span>
        <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 cursor-pointer hover:border-violet-400 transition-colors text-sm text-slate-500">
          <Icon name="Upload" size={15} />
          {file ? file.name : "Выбрать файл (PDF, DOCX, DOC, RTF, TXT, до 20 МБ)"}
          <input type="file" accept={ACCEPT} onChange={pickFile} className="hidden" />
        </label>
      </div>

      <TextField label="Название документа" value={title} onChange={setTitle} required
        placeholder="Например: Положение о Блоке внутреннего контроля" />

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Вид документа"
          value={sourceType}
          onChange={setSourceType}
          required
          options={Object.entries(refs.source_types).map(([v, l]) => ({ value: v, label: l }))}
        />
        <SelectField
          label="Подразделение"
          value={orgUnitId}
          onChange={setOrgUnitId}
          placeholder="относится к Блоку ВК целиком"
          options={units.filter((u) => u.decision === "included").map((u) => ({
            value: String(u.org_unit_id),
            label: u.name,
          }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField label="Номер документа" value={docNumber} onChange={setDocNumber} placeholder="№ 123-П" />
        <TextField label="Версия" value={versionLabel} onChange={setVersionLabel} placeholder="напр. ред. 3" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DateField label="Дата документа" value={docDate} onChange={setDocDate} />
        <DateField label="Дата вступления в силу" value={validFrom} onChange={setValidFrom} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Статус действия"
          value={state}
          onChange={setState}
          required
          options={Object.entries(refs.states).map(([v, l]) => ({ value: v, label: l }))}
        />
        <SelectField
          label="Уровень конфиденциальности"
          value={confidentiality}
          onChange={setConfidentiality}
          required
          options={Object.entries(refs.confidentiality_levels).map(([v, l]) => ({ value: v, label: l }))}
          hint="Определяет, кто сможет скачать файл"
        />
      </div>

      <TextArea label="Комментарий" value={comment} onChange={setComment} rows={2} />
    </Modal>
  );
}

function EditMetaModal({
  doc,
  refs,
  units,
  onClose,
  onSaved,
}: {
  doc: ScopeDocument;
  refs: ScopeRefs;
  units: ScopeUnit[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [sourceType, setSourceType] = useState(doc.source_type);
  const [orgUnitId, setOrgUnitId] = useState(doc.org_unit_id ? String(doc.org_unit_id) : "");
  const [docNumber, setDocNumber] = useState(doc.doc_number || "");
  const [docDate, setDocDate] = useState(doc.doc_date || "");
  const [validFrom, setValidFrom] = useState(doc.valid_from || "");
  const [state, setState] = useState(doc.state);
  const [confidentiality, setConfidentiality] = useState(doc.confidentiality_level);
  const [versionLabel, setVersionLabel] = useState(doc.version_label || "");
  const [comment, setComment] = useState(doc.comment || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await processScopeApi.saveDocumentMeta({
        id: doc.id,
        title: title.trim(),
        source_type: sourceType,
        org_unit_id: orgUnitId ? Number(orgUnitId) : null,
        doc_number: docNumber.trim() || null,
        doc_date: docDate || null,
        valid_from: validFrom || null,
        state,
        confidentiality_level: confidentiality,
        version_label: versionLabel.trim() || null,
        comment: comment.trim() || null,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Метаданные документа" onClose={onClose} onSave={save} saving={saving} error={error} wide>
      <TextField label="Название" value={title} onChange={setTitle} required />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Вид документа" value={sourceType} onChange={setSourceType}
          options={Object.entries(refs.source_types).map(([v, l]) => ({ value: v, label: l }))} />
        <SelectField label="Подразделение" value={orgUnitId} onChange={setOrgUnitId}
          placeholder="Блок ВК целиком"
          options={units.filter((u) => u.decision === "included").map((u) => ({ value: String(u.org_unit_id), label: u.name }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Номер" value={docNumber} onChange={setDocNumber} />
        <TextField label="Версия" value={versionLabel} onChange={setVersionLabel} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Дата документа" value={docDate} onChange={setDocDate} />
        <DateField label="Дата вступления в силу" value={validFrom} onChange={setValidFrom} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Статус действия" value={state} onChange={setState}
          options={Object.entries(refs.states).map(([v, l]) => ({ value: v, label: l }))} />
        <SelectField label="Конфиденциальность" value={confidentiality} onChange={setConfidentiality}
          options={Object.entries(refs.confidentiality_levels).map(([v, l]) => ({ value: v, label: l }))} />
      </div>
      <TextArea label="Комментарий" value={comment} onChange={setComment} rows={2} />
    </Modal>
  );
}

function DocRow({
  doc,
  refs,
  units,
  readOnly,
  onChanged,
}: {
  doc: ScopeDocument;
  refs: ScopeRefs;
  units: ScopeUnit[];
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const conf = CONFIDENTIALITY_LABEL[doc.confidentiality_level] || CONFIDENTIALITY_LABEL.internal;
  const st = DOC_STATE_LABEL[doc.state] || DOC_STATE_LABEL.draft;

  const toggleCurrent = async () => {
    setBusy(true);
    setError("");
    try {
      await processScopeApi.markCurrentVersion(doc.id, !doc.is_current_version);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmActual = async () => {
    setBusy(true);
    try {
      await processScopeApi.confirmDocumentActual(doc.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await processScopeApi.downloadDocument(doc.id);
      downloadBase64File(res.file_data, res.filename, res.mime);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!confirm(`Отменить действие документа «${doc.title}»?`)) return;
    setBusy(true);
    try {
      await processScopeApi.archiveDocument(doc.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-slate-900">{doc.title}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${st.cls}`}>{st.title}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${conf.cls}`}>{conf.title}</span>
            {doc.is_current_version && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200">
                действующая версия
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {refs.source_types[doc.source_type] || doc.source_type}
            {doc.org_unit_name ? ` · ${doc.org_unit_name}` : " · Блок ВК целиком"}
            {doc.doc_number ? ` · № ${doc.doc_number}` : ""}
            {doc.doc_date ? ` · от ${doc.doc_date}` : ""}
            {doc.version_label ? ` · ${doc.version_label}` : ""}
          </p>
          {doc.confirmed_actual_by ? (
            <p className="text-[11px] text-green-600 mt-1 flex items-center gap-1">
              <Icon name="BadgeCheck" size={12} />
              Актуальность подтвердил: {doc.confirmed_actual_by}
            </p>
          ) : (
            <p className="text-[11px] text-amber-600 mt-1">Актуальность ещё не подтверждена вручную</p>
          )}
          {!doc.has_file && (
            <p className="text-[11px] text-slate-400 mt-1">Без прикреплённого файла</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {doc.has_file && (
            <button onClick={download} disabled={busy}
              className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:border-slate-400 transition-colors disabled:opacity-50 flex items-center gap-1">
              <Icon name="Download" size={12} />
              Скачать
            </button>
          )}
          {!readOnly && (
            <>
              <button onClick={() => setEditOpen(true)} disabled={busy}
                className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:border-slate-400 transition-colors disabled:opacity-50">
                Изменить
              </button>
              <button onClick={toggleCurrent} disabled={busy}
                className={`text-xs px-2 py-1 rounded-md border transition-colors disabled:opacity-50 ${
                  doc.is_current_version
                    ? "border-violet-300 text-violet-700 hover:bg-violet-50"
                    : "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700"
                }`}>
                {doc.is_current_version ? "Снять отметку" : "Отметить действующей"}
              </button>
              {!doc.confirmed_actual_by && (
                <button onClick={confirmActual} disabled={busy}
                  className="text-xs px-2 py-1 rounded-md border border-green-200 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50">
                  Подтвердить актуальность
                </button>
              )}
              {doc.state !== "repealed" && (
                <button onClick={archive} disabled={busy}
                  className="text-xs px-2 py-1 rounded-md text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50">
                  <Icon name="Archive" size={13} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      {editOpen && (
        <EditMetaModal doc={doc} refs={refs} units={units} onClose={() => setEditOpen(false)} onSaved={onChanged} />
      )}
    </div>
  );
}

export default function ScopeDocumentsStep({
  scopeId,
  documents,
  units,
  refs,
  blockRegulationMissing,
  missingReason,
  readOnly,
  onChanged,
}: {
  scopeId: number;
  documents: ScopeDocument[];
  units: ScopeUnit[];
  refs: ScopeRefs;
  blockRegulationMissing: boolean;
  missingReason: string | null;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [missingReasonInput, setMissingReasonInput] = useState(missingReason || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const hasBlockRegulation = documents.some((d) => d.source_type === "block_regulation" && d.state !== "repealed");

  const declareMissing = async () => {
    setBusy(true);
    setError("");
    try {
      await processScopeApi.declareBlockRegulationMissing(scopeId, missingReasonInput.trim() || "Документ не найден");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const undeclareMissing = async () => {
    setBusy(true);
    try {
      await processScopeApi.undeclareBlockRegulationMissing(scopeId);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Нормативные документы</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Файл сохраняется как есть. Текст не извлекается, содержимое никуда не отправляется.
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setUploadOpen(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors flex items-center gap-1.5"
          >
            <Icon name="Upload" size={12} />
            Загрузить документ
          </button>
        )}
      </div>

      {!hasBlockRegulation && (
        <div className={`rounded-lg border p-3 ${blockRegulationMissing ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50"}`}>
          {blockRegulationMissing ? (
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <Icon name="Info" size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-700 font-medium">Отмечено: положение о Блоке ВК отсутствует</p>
                  {missingReason && <p className="text-xs text-slate-500 mt-0.5">{missingReason}</p>}
                </div>
              </div>
              {!readOnly && (
                <button onClick={undeclareMissing} disabled={busy}
                  className="text-xs px-2 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-white transition-colors flex-shrink-0">
                  Снять отметку
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Icon name="AlertTriangle" size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Положение о Блоке ВК ещё не загружено. Загрузите файл выше или явно отметьте, что его нет.
                </p>
              </div>
              {!readOnly && (
                <div className="flex items-center gap-2">
                  <input
                    value={missingReasonInput}
                    onChange={(e) => setMissingReasonInput(e.target.value)}
                    placeholder="Причина (например: разрабатывается, срок — Q3)"
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs outline-none focus:border-amber-500"
                  />
                  <button onClick={declareMissing} disabled={busy}
                    className="text-xs px-3 py-1.5 rounded-lg border border-amber-400 text-amber-800 hover:bg-amber-100 transition-colors flex-shrink-0">
                    Отметить как отсутствующее
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {documents.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">Документы ещё не загружены</p>
      ) : (
        <div className="space-y-2">
          {documents.map((d) => (
            <DocRow key={d.id} doc={d} refs={refs} units={units} readOnly={readOnly} onChanged={onChanged} />
          ))}
        </div>
      )}

      {uploadOpen && (
        <UploadForm scopeId={scopeId} refs={refs} units={units} onClose={() => setUploadOpen(false)} onUploaded={onChanged} />
      )}
    </div>
  );
}
