import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Loading, ErrorBox } from "@/components/exec/ExecUI";
import {
  processModelApi,
  CompletenessReport,
  CompletenessCategoryItem,
  ExportFileResult,
} from "@/lib/execProcessModelApi";

/**
 * Итерация 4, раздел 7: сводный отчёт о полноте процессной модели —
 * иерархия Блок ВК → направления → процессы, по каждому уровню статус по
 * категориям чек-листа (границы, документы, функции, паспорт, схема, роли,
 * риски, контроли, показатели, проблемы, TO-BE, инициативы, согласование,
 * публикация). Данные только для чтения — это отчёт, а не форма
 * редактирования, устранять замечания нужно на профильных вкладках.
 */

const REF_TYPE_LABEL: Record<string, string> = {
  process_node: "процесс",
  passport: "паспорт",
  diagram: "схема",
  diagram_node: "элемент схемы",
  process_participant: "участник",
  document: "документ",
  risk: "риск",
  control: "контроль",
  metric: "показатель",
  issue: "проблема",
  improvement: "улучшение",
};

function refLabel(item: CompletenessCategoryItem): string | null {
  if (!item.ref_type) return null;
  const label = REF_TYPE_LABEL[item.ref_type] || item.ref_type;
  return item.ref_id ? `${label} #${item.ref_id}` : label;
}

const STATUS_BADGE: Record<string, string> = {
  ready: "border-green-200 bg-green-50 text-green-700",
  needs_attention: "border-amber-200 bg-amber-50 text-amber-700",
  missing: "border-red-200 bg-red-50 text-red-700",
  not_applicable: "border-slate-200 bg-slate-100 text-slate-500",
};

const STATUS_ICON: Record<string, string> = {
  ready: "CheckCircle2",
  needs_attention: "AlertTriangle",
  missing: "XCircle",
  not_applicable: "MinusCircle",
};

function downloadBase64File(file: ExportFileResult) {
  const byteChars = atob(file.base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function CategoryTable({
  items,
  categories,
  statusLabels,
}: {
  items: CompletenessCategoryItem[];
  categories: string[];
  statusLabels: Record<string, string>;
}) {
  const byCategory = new Map(items.map((it) => [it.category, it]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-1.5 pr-3 font-medium">Категория</th>
            <th className="py-1.5 pr-3 font-medium">Статус</th>
            <th className="py-1.5 pr-3 font-medium">Блокирует публикацию</th>
            <th className="py-1.5 pr-3 font-medium">Пояснение</th>
            <th className="py-1.5 pr-3 font-medium">Где исправить</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => {
            const it = byCategory.get(cat);
            if (!it) return null;
            return (
              <tr key={cat} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 pr-3 text-slate-700 whitespace-nowrap">{cat}</td>
                <td className="py-1.5 pr-3">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] ${STATUS_BADGE[it.status] || STATUS_BADGE.not_applicable}`}>
                    <Icon name={STATUS_ICON[it.status] || "Circle"} size={11} />
                    {statusLabels[it.status] || it.status}
                  </span>
                </td>
                <td className="py-1.5 pr-3">
                  {it.blocks_publication ? (
                    <span className="text-red-600 font-medium">Да</span>
                  ) : (
                    <span className="text-slate-400">Нет</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-slate-600 max-w-[360px]">{it.explanation}</td>
                <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{refLabel(it) || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProcessRow({
  process,
  categories,
  statusLabels,
  expanded,
  onToggle,
}: {
  process: CompletenessReport["directions"][number]["processes"][number];
  categories: string[];
  statusLabels: Record<string, string>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const missingCount = process.items.filter((i) => i.status === "missing").length;
  const attentionCount = process.items.filter((i) => i.status === "needs_attention").length;
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 rounded-lg"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon name={expanded ? "ChevronDown" : "ChevronRight"} size={13} className="text-slate-400 flex-shrink-0" />
          <Icon name="FileBox" size={13} className="text-violet-500 flex-shrink-0" />
          <span className="text-xs font-medium text-slate-800 truncate">{process.name}</span>
          {process.code && <span className="text-[10px] text-slate-400 flex-shrink-0">{process.code}</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {missingCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-700">
              отсутствует: {missingCount}
            </span>
          )}
          {attentionCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">
              внимание: {attentionCount}
            </span>
          )}
          {missingCount === 0 && attentionCount === 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-green-200 bg-green-50 text-green-700">
              готово
            </span>
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100">
          <CategoryTable items={process.items} categories={categories} statusLabels={statusLabels} />
        </div>
      )}
    </div>
  );
}

function DirectionBlock({
  direction,
  categories,
  statusLabels,
}: {
  direction: CompletenessReport["directions"][number];
  categories: string[];
  statusLabels: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedProcessId, setExpandedProcessId] = useState<number | null>(null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon name={expanded ? "ChevronDown" : "ChevronRight"} size={14} className="text-slate-400 flex-shrink-0" />
          <Icon name="FolderTree" size={15} className="text-violet-600 flex-shrink-0" />
          <span className="text-sm font-semibold text-slate-900 truncate">{direction.name}</span>
          {direction.code && <span className="text-[11px] text-slate-400 flex-shrink-0">{direction.code}</span>}
        </div>
        <span className="text-[11px] text-slate-400 flex-shrink-0">{direction.processes.length} процессов</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3">
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">Сводка по направлению</p>
            <CategoryTable items={direction.items} categories={categories} statusLabels={statusLabels} />
          </div>
          {direction.processes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Процессы</p>
              {direction.processes.map((p) => (
                <ProcessRow
                  key={p.process_node_id}
                  process={p}
                  categories={categories}
                  statusLabels={statusLabels}
                  expanded={expandedProcessId === p.process_node_id}
                  onToggle={() => setExpandedProcessId((cur) => (cur === p.process_node_id ? null : p.process_node_id))}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CompletenessReportView({ scopeId }: { scopeId?: number }) {
  const [report, setReport] = useState<CompletenessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [exportError, setExportError] = useState("");
  const [scopeExpanded, setScopeExpanded] = useState(true);

  const load = () => {
    setLoading(true);
    setError("");
    processModelApi.completenessReport(scopeId)
      .then(setReport)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [scopeId]);

  const doExport = async (kind: "pdf" | "xlsx") => {
    setExporting(kind);
    setExportError("");
    try {
      const file = kind === "pdf"
        ? await processModelApi.completenessExportPdf(scopeId)
        : await processModelApi.completenessExportXlsx(scopeId);
      downloadBase64File(file);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!report) return null;

  const scopeMissing = report.scope_summary.items.filter((i) => i.status === "missing").length;
  const scopeAttention = report.scope_summary.items.filter((i) => i.status === "needs_attention").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-900">Отчёт о полноте процессной модели</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Иерархия «Блок ВК → направления → процессы» с оценкой полноты по каждой категории раздела модели.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => doExport("pdf")}
            disabled={exporting !== null}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1.5"
          >
            {exporting === "pdf" ? (
              <span className="w-3 h-3 border-2 border-slate-400/40 border-t-slate-600 rounded-full animate-spin" />
            ) : (
              <Icon name="FileDown" size={13} />
            )}
            Скачать PDF
          </button>
          <button
            onClick={() => doExport("xlsx")}
            disabled={exporting !== null}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1.5"
          >
            {exporting === "xlsx" ? (
              <span className="w-3 h-3 border-2 border-slate-400/40 border-t-slate-600 rounded-full animate-spin" />
            ) : (
              <Icon name="FileSpreadsheet" size={13} />
            )}
            Скачать XLSX
          </button>
        </div>
      </div>

      {exportError && <p className="text-xs text-red-600">{exportError}</p>}

      <div className="rounded-xl border border-violet-200 bg-violet-50/40 overflow-hidden">
        <button
          onClick={() => setScopeExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-violet-50"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Icon name={scopeExpanded ? "ChevronDown" : "ChevronRight"} size={14} className="text-violet-500 flex-shrink-0" />
            <Icon name="Shield" size={15} className="text-violet-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-900">Блок внутреннего контроля (сводно)</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {scopeMissing > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-700">
                отсутствует: {scopeMissing}
              </span>
            )}
            {scopeAttention > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">
                внимание: {scopeAttention}
              </span>
            )}
            {scopeMissing === 0 && scopeAttention === 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-green-200 bg-green-50 text-green-700">
                готово
              </span>
            )}
          </div>
        </button>
        {scopeExpanded && (
          <div className="px-4 pb-4 pt-1 border-t border-violet-100 bg-white">
            <CategoryTable items={report.scope_summary.items} categories={report.categories} statusLabels={report.status_labels} />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Направления ({report.directions.length})</p>
        {report.directions.length === 0 ? (
          <p className="text-xs text-slate-400">Направления ещё не созданы.</p>
        ) : (
          report.directions.map((d) => (
            <DirectionBlock key={d.process_node_id} direction={d} categories={report.categories} statusLabels={report.status_labels} />
          ))
        )}
      </div>
    </div>
  );
}
