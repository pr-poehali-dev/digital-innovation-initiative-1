import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import {
  execDocumentsApi, ExecPackageSummary, ExecPackage, DocVersionSummary,
} from "@/lib/execDocumentsApi";

/** Руководительский пакет: набор разделов, каждый — опубликованная версия
 * документа. Публикация фиксирует неизменяемый payload с SHA-256. */
export default function PackagesTab() {
  const [items, setItems] = useState<ExecPackageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<ExecPackage | null>(null);

  const reload = () => {
    setLoading(true);
    setError("");
    execDocumentsApi.packages().then((d) => setItems(d.items)).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const openDetail = (id: number) => execDocumentsApi.package(id).then(setDetail).catch((e) => setError(e.message));

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Icon name="Plus" size={14} className="mr-1.5" /> Новый пакет
        </Button>
      </div>

      {!items.length ? <Empty text="Пакетов пока нет" icon="Package" /> : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {items.map((p) => (
            <div key={p.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(p.id)}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {p.status === "published" ? "Опубликован" : "Черновик"}
                  </span>
                  <span className="text-[10px] text-slate-400">v{p.version_number}</span>
                </div>
                <p className="text-sm text-slate-900 mt-1">{p.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {p.recipient || "получатель не указан"}
                  {p.period_from && ` · ${fmtDate(p.period_from)} — ${fmtDate(p.period_to)}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <PackageFormDialog onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); reload(); openDetail(id); }} />
      )}

      {detail && (
        <PackageDetailPanel pkg={detail} onClose={() => setDetail(null)} onChanged={() => { reload(); openDetail(detail.id); }} />
      )}
    </div>
  );
}

function PackageFormDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const [recipient, setRecipient] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [publishedDocs, setPublishedDocs] = useState<DocVersionSummary[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    execDocumentsApi.versions(undefined, "published").then((d) => setPublishedDocs(d.items)).catch(() => {});
  }, []);

  const toggle = (id: number) => {
    setSelectedDocs((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const save = async () => {
    if (!title.trim()) { setError("Укажите название пакета"); return; }
    setSaving(true);
    setError("");
    try {
      const sections = selectedDocs.map((docId) => {
        const doc = publishedDocs.find((d) => d.id === docId);
        return { key: `doc-${docId}`, title: doc?.title || `Документ ${docId}`, doc_version_id: docId };
      });
      const r = await execDocumentsApi.savePackage({
        title, recipient: recipient || undefined, period_from: periodFrom || undefined,
        period_to: periodTo || undefined, sections,
      });
      onSaved(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-4 max-w-lg w-full space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium text-slate-900">Новый пакет руководителя</p>
        <Input placeholder="Название пакета" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="Получатель" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
          <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1.5">Разделы (опубликованные документы)</p>
          {!publishedDocs.length ? (
            <p className="text-xs text-slate-400">Нет опубликованных документов — сначала опубликуйте нужные версии.</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {publishedDocs.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                  <input type="checkbox" checked={selectedDocs.includes(d.id)} onChange={() => toggle(d.id)} />
                  {d.title}
                </label>
              ))}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving}>Сохранить черновик</Button>
          <Button size="sm" variant="outline" onClick={onClose}>Отмена</Button>
        </div>
      </div>
    </div>
  );
}

function PackageDetailPanel({ pkg, onClose, onChanged }: { pkg: ExecPackage; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      await execDocumentsApi.publishPackage(pkg.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-4 max-w-lg w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900">{pkg.title}</p>
            <p className="text-xs text-slate-500 mt-1">{pkg.recipient} · версия {pkg.version_number}</p>
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${pkg.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
            {pkg.status === "published" ? "Опубликован" : "Черновик"}
          </span>
        </div>

        <div className="space-y-1">
          {pkg.payload.sections.map((s, i) => (
            <div key={i} className="text-sm text-slate-700 flex items-center gap-2 py-1 border-b border-slate-50 last:border-0">
              <Icon name="FileText" size={13} className="text-slate-400" />
              {s.doc_title || s.title}
            </div>
          ))}
        </div>

        {pkg.status === "published" && (
          <div className={`text-xs rounded-lg px-3 py-2 ${pkg.integrity_ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {pkg.integrity_ok ? "Целостность подтверждена" : "Целостность нарушена"}
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2">
          {pkg.status !== "published" && (
            <Button size="sm" onClick={publish} disabled={busy}>
              <Icon name="Send" size={13} className="mr-1.5" /> Опубликовать пакет
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </div>
  );
}
