import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loading, Empty, ErrorBox, fmtDate } from "@/components/exec/ExecUI";
import PageGuide from "@/components/exec/PageGuide";
import { execPageGuides } from "@/config/execPageGuides";
import { execReportsApi, ReportSnapshot, ReportDetail } from "@/lib/execReportsApi";

const REPORT_KIND_LABEL: Record<string, string> = {
  weekly: "Недельная справка", monthly: "Месячная справка",
  actions: "Отчёт по поручениям", portfolio: "Отчёт по портфелю",
  risks_issues: "Риски и проблемы", results_effects: "Результаты и эффекты",
  resources_load: "Отчёт по ресурсам и загрузке", budget_planfact: "Финансовый отчёт (план-факт)",
  resource_requirements: "Отчёт по ресурсным потребностям",
};

export default function ExecReportsPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const [reportKind, setReportKind] = useState("weekly");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [versionGroup, setVersionGroup] = useState("");

  const [preview, setPreview] = useState<ReportDetail | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    execReportsApi.reports().then((d) => setReports(d.items)).catch((e) => setError((e as Error).message)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const suggestPeriod = (kind: string) => {
    const now = new Date();
    if (kind === "weekly") {
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setPeriodFrom(monday.toISOString().slice(0, 10));
      setPeriodTo(sunday.toISOString().slice(0, 10));
      const week = Math.ceil((((monday.getTime() - new Date(monday.getFullYear(), 0, 1).getTime()) / 86400000) + new Date(monday.getFullYear(), 0, 1).getDay() + 1) / 7);
      setVersionGroup(`weekly_${monday.getFullYear()}-W${week}`);
    } else if (kind === "monthly") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setPeriodFrom(first.toISOString().slice(0, 10));
      setPeriodTo(last.toISOString().slice(0, 10));
      setVersionGroup(`monthly_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    } else {
      setPeriodFrom("");
      setPeriodTo("");
      setVersionGroup(`${kind}_${now.toISOString().slice(0, 10)}`);
    }
  };

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await execReportsApi.createReport({
        report_kind: reportKind, period_from: periodFrom || undefined, period_to: periodTo || undefined,
        version_group: versionGroup || undefined,
      });
      setCreating(false);
      load();
      const detail = await execReportsApi.report(r.id);
      setPreview(detail);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openPreview = async (id: number) => {
    setPreviewBusy(true);
    try {
      setPreview(await execReportsApi.report(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewBusy(false);
    }
  };

  const exportHtml = async () => {
    if (!preview) return;
    try {
      const html = await execReportsApi.exportHtml(preview.id);
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const exportXlsx = async () => {
    if (!preview) return;
    try {
      const r = await execReportsApi.exportXlsx(preview.id);
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${r.content_base64}`;
      link.download = r.filename;
      link.click();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <button onClick={() => navigate("/cabinet/exec/dashboard")} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
          <Icon name="ArrowLeft" size={14} /> К дашборду
        </button>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Icon name="FileText" size={22} className="text-violet-600" />
              Отчёты
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Опубликованные версии неизменяемы. Повторная публикация создаёт новую версию.
            </p>
          </div>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={() => { setCreating(true); suggestPeriod(reportKind); }}>
            <Icon name="Plus" size={14} className="mr-1.5" /> Сформировать
          </Button>
        </div>

        <PageGuide {...execPageGuides.reports} />

        {error && <ErrorBox message={error} onRetry={load} />}

        {creating && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Тип отчёта</Label>
                <Select value={reportKind} onValueChange={(v) => { setReportKind(v); suggestPeriod(v); }}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(REPORT_KIND_LABEL).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Название версии</Label>
                <Input value={versionGroup} onChange={(e) => setVersionGroup(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Начало периода</Label>
                <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Конец периода</Label>
                <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setCreating(false)}>Отмена</Button>
              <Button size="sm" onClick={create} disabled={busy}>{busy ? "Формирование..." : "Опубликовать"}</Button>
            </div>
          </div>
        )}

        {preview && (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold">{preview.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {fmtDate(preview.created_at)} · {preview.created_by} · SHA-256: {preview.payload_sha256.slice(0, 16)}...
                </div>
              </div>
              <button onClick={() => setPreview(null)}><Icon name="X" size={14} className="text-muted-foreground" /></button>
            </div>
            {!preview.integrity_ok && (
              <div className="text-xs text-red-700 bg-red-100 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <Icon name="AlertTriangle" size={13} /> Целостность снимка нарушена — экспорт заблокирован
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={exportHtml} disabled={!preview.integrity_ok}>
                <Icon name="Printer" size={13} className="mr-1.5" /> Печатная версия
              </Button>
              <Button size="sm" variant="outline" onClick={exportXlsx} disabled={!preview.integrity_ok}>
                <Icon name="Table" size={13} className="mr-1.5" /> XLSX
              </Button>
            </div>
          </div>
        )}

        {loading ? <Loading /> : reports.length === 0 ? (
          <Empty text="Отчётов пока нет" icon="FileText" />
        ) : (
          <div className="space-y-1.5">
            {reports.map((r) => (
              <div
                key={r.id}
                onClick={() => openPreview(r.id)}
                className="rounded-xl border border-slate-200 bg-white p-3.5 cursor-pointer hover:border-violet-300 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {REPORT_KIND_LABEL[r.report_kind] || r.report_kind} · версия {r.version_number} · {fmtDate(r.created_at)}
                  </div>
                </div>
                {previewBusy && <Icon name="Loader2" size={14} className="animate-spin text-muted-foreground" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}