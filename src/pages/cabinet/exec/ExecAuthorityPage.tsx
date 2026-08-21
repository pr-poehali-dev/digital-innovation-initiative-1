import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { execApi, PARTICIPATION_LETTERS, RoleTemplate } from "@/lib/execCabinetApi";
import { Card, Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";

interface MatrixData {
  types: { code: string; title: string; category: string; stage: string }[];
  roles: { code: string; title: string; role_kind: string }[];
  cells: { decision_type_code: string; role_code: string; participation_kind: string }[];
}

export default function ExecAuthorityPage() {
  const [data, setData] = useState<MatrixData | null>(null);
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"matrix" | "catalog">("matrix");
  const [openRole, setOpenRole] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([execApi.authorityMatrix(), execApi.roles()])
      .then(([m, r]) => {
        setData(m);
        setRoles(r.roles);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const cellFor = (typeCode: string, roleCode: string) => {
    const kinds = Array.from(
      new Set(
        data?.cells
          .filter((c) => c.decision_type_code === typeCode && c.role_code === roleCode)
          .map((c) => c.participation_kind) || [],
      ),
    );
    return kinds;
  };

  return (
    <Layout>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <header>
          <h1 className="text-xl font-semibold text-slate-900">Архитектура полномочий</h1>
          <p className="text-sm text-slate-500 mt-1">
            Матрица «решения × роли» строится автоматически из фактических назначений
          </p>
        </header>

        <nav className="flex gap-1 border-b border-slate-200">
          {[
            { id: "matrix" as const, label: "Матрица «Решения × роли»", icon: "Grid3x3" },
            { id: "catalog" as const, label: "Каталог ролей", icon: "Shield" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-violet-600 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </nav>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : tab === "matrix" ? (
          <>
            <Card title="Обозначения" icon="Info">
              <div className="flex flex-wrap gap-2">
                {Object.entries(PARTICIPATION_LETTERS).map(([code, m]) => (
                  <div
                    key={code}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200"
                  >
                    <span
                      className={`font-mono font-semibold text-xs ${
                        code === "decide" ? "text-red-600" : "text-violet-600"
                      }`}
                    >
                      {m.letter}
                    </span>
                    <span className="text-xs text-slate-500">— {m.title}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card
              title="Матрица «Решения × роли»"
              subtitle="Построена из фактических участий в решениях"
              icon="Grid3x3"
            >
              {!data || data.types.length === 0 ? (
                <Empty text="Нет данных для построения матрицы" />
              ) : (
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="text-sm border-collapse min-w-[900px]">
                    <thead>
                      <tr>
                        <th className="sticky left-0 bg-white text-left text-xs text-slate-500 font-medium p-2 border-b border-slate-200 min-w-[240px]">
                          Управленческое решение
                        </th>
                        {data.roles.map((r) => (
                          <th
                            key={r.code}
                            className="text-xs text-slate-500 font-medium p-2 border-b border-slate-200 min-w-[90px] align-bottom"
                          >
                            <span className="block leading-tight">{r.title}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.types.map((t) => (
                        <tr key={t.code} className="hover:bg-slate-100">
                          <td className="sticky left-0 bg-white text-slate-700 p-2 border-b border-slate-200 text-xs leading-snug">
                            {t.title}
                          </td>
                          {data.roles.map((r) => {
                            const kinds = cellFor(t.code, r.code);
                            return (
                              <td
                                key={r.code}
                                className="text-center p-2 border-b border-slate-200"
                              >
                                {kinds.length === 0 ? (
                                  <span className="text-slate-700">·</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1 justify-center">
                                    {kinds.map((k) => {
                                      const m = PARTICIPATION_LETTERS[k];
                                      const isDecide = k === "decide";
                                      return (
                                        <span
                                          key={k}
                                          title={m?.title}
                                          className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded text-[11px] font-mono font-semibold border ${
                                            isDecide
                                              ? "bg-red-500/15 text-red-700 border-red-500/40"
                                              : "bg-slate-100 text-violet-600 border-slate-200"
                                          }`}
                                        >
                                          {m?.letter}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        ) : (
          <Card title="Каталог ролей" subtitle={`${roles.length} типовых ролей`} icon="Shield">
            {roles.length === 0 ? (
              <Empty text="Роли не заведены" />
            ) : (
              <div className="space-y-2">
                {roles.map((r) => {
                  const isOpen = openRole === r.code;
                  return (
                    <div key={r.code} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                      <button
                        onClick={() => setOpenRole(isOpen ? null : r.code)}
                        className="w-full text-left p-4 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-slate-900">{r.title}</p>
                              {r.is_mandatory && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-600/30">
                                  обязательна
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">{r.purpose}</p>
                          </div>
                          <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} size={16} className="text-slate-400 flex-shrink-0" />
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 pt-3 border-t border-slate-200 grid sm:grid-cols-2 gap-4">
                          {[
                            ["Типовые обязанности", r.duties],
                            ["Типовые полномочия", r.authorities],
                            ["Ограничения", r.limitations],
                            ["Кто назначает", r.appointed_by],
                            ["Кому эскалирует", r.escalates_to],
                          ].map(([label, val]) => (
                            <div key={label as string}>
                              <p className="text-xs text-slate-500 mb-1">{label}</p>
                              <p className="text-sm text-slate-700">
                                {(val as string) || <span className="text-slate-400">не определено</span>}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}
      </div>
    </Layout>
  );
}
