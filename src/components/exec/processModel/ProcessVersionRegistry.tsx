import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Loading, ErrorBox, Empty } from "@/components/exec/ExecUI";
import {
  processModelApi,
  ProcessVersionEntry,
  ProcessVersionCompareResult,
  STATUS_STYLE,
  AddedRemovedDiff,
  FieldDiff,
} from "@/lib/execProcessModelApi";

function fmtDateTime(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function itemLabel(obj: Record<string, unknown>): string {
  return String(obj.title ?? obj.label ?? obj.name ?? obj.description ?? obj.text ?? `#${obj.id ?? ""}`);
}

function AddedRemovedBlock({ title, diff }: { title: string; diff: AddedRemovedDiff }) {
  if (diff.added.length === 0 && diff.removed.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">{title}</p>
      <div className="space-y-1">
        {diff.added.map((it, i) => (
          <div key={`a${i}`} className="text-xs rounded-md border border-green-200 bg-green-50 text-green-800 px-2.5 py-1.5">
            Добавлено: {itemLabel(it)}
          </div>
        ))}
        {diff.removed.map((it, i) => (
          <div key={`r${i}`} className="text-xs rounded-md border border-red-200 bg-red-50 text-red-800 px-2.5 py-1.5 line-through">
            Удалено: {itemLabel(it)}
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldDiffBlock({ title, diffs }: { title: string; diffs: FieldDiff[] }) {
  if (diffs.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">{title}</p>
      <div className="space-y-1">
        {diffs.map((d, i) => (
          <div key={i} className="text-xs rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-2.5 py-1.5">
            <span className="font-medium">{d.field}</span>: {String(d.before ?? "—")} → {String(d.after ?? "—")}
          </div>
        ))}
      </div>
    </div>
  );
}

function CompareView({
  versionAId,
  versionBId,
  onClose,
}: {
  versionAId: number;
  versionBId: number;
  onClose: () => void;
}) {
  const [result, setResult] = useState<ProcessVersionCompareResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    processModelApi.processVersionCompare(versionAId, versionBId)
      .then(setResult)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [versionAId, versionBId]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><Icon name="ArrowLeft" size={15} /></button>
        <p className="text-sm font-semibold text-slate-900">Сравнение версий #{versionAId} и #{versionBId}</p>
      </div>
      <div className="p-4">
        {loading && <Loading />}
        {error && <ErrorBox message={error} onRetry={load} />}
        {result && (
          <div className="space-y-5">
            <FieldDiffBlock title="Процесс" diffs={result.node} />
            <FieldDiffBlock title="Паспорт" diffs={result.passport} />
            <AddedRemovedBlock title="Функции" diff={result.functions} />

            {result.diagrams.as_is && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide">Схема AS-IS</p>
                <AddedRemovedBlock title="Узлы" diff={result.diagrams.as_is.nodes} />
                <AddedRemovedBlock title="Связи" diff={result.diagrams.as_is.edges} />
                <AddedRemovedBlock title="Дорожки" diff={result.diagrams.as_is.lanes} />
              </div>
            )}
            {result.diagrams.to_be && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide">Схема TO-BE</p>
                <AddedRemovedBlock title="Узлы" diff={result.diagrams.to_be.nodes} />
                <AddedRemovedBlock title="Связи" diff={result.diagrams.to_be.edges} />
                <AddedRemovedBlock title="Дорожки" diff={result.diagrams.to_be.lanes} />
              </div>
            )}

            <AddedRemovedBlock title="Риски" diff={result.risks} />
            <AddedRemovedBlock title="Показатели" diff={result.metrics} />
            <AddedRemovedBlock title="Проблемы" diff={result.issues} />
            <AddedRemovedBlock title="Улучшения" diff={result.improvements} />
            <AddedRemovedBlock title="Документы" diff={result.documents} />
            <AddedRemovedBlock title="Связи с инициативами" diff={result.initiative_links} />

            {result.node.length === 0 && result.passport.length === 0 &&
              result.functions.added.length === 0 && result.functions.removed.length === 0 &&
              !result.diagrams.as_is && !result.diagrams.to_be &&
              result.risks.added.length === 0 && result.risks.removed.length === 0 &&
              result.metrics.added.length === 0 && result.metrics.removed.length === 0 &&
              result.issues.added.length === 0 && result.issues.removed.length === 0 &&
              result.improvements.added.length === 0 && result.improvements.removed.length === 0 &&
              result.documents.added.length === 0 && result.documents.removed.length === 0 && (
              <Empty text="Различий между версиями не найдено" icon="GitCompare" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Итерация 4, раздел 5: реестр версий одного логического процесса
 * (root_lineage_id) — новая версия создаётся только уполномоченным из
 * опубликованной актуальной версии и не изменяет уже опубликованный снимок.
 */
export default function ProcessVersionRegistry({
  rootLineageId,
  currentProcessNodeId,
  canConfirm,
  onChanged,
}: {
  rootLineageId: number;
  currentProcessNodeId: number;
  canConfirm: boolean;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<ProcessVersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [compare, setCompare] = useState<{ a: number; b: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    processModelApi.processVersionRegistry(rootLineageId)
      .then((r) => setItems(r.items))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [rootLineageId]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const createNewVersion = async () => {
    setCreating(true);
    setMessage("");
    setError("");
    try {
      const res = await processModelApi.processVersionCreateNew(currentProcessNodeId);
      setMessage(`Создана новая версия (черновик #${res.id})`);
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const archiveVersion = async (id: number) => {
    if (!confirm("Архивировать эту версию процесса?")) return;
    setBusyId(id);
    try {
      await processModelApi.processVersionArchive(id);
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (compare) {
    return <CompareView versionAId={compare.a} versionBId={compare.b} onClose={() => setCompare(null)} />;
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  const current = items.find((i) => i.is_current);
  const canCreateNew = canConfirm && current && current.model_status === "published" && current.id === currentProcessNodeId;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-slate-500">
          Все версии этого логического процесса. Новая версия создаётся только из опубликованной актуальной версии
          и не изменяет уже опубликованный снимок.
        </p>
        {canCreateNew && (
          <button onClick={createNewVersion} disabled={creating}
            className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0">
            <Icon name="GitFork" size={12} /> {creating ? "Создаю…" : "Создать новую версию"}
          </button>
        )}
      </div>

      {message && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{message}</div>
      )}

      {selected.length === 2 && (
        <button onClick={() => setCompare({ a: selected[0], b: selected[1] })}
          className="text-xs px-3 py-1.5 rounded-lg border border-violet-300 text-violet-700 hover:bg-violet-50 flex items-center gap-1.5">
          <Icon name="GitCompare" size={12} /> Сравнить выбранные версии
        </button>
      )}

      {items.length === 0 ? (
        <Empty text="Версии не найдены" icon="History" />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-left">
                <th className="px-3 py-2 font-medium w-8"></th>
                <th className="px-3 py-2 font-medium">Версия</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium">Автор</th>
                <th className="px-3 py-2 font-medium">Создана</th>
                <th className="px-3 py-2 font-medium">Опубликована</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.includes(it.id)} onChange={() => toggleSelect(it.id)} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-800">v{it.version}</span>
                    {it.is_current && (
                      <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded border border-violet-300 bg-violet-50 text-violet-700">Текущая</span>
                    )}
                    <span className="block text-slate-400 text-[10px]">#{it.id}{it.derived_from_id ? ` · из #${it.derived_from_id}` : ""}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[it.model_status].cls}`}>
                      {STATUS_STYLE[it.model_status].title}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{it.created_by || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{fmtDateTime(it.created_at)}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {it.published_at ? <>{fmtDateTime(it.published_at)}<span className="block text-[10px] text-slate-400">{it.published_by}</span></> : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canConfirm && !it.is_current && it.model_status !== "archived" && (
                      <button onClick={() => archiveVersion(it.id)} disabled={busyId === it.id}
                        className="text-[11px] px-2 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                        Архивировать
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
