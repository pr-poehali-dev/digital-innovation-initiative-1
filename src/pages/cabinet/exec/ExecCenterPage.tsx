import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Card, Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";
import {
  CenterForm,
  CenterFunctionForm,
  CenterGoalForm,
  CenterRoleForm,
} from "@/components/exec/CenterForms";
import CenterPassportView from "@/components/exec/CenterPassportView";
import {
  CENTER_STATUS,
  Center,
  CenterFunction,
  CenterGoal,
  CenterRefs,
  CenterRole,
  CenterStats,
  centerApi,
} from "@/lib/execCenterApi";

const EMPTY_REFS: CenterRefs = { persons: [], initiatives: [], plans: [] };

export default function ExecCenterPage() {
  const [params, setParams] = useSearchParams();
  const centerId = Number(params.get("id")) || 0;

  const [list, setList] = useState<Center[]>([]);
  const [center, setCenter] = useState<Center | null>(null);
  const [stats, setStats] = useState<CenterStats | null>(null);
  const [refs, setRefs] = useState<CenterRefs>(EMPTY_REFS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [centerForm, setCenterForm] = useState<{ open: boolean; edit?: Center }>({
    open: false,
  });
  const [goalForm, setGoalForm] = useState<{
    open: boolean;
    goal?: CenterGoal;
    kind?: string;
    parentId?: number | null;
  }>({ open: false });
  const [fnForm, setFnForm] = useState<{ open: boolean; fn?: CenterFunction }>({
    open: false,
  });
  const [roleForm, setRoleForm] = useState<{ open: boolean; role?: CenterRole }>({
    open: false,
  });

  const loadList = () => {
    setLoading(true);
    setError("");
    Promise.all([centerApi.list(), centerApi.refs()])
      .then(([items, r]) => {
        setList(items);
        setRefs(r);
        // Если центр один — сразу открываем его
        if (!centerId && items.length === 1) {
          setParams({ id: String(items[0].id) }, { replace: true });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const loadCenter = (id: number) => {
    setLoading(true);
    setError("");
    centerApi
      .center(id)
      .then((d) => {
        setCenter(d.center);
        setStats(d.stats);
        setRefs(d.refs);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (centerId) loadCenter(centerId);
    else loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerId]);

  const reload = () => (centerId ? loadCenter(centerId) : loadList());

  const remove = async (kind: "goal" | "function" | "role", id: number, name: string) => {
    if (!window.confirm(`Удалить «${name}»?`)) return;
    try {
      if (kind === "goal") await centerApi.deleteGoal(id);
      if (kind === "function") await centerApi.deleteFunction(id);
      if (kind === "role") await centerApi.deleteRole(id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить");
    }
  };

  /* ---------- Список центров ---------- */
  if (!centerId) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Центры компетенций</h1>
              <p className="text-sm text-slate-500 mt-1">
                Обоснование создания, цели, функции и штат
              </p>
            </div>
            <button
              onClick={() => setCenterForm({ open: true })}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Icon name="Plus" size={15} />
              Центр
            </button>
          </div>

          {loading ? (
            <Loading />
          ) : error ? (
            <ErrorBox message={error} onRetry={loadList} />
          ) : list.length === 0 ? (
            <Card title="Пока пусто" icon="Building2">
              <div className="py-6 text-center">
                <Icon name="Building2" size={30} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                  Паспорт центра — это документ-обоснование: зачем создаём, каких целей
                  достигаем, какие функции выполняем и сколько людей для этого нужно.
                  С ним удобно защищать создание подразделения перед руководством.
                </p>
                <button
                  onClick={() => setCenterForm({ open: true })}
                  className="mt-4 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
                >
                  Создать паспорт центра
                </button>
              </div>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {list.map((c) => {
                const st = CENTER_STATUS[c.status] || CENTER_STATUS.draft;
                return (
                  <button
                    key={c.id}
                    onClick={() => setParams({ id: String(c.id) })}
                    className="text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-violet-300 transition-colors"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-slate-900 leading-snug flex-1">
                        {c.short_name || c.title}
                      </h3>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${st.cls}`}
                      >
                        {st.title}
                      </span>
                    </div>
                    {c.head_name && (
                      <p className="text-xs text-slate-500 mb-2">Руководитель: {c.head_name}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span>
                        Целей: <b className="text-slate-700">{c.goals_count || 0}</b>
                      </span>
                      <span>
                        Функций: <b className="text-slate-700">{c.functions_count || 0}</b>
                      </span>
                      <span>
                        Ставок: <b className="text-slate-700">{c.roles_headcount || 0}</b>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {centerForm.open && (
          <CenterForm
            center={centerForm.edit}
            refs={refs}
            onClose={() => setCenterForm({ open: false })}
            onSaved={() => {
              setCenterForm({ open: false });
              loadList();
            }}
          />
        )}
      </Layout>
    );
  }

  /* ---------- Паспорт центра ---------- */
  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <button
          onClick={() => setParams({})}
          className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1.5 transition-colors"
        >
          <Icon name="ArrowLeft" size={14} />
          Все центры
        </button>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : !center ? (
          <Empty text="Центр не найден" icon="Building2" />
        ) : (
          <>
            <CenterPassportView
              center={center}
              stats={stats}
              onEditCenter={() => setCenterForm({ open: true, edit: center })}
              onAddGoal={(kind, parentId) =>
                setGoalForm({ open: true, kind, parentId })
              }
              onEditGoal={(g) => setGoalForm({ open: true, goal: g })}
              onDeleteGoal={(g) => remove("goal", g.id, g.title)}
              onAddFunction={() => setFnForm({ open: true })}
              onEditFunction={(f) => setFnForm({ open: true, fn: f })}
              onDeleteFunction={(f) => remove("function", f.id, f.title)}
              onAddRole={() => setRoleForm({ open: true })}
              onEditRole={(r) => setRoleForm({ open: true, role: r })}
              onDeleteRole={(r) => remove("role", r.id, r.title)}
            />
          </>
        )}
      </div>

      {centerForm.open && center && (
        <CenterForm
          center={centerForm.edit}
          refs={refs}
          onClose={() => setCenterForm({ open: false })}
          onSaved={() => {
            setCenterForm({ open: false });
            reload();
          }}
        />
      )}

      {goalForm.open && center && (
        <CenterGoalForm
          goal={goalForm.goal}
          centerId={center.id}
          kind={goalForm.kind}
          parentGoalId={goalForm.parentId}
          goals={center.goals || []}
          refs={refs}
          onClose={() => setGoalForm({ open: false })}
          onSaved={() => {
            setGoalForm({ open: false });
            reload();
          }}
        />
      )}

      {fnForm.open && center && (
        <CenterFunctionForm
          fn={fnForm.fn}
          centerId={center.id}
          goals={center.goals || []}
          refs={refs}
          onClose={() => setFnForm({ open: false })}
          onSaved={() => {
            setFnForm({ open: false });
            reload();
          }}
        />
      )}

      {roleForm.open && center && (
        <CenterRoleForm
          role={roleForm.role}
          centerId={center.id}
          functions={center.functions || []}
          refs={refs}
          onClose={() => setRoleForm({ open: false })}
          onSaved={() => {
            setRoleForm({ open: false });
            reload();
          }}
        />
      )}
    </Layout>
  );
}
