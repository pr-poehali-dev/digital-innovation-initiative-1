import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import {
  execDocumentsApi, DocTemplate, DocVersionSummary, DocVersion, DocVersionStatus,
  DOC_TYPE_LABEL,
} from "@/lib/execDocumentsApi";

/** Черновики и опубликованные версии документов. status фильтрует список:
 * draft — можно пересобрать, published — только просмотр/экспорт. */
export default function DocVersionsTab({ status, initialTemplateId, onOpen }: {
  status: DocVersionStatus; initialTemplateId?: number | null; onOpen: (id: number) => void;
}) {
  const [items, setItems] = useState<DocVersionSummary[]>([]);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(!!initialTemplateId);
  const [detail, setDetail] = useState<DocVersion | null>(null);

  const reload = () => {
    setLoading(true);
    setError("");
    Promise.all([execDocumentsApi.versions(undefined, status), execDocumentsApi.templates()])
      .then(([v, t]) => { setItems(v.items); setTemplates(t.items); })
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, [status]);

  const openDetail = (id: number) => {
    execDocumentsApi.version(id).then(setDetail).catch((e) => setError(e.message));
    onOpen(id);
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      {status === "draft" && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Icon name="FilePlus2" size={14} className="mr-1.5" /> Сформировать черновик
          </Button>
        </div>
      )}

      {!items.length ? <Empty text={status === "draft" ? "Черновиков нет" : "Опубликованных версий нет"} icon="FileText" /> : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {items.map((v) => (
            <div key={v.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(v.id)}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{DOC_TYPE_LABEL[v.doc_type]}</span>
                  <span className="text-[10px] text-slate-400">{v.version_group} · v{v.version_number}</span>
                </div>
                <p className="text-sm text-slate-900 mt-1">{v.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {v.author || "—"} · {fmtDate(v.published_at || v.created_at)}
                  {v.period_from && ` · период ${fmtDate(v.period_from)} — ${fmtDate(v.period_to)}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <DraftFormDialog
          templates={templates} initialTemplateId={initialTemplateId}
          onClose={() => setCreating(false)}
          onSaved={(id) => { setCreating(false); reload(); openDetail(id); }}
        />
      )}

      {detail && (
        <DocDetailPanel doc={detail} onClose={() => setDetail(null)} onChanged={() => { reload(); openDetail(detail.id); }} />
      )}
    </div>
  );
}

function DraftFormDialog({
  templates, initialTemplateId, onClose, onSaved,
}: { templates: DocTemplate[]; initialTemplateId?: number | null; onClose: () => void; onSaved: (id: number) => void }) {
  const [templateId, setTemplateId] = useState(initialTemplateId ? String(initialTemplateId) : "");
  const [title, setTitle] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[] | null>(null);

  const buildDraft = async () => {
    if (!templateId) { setError("Выберите шаблон"); return; }
    setSaving(true);
    setError("");
    try {
      const r = await execDocumentsApi.saveDraft({
        template_id: Number(templateId), title: title || undefined,
        params: { period_from: periodFrom || undefined, period_to: periodTo || undefined },
      });
      setWarnings(r.warnings);
      onSaved(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-4 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium text-slate-900">Сформировать черновик документа</p>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger><SelectValue placeholder="Шаблон" /></SelectTrigger>
          <SelectContent>
            {templates.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Название документа (необязательно)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} placeholder="Период с" />
          <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} placeholder="Период по" />
        </div>
        {warnings && warnings.length > 0 && (
          <div className="text-xs bg-amber-50 text-amber-700 rounded-lg px-3 py-2">
            {warnings.join(" · ")}
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={buildDraft} disabled={saving}>Собрать данные</Button>
          <Button size="sm" variant="outline" onClick={onClose}>Отмена</Button>
        </div>
      </div>
    </div>
  );
}

function DocDetailPanel({ doc, onClose, onChanged }: { doc: DocVersion; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      await execDocumentsApi.publish(doc.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportHtml = async () => {
    const html = await execDocumentsApi.exportHtml(doc.id);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const exportFile = async (kind: "xlsx" | "docx") => {
    const r = kind === "xlsx" ? await execDocumentsApi.exportXlsx(doc.id) : await execDocumentsApi.exportDocx(doc.id);
    const mime = kind === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const link = document.createElement("a");
    link.href = `data:${mime};base64,${r.content_base64}`;
    link.download = r.filename;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-4 max-w-lg w-full space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900">{doc.title}</p>
            <p className="text-xs text-slate-500 mt-1">{doc.version_group} · версия {doc.version_number}</p>
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${doc.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
            {doc.status === "published" ? "Опубликован" : "Черновик"}
          </span>
        </div>

        {doc.quality_warnings.length > 0 && (
          <div className="text-xs bg-amber-50 text-amber-700 rounded-lg px-3 py-2 space-y-0.5">
            {doc.quality_warnings.map((w, i) => <p key={i}>• {w}</p>)}
          </div>
        )}

        {doc.status === "published" && (
          <div className={`text-xs rounded-lg px-3 py-2 ${doc.integrity_ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {doc.integrity_ok ? "Целостность документа подтверждена" : "Целостность документа нарушена — экспорт заблокирован"}
            <p className="font-mono break-all mt-1 opacity-70">{doc.payload_sha256}</p>
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {doc.status === "draft" && (
            <Button size="sm" onClick={publish} disabled={busy}>
              <Icon name="Send" size={13} className="mr-1.5" /> Опубликовать версию
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={exportHtml} disabled={doc.status === "published" && !doc.integrity_ok}>
            <Icon name="FileText" size={13} className="mr-1.5" /> HTML
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportFile("xlsx")} disabled={doc.status === "published" && !doc.integrity_ok}>
            <Icon name="FileSpreadsheet" size={13} className="mr-1.5" /> XLSX
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportFile("docx")} disabled={doc.status === "published" && !doc.integrity_ok}>
            <Icon name="FileType" size={13} className="mr-1.5" /> DOCX
          </Button>
        </div>

        {doc.knowledge_entry_id && (
          <p className="text-xs text-slate-400">
            Зарегистрирован в документном контуре (запись №{doc.knowledge_entry_id}). Сформировано системой по шаблону, без использования внешнего AI.
          </p>
        )}

        <Button size="sm" variant="outline" onClick={onClose} className="w-full">Закрыть</Button>
      </div>
    </div>
  );
}
