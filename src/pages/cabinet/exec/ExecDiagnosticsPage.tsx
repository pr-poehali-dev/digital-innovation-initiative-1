import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { execApi, Issue } from "@/lib/execCabinetApi";
import { Card, ErrorBox, Loading, Metric } from "@/components/exec/ExecUI";

const RULE_DESCRIPTIONS: Record<string, string> = {
  E01: "У инициативы не назначен владелец — некому отвечать за результат",
  E02: "По решению не определён участник с правом окончательного принятия",
  E03: "Несколько участников принимают решение, но коллегиальный порядок не указан",
  E04: "Роль назначена, но не указано лицо, подразделение или орган",
  E05: "Полномочие подтверждено, но не имеет документального основания",
  E06: "Решение продвигается в обход обязательного предшествующего решения",
  W01: "Не назначен владелец эффекта — некому подтвердить достижение результата",
  W02: "Ключевой участник не имеет цели взаимодействия",
  W03: "Действие по взаимодействию просрочено",
  W04: "Решение просрочено относительно установленного срока",
  W05: "Участник с правом блокирования ещё не вовлечён в работу",
  W06: "Участник перегружен открытыми решениями",
  W07: "Не определён маршрут эскалации по инициативе",
};

export default function ExecDiagnosticsPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [level, setLevel] = useState<"" | "blocking" | "warning">("");

  const load = () => {
    setLoading(true);
    setError("");
    execApi
      .diagnostics()
      .then((r) => setIssues(r.issues))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const blocking = issues.filter((i) => i.level === "blocking");
  const warnings = issues.filter((i) => i.level === "warning");
  const filtered = useMemo(
    () => (level ? issues.filter((i) => i.level === level) : issues),
    [issues, level],
  );

  const grouped = useMemo(() => {
    const map: Record<string, Issue[]> = {};
    filtered.forEach((i) => {
      (map[i.code] ||= []).push(i);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <Layout>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <header>
          <h1 className="text-xl font-semibold text-slate-900">Диагностика полномочий</h1>
          <p className="text-sm text-slate-500 mt-1">
            Детерминированные проверки по формальным правилам. Без ИИ-оценок и предположений.
          </p>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Metric
            label="Блокирующих проблем"
            value={blocking.length}
            icon="OctagonAlert"
            tone={blocking.length > 0 ? "danger" : "success"}
            onClick={() => setLevel(level === "blocking" ? "" : "blocking")}
          />
          <Metric
            label="Предупреждений"
            value={warnings.length}
            icon="TriangleAlert"
            tone={warnings.length > 0 ? "warning" : "success"}
            onClick={() => setLevel(level === "warning" ? "" : "warning")}
          />
          <Metric label="Всего проверок" value={13} icon="ListChecks" />
        </div>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <Card title="Результат проверки" icon="CircleCheck">
            <div className="py-10 text-center">
              <Icon name="CircleCheck" size={36} className="text-green-500 mx-auto mb-3" />
              <p className="text-sm text-slate-900 font-medium">Нарушений не обнаружено</p>
              <p className="text-xs text-slate-500 mt-1">
                Все проверки полномочий пройдены успешно
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {grouped.map(([code, list]) => {
              const isBlocking = list[0].level === "blocking";
              return (
                <Card
                  key={code}
                  title={list[0].title}
                  subtitle={RULE_DESCRIPTIONS[code]}
                  icon={isBlocking ? "OctagonAlert" : "TriangleAlert"}
                  className={isBlocking ? "border-red-500/25" : "border-amber-500/20"}
                  action={
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                        isBlocking
                          ? "bg-red-500/15 text-red-600"
                          : "bg-amber-500/15 text-amber-600"
                      }`}
                    >
                      {code} · {list.length}
                    </span>
                  }
                >
                  <div className="space-y-2">
                    {list.map((iss, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start justify-between gap-3 p-3 rounded-lg border ${
                          isBlocking
                            ? "border-red-500/20 bg-red-500/5"
                            : "border-amber-500/15 bg-amber-500/5"
                        }`}
                      >
                        <p className="text-sm text-slate-700 leading-snug">{iss.detail}</p>
                        {iss.initiative_id && (
                          <Link
                            to={`/cabinet/exec/initiatives/${iss.initiative_id}`}
                            className="text-xs text-violet-600 hover:text-violet-700 whitespace-nowrap flex items-center gap-1 flex-shrink-0"
                          >
                            Открыть
                            <Icon name="ArrowRight" size={12} />
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Card title="Какие проверки выполняются" icon="ListChecks">
          <div className="grid sm:grid-cols-2 gap-2">
            {Object.entries(RULE_DESCRIPTIONS).map(([code, desc]) => {
              const isBlocking = code.startsWith("E");
              const count = issues.filter((i) => i.code === code).length;
              return (
                <div
                  key={code}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200"
                >
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${
                      isBlocking ? "bg-red-500/15 text-red-600" : "bg-amber-500/15 text-amber-600"
                    }`}
                  >
                    {code}
                  </span>
                  <p className="text-xs text-slate-500 leading-snug flex-1">{desc}</p>
                  {count > 0 ? (
                    <span className="text-xs text-slate-500 flex-shrink-0">{count}</span>
                  ) : (
                    <Icon name="Check" size={12} className="text-green-500 flex-shrink-0 mt-0.5" />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </Layout>
  );
}