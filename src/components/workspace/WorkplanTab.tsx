import { useEffect, useState } from "react";
import { workspaceApi } from "@/lib/api";
import Icon from "@/components/ui/icon";

type WorkplanTask = {
  id: number;
  order_no: number;
  code: string;
  title: string;
  expected_result: string | null;
  responsible_name: string | null;
  status: "not_started" | "in_progress" | "done";
  week_reference: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  not_started: "Не начато",
  in_progress: "В работе",
  done: "Готово",
};
const STATUS_COLOR: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
};

interface Props {
  projectId: number;
}

export default function WorkplanTab({ projectId }: Props) {
  const [tasks, setTasks] = useState<WorkplanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    workspaceApi.getWorkplan(projectId)
      .then((d: { tasks: WorkplanTask[] }) => setTasks(d.tasks || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  const cycleStatus = async (t: WorkplanTask) => {
    const order: WorkplanTask["status"][] = ["not_started", "in_progress", "done"];
    const next = order[(order.indexOf(t.status) + 1) % order.length];
    setSavingId(t.id);
    try {
      await workspaceApi.updateWorkplanTask(projectId, t.id, { status: next });
      setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось обновить статус");
    } finally {
      setSavingId(null);
    }
  };

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const progress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  if (loading) {
    return <div className="text-sm text-slate-400 py-8 text-center">Загрузка рабочего плана…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs sm:text-sm text-slate-500 leading-snug mb-2">
          План подготовки и проверки решения — от постановки задачи до представления заказчику.
          Это не план внедрения решения: задачи масштабной реализации появятся отдельным проектом
          после утверждения концепции.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-semibold text-slate-600 flex-shrink-0">{doneCount} / {tasks.length}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {tasks.map((t) => (
          <div key={t.id} className="border border-slate-200 rounded-xl p-3 bg-white flex items-start gap-3">
            <button
              onClick={() => cycleStatus(t)}
              disabled={savingId === t.id}
              className={`flex-shrink-0 mt-0.5 text-[10px] font-bold px-2 py-1 rounded-full transition-colors ${STATUS_COLOR[t.status]} hover:opacity-80 disabled:opacity-50`}
              title="Нажмите, чтобы изменить статус"
            >
              {savingId === t.id ? <Icon name="Loader2" size={11} className="animate-spin" /> : STATUS_LABEL[t.status]}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono text-slate-400">{t.code}</span>
                <p className="text-sm font-medium text-slate-800">{t.title}</p>
                {t.week_reference && (
                  <span className="text-[10px] text-slate-400 ml-auto flex items-center gap-1">
                    <Icon name="Calendar" size={10} /> {t.week_reference}
                  </span>
                )}
              </div>
              {t.expected_result && (
                <p className="text-xs text-slate-500 mt-0.5">→ {t.expected_result}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
