import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";
import { goalsApi, GoalsReportSnapshot } from "@/lib/execGoalsApi";

/** Публикация неизменяемого снимка отчёта по целям/KPI/эффектам и экспорт
 * HTML/XLSX. Снимок хранится отдельно (exec_goals_report_snapshot), payload
 * читается один раз на момент публикации и больше не меняется. */
export default function GoalsSnapshotsTab({ centerId }: { centerId: number }) {
  const [snapshot, setSnapshot] = useState<GoalsReportSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [snapshotId, setSnapshotId] = useState("");

  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await goalsApi.createReportSnapshot({ center_id: centerId });
      const full = await goalsApi.reportSnapshot(r.id);
      setSnapshot(full);
      setSnapshotId(String(r.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openById = async () => {
    if (!snapshotId) return;
    setBusy(true);
    setError("");
    try {
      setSnapshot(await goalsApi.reportSnapshot(Number(snapshotId)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportHtml = async () => {
    if (!snapshot) return;
    const html = await goalsApi.exportHtml(snapshot.id);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const exportXlsx = async () => {
    if (!snapshot) return;
    const r = await goalsApi.exportXlsx(snapshot.id);
    const link = document.createElement("a");
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${r.content_base64}`;
    link.download = r.filename;
    link.click();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-start gap-2">
        <Icon name="Info" size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Публикация фиксирует неизменяемый снимок целей, показателей, значений, результатов и
          эффектов на текущий момент (SHA-256). Последующие изменения исходных данных на снимок не влияют.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={publish} disabled={busy}>
          <Icon name="Camera" size={13} className="mr-1.5" /> Опубликовать снимок
        </Button>
        <input
          value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)} placeholder="ID снимка"
          className="w-24 h-8 text-sm px-2 rounded-md border border-slate-200"
        />
        <Button size="sm" variant="outline" onClick={openById} disabled={busy || !snapshotId}>Открыть</Button>
      </div>

      {error && <ErrorBox message={error} onRetry={() => setError("")} />}
      {busy && <Loading />}

      {snapshot && !busy && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{snapshot.title}</p>
              <p className="text-xs text-slate-500 mt-1">
                Версия {snapshot.version_group} №{snapshot.version_number} · {snapshot.created_by}
              </p>
              <p className="text-xs text-slate-400 mt-0.5 font-mono break-all">{snapshot.payload_sha256}</p>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${snapshot.integrity_ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
              {snapshot.integrity_ok ? "Целостность подтверждена" : "Целостность нарушена"}
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportHtml}>
              <Icon name="FileText" size={13} className="mr-1.5" /> HTML
            </Button>
            <Button size="sm" variant="outline" onClick={exportXlsx}>
              <Icon name="FileSpreadsheet" size={13} className="mr-1.5" /> XLSX
            </Button>
          </div>
        </div>
      )}

      {!snapshot && !busy && <Empty text="Снимков пока нет — опубликуйте первый" icon="Camera" />}
    </div>
  );
}
