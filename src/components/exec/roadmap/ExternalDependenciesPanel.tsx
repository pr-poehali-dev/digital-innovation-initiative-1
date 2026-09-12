import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";
import { execRoadmapApi, ProjectExternalDependencies, ExternalDependencyRow } from "@/lib/execRoadmapApi";

const KIND_LABEL: Record<string, string> = { stage: "Этап", task: "Задача", milestone: "Веха", project: "Проект" };

/** Сводка межпроектных зависимостей для карточки проекта: что блокирует
 * этот проект (blocking_in) и какие проекты блокирует он сам (blocking_out).
 * Отдельные карточки для входящих и исходящих связей, каждая — с
 * ближайшей внешней датой, статусом и ссылкой на другой проект. */
export default function ExternalDependenciesPanel({ projectId }: { projectId: number }) {
  const navigate = useNavigate();
  const [data, setData] = useState<ProjectExternalDependencies | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    execRoadmapApi.projectExternalDependencies(projectId).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, [projectId]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  if (!data.blocking_in.length && !data.blocking_out.length) {
    return <Empty text="Межпроектных зависимостей у этого проекта нет" icon="Link2" />;
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="rounded-xl border border-amber-200 bg-white overflow-hidden">
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-1.5">
          <Icon name="ArrowDownToLine" size={13} className="text-amber-700" />
          <span className="text-xs font-medium text-amber-800">Что блокирует этот проект ({data.blocking_in.length})</span>
        </div>
        {!data.blocking_in.length ? (
          <p className="text-xs text-slate-400 p-3">Внешних блокировок нет</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.blocking_in.map((r, i) => (
              <ExternalRow key={i} row={r} onOpen={() => navigate(`/cabinet/exec/portfolio/projects/${r.external_project_id}`)} />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5">
          <Icon name="ArrowUpFromLine" size={13} className="text-slate-600" />
          <span className="text-xs font-medium text-slate-700">Какие проекты блокирует этот ({data.blocking_out.length})</span>
        </div>
        {!data.blocking_out.length ? (
          <p className="text-xs text-slate-400 p-3">Этот проект никого не блокирует</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.blocking_out.map((r, i) => (
              <ExternalRow key={i} row={r} onOpen={() => navigate(`/cabinet/exec/portfolio/projects/${r.external_project_id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExternalRow({ row: r, onOpen }: { row: ExternalDependencyRow; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="w-full text-left p-3 hover:bg-slate-50 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-800 truncate">{r.local_title}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 flex-shrink-0">{KIND_LABEL[r.local_kind]}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
        <Icon name="ExternalLink" size={10} />
        <span className="truncate">{r.external_title}</span>
        <span className="text-slate-300 flex-shrink-0">·</span>
        <span className="flex-shrink-0">{r.dependency_type}{r.lag_days !== 0 ? ` ${r.lag_days > 0 ? "+" : ""}${r.lag_days}д` : ""}</span>
      </div>
      <p className="text-[10px] text-slate-400 mt-0.5">Статус: {r.local_status}</p>
    </button>
  );
}
