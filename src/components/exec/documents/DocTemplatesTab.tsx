import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import {
  execDocumentsApi, DocTemplate, DocType, TemplateStatus,
  DOC_TYPE_LABEL, TEMPLATE_STATUS_LABEL,
} from "@/lib/execDocumentsApi";

const STATUS_CLS: Record<TemplateStatus, string> = {
  draft: "bg-slate-100 text-slate-600", review: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700", superseded: "bg-slate-50 text-slate-400",
  archived: "bg-slate-50 text-slate-400",
};

/** Реестр шаблонов управленческих документов. Утверждённый шаблон не
 * редактируется — повторное сохранение создаёт новую версию (backend). */
export default function DocTemplatesTab({ onCreateDraft }: { onCreateDraft: (templateId: number) => void }) {
  const [items, setItems] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DocTemplate | null>(null);

  const reload = () => {
    setLoading(true);
    setError("");
    execDocumentsApi.templates().then((d) => setItems(d.items)).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, []);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Icon name="Plus" size={14} className="mr-1.5" /> Новый шаблон
        </Button>
      </div>

      {!items.length ? <Empty text="Шаблонов пока нет" icon="FileText" /> : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {items.map((t) => (
            <div key={t.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{DOC_TYPE_LABEL[t.doc_type]}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_CLS[t.status]}`}>{TEMPLATE_STATUS_LABEL[t.status]}</span>
                  <span className="text-[10px] text-slate-400">версия {t.version_number}</span>
                </div>
                <p className="text-sm text-slate-900 mt-1">{t.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t.recipient ? `Получатель: ${t.recipient}` : "Получатель не указан"}
                  {t.approved_at ? ` · утверждён ${fmtDate(t.approved_at)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={() => onCreateDraft(t.id)}>
                  <Icon name="FilePlus2" size={13} className="mr-1.5" /> Черновик
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setEditing(t); setFormOpen(true); }}>
                  <Icon name="Pencil" size={13} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <TemplateFormDialog
          template={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

function TemplateFormDialog({
  template, onClose, onSaved,
}: { template: DocTemplate | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: template?.title || "", doc_type: template?.doc_type || "weekly_report",
    purpose: template?.purpose || "", recipient: template?.recipient || "",
    available_formats: template?.available_formats || "html",
    status: template?.status || "draft", comment: template?.comment || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!form.title.trim()) { setError("Укажите название шаблона"); return; }
    setSaving(true);
    setError("");
    try {
      await execDocumentsApi.saveTemplate({
        id: template?.id, title: form.title, doc_type: form.doc_type as DocType,
        purpose: form.purpose || undefined, recipient: form.recipient || undefined,
        available_formats: form.available_formats, status: form.status as TemplateStatus,
        comment: form.comment || undefined,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{template ? "Изменить шаблон" : "Новый шаблон"}</DialogTitle></DialogHeader>
        {template?.status === "approved" && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Шаблон утверждён — сохранение создаст новую версию, текущая станет заменённой.
          </p>
        )}
        <div className="space-y-3">
          <Input placeholder="Название шаблона" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Select value={form.doc_type} onValueChange={(v) => setForm({ ...form, doc_type: v as DocType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(DOC_TYPE_LABEL) as [DocType, string][]).map(([k, l]) => (
                <SelectItem key={k} value={k}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea placeholder="Назначение шаблона" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} rows={2} />
          <Input placeholder="Получатель" value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} />
          <Input placeholder="Форматы через запятую: html,docx,xlsx" value={form.available_formats}
                 onChange={(e) => setForm({ ...form, available_formats: e.target.value })} />
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TemplateStatus })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Черновик</SelectItem>
              <SelectItem value="review">На проверке</SelectItem>
              <SelectItem value="approved">Утверждён</SelectItem>
            </SelectContent>
          </Select>
          <Textarea placeholder="Комментарий" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} rows={2} />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={save} disabled={saving}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
