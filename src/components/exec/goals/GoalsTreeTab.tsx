import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import {
  goalsApi, Goal, GOAL_LEVEL_LABEL, GOAL_STATUS_LABEL, STATUS_COLOR_LABEL,
} from "@/lib/execGoalsApi";

const STATUS_DOT: Record<string, string> = {
  green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-red-500", gray: "bg-slate-300",
};

/** Дерево целей: карточки с раскрытием (без графового редактора). Данные
 * читаются плоским списком (parent_goal_id) — дерево строится на фронте. */
export default function GoalsTreeTab({ centerId, onOpenGoal }: { centerId: number; onOpenGoal: (id: number) => void }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const reload = () => {
    setLoading(true);
    setError("");
    goalsApi.tree(centerId).then((d) => setGoals(d.items)).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, [centerId]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!goals.length) return <Empty text="Целей пока нет" icon="Target" />;

  const roots = goals.filter((g) => !g.parent_goal_id || !goals.some((p) => p.id === g.parent_goal_id));
  const childrenOf = (id: number) => goals.filter((g) => g.parent_goal_id === id);

  const toggle = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  const renderNode = (g: Goal, depth: number) => {
    const children = childrenOf(g.id);
    const isOpen = expanded.has(g.id);
    const progress = g.progress?.progress_pct;
    return (
      <div key={g.id} style={{ marginLeft: depth * 20 }}>
        <div className="rounded-lg border border-slate-200 bg-white p-3 mb-1.5 hover:border-violet-300 transition-colors">
          <div className="flex items-start gap-2">
            {children.length > 0 ? (
              <button onClick={() => toggle(g.id)} className="mt-0.5 text-slate-400 hover:text-slate-700 flex-shrink-0">
                <Icon name={isOpen ? "ChevronDown" : "ChevronRight"} size={16} />
              </button>
            ) : (
              <span className="w-4 flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onOpenGoal(g.id)}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                  {GOAL_LEVEL_LABEL[g.goal_level]}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
                  {GOAL_STATUS_LABEL[g.status]}
                </span>
                {g.is_overdue && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">Просрочена</span>
                )}
                {!g.owner_person_id && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Без владельца</span>
                )}
              </div>
              <p className="text-sm text-slate-900 mt-1">{g.title}</p>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                {g.owner_name && <span>{g.owner_name}</span>}
                {g.due_date && <span>срок {fmtDate(g.due_date)}</span>}
                {typeof g.links_count === "number" && g.links_count > 0 && <span>{g.links_count} связей</span>}
              </div>
            </div>
            <div className="text-right flex-shrink-0 w-24">
              {progress != null ? (
                <>
                  <div className="text-sm font-medium text-slate-900">{progress}%</div>
                  <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-violet-500" style={{ width: `${Math.min(100, progress)}%` }} />
                  </div>
                </>
              ) : (
                <span className="text-xs text-slate-400">нет данных</span>
              )}
            </div>
          </div>
        </div>
        {isOpen && children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-start gap-2">
        <Icon name="Info" size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Цветовые индикаторы показателей: {Object.entries(STATUS_COLOR_LABEL).map(([c, l]) => (
            <span key={c} className="inline-flex items-center gap-1 mr-2">
              <span className={`inline-block w-2 h-2 rounded-full ${STATUS_DOT[c]}`} /> {l}
            </span>
          ))}
        </p>
      </div>
      {roots.map((g) => renderNode(g, 0))}
    </div>
  );
}
