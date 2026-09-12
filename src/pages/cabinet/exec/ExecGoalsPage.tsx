import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { ErrorBox, Loading } from "@/components/exec/ExecUI";
import PageGuide from "@/components/exec/PageGuide";
import { execPageGuides } from "@/config/execPageGuides";
import { centerApi, Center } from "@/lib/execCenterApi";
import GoalsOverviewTab from "@/components/exec/goals/GoalsOverviewTab";
import GoalsTreeTab from "@/components/exec/goals/GoalsTreeTab";
import GoalsRegistryTab from "@/components/exec/goals/GoalsRegistryTab";
import IndicatorsTab from "@/components/exec/goals/IndicatorsTab";
import IndicatorValuesTab from "@/components/exec/goals/IndicatorValuesTab";
import ResultsEffectsTab from "@/components/exec/goals/ResultsEffectsTab";
import GoalsSnapshotsTab from "@/components/exec/goals/GoalsSnapshotsTab";
import GoalsHistoryTab from "@/components/exec/goals/GoalsHistoryTab";

export type GoalsSubTab = "overview" | "tree" | "goals" | "indicators" | "values" | "results" | "effects" | "methodologies" | "snapshots" | "history";

const TABS: { id: GoalsSubTab; title: string; icon: string }[] = [
  { id: "overview", title: "Главная", icon: "LayoutDashboard" },
  { id: "tree", title: "Дерево целей", icon: "GitBranch" },
  { id: "goals", title: "Реестр целей", icon: "Target" },
  { id: "indicators", title: "Показатели", icon: "Gauge" },
  { id: "values", title: "Значения и методики", icon: "TrendingUp" },
  { id: "results", title: "Результаты", icon: "FileCheck" },
  { id: "effects", title: "Эффекты", icon: "Sparkles" },
  { id: "snapshots", title: "Дашборд и снимки", icon: "Camera" },
  { id: "history", title: "История", icon: "History" },
];

/** Раздел «Цели и показатели»: иерархия целей, единый реестр KPI/показателей,
 * значения по периодам, версионируемые методики, результаты/эффекты
 * (переиспользует exec_result/exec_effect), неизменяемые снимки отчёта.
 * Backend — расширение exec-center, новую cloud function не создаёт. */
export default function ExecGoalsPage() {
  const [center, setCenter] = useState<Center | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<GoalsSubTab>("overview");

  const reload = () => {
    setLoading(true);
    setError("");
    centerApi.list()
      .then((centers) => setCenter(centers.find((c) => c.status !== "archived") || centers[0] || null))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  if (loading) {
    return <Layout><Loading /></Layout>;
  }
  if (error) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-10">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      </Layout>
    );
  }
  if (!center) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Icon name="Target" size={32} className="text-slate-300 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-900">Центр ещё не создан</h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Цели и показатели строятся поверх паспорта Центра — сначала создайте его на
            странице «Центр цифровизации».
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900">Цели и показатели</h1>
            <p className="text-sm text-slate-500 mt-1">
              {center.title} — стратегическая цель → цель Центра → функция → инициатива → проект → результат → эффект → показатель
            </p>
          </div>
        </header>

        <div className="mb-5">
          <PageGuide {...execPageGuides.goals} />
        </div>

        <div className="border-b border-slate-200 mb-5 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors inline-flex items-center gap-1.5 ${
                  tab === t.id
                    ? "border-violet-600 text-violet-700 font-medium"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon name={t.icon} size={14} />
                {t.title}
              </button>
            ))}
          </div>
        </div>

        {tab === "overview" && <GoalsOverviewTab centerId={center.id} onNavigate={setTab} />}
        {tab === "tree" && <GoalsTreeTab centerId={center.id} onOpenGoal={() => setTab("goals")} />}
        {tab === "goals" && <GoalsRegistryTab centerId={center.id} onOpenGoal={() => setTab("goals")} />}
        {tab === "indicators" && <IndicatorsTab onOpenIndicator={() => setTab("values")} />}
        {tab === "values" && <IndicatorValuesTab />}
        {tab === "results" && <ResultsEffectsTab mode="results" />}
        {tab === "effects" && <ResultsEffectsTab mode="effects" />}
        {tab === "snapshots" && <GoalsSnapshotsTab centerId={center.id} />}
        {tab === "history" && <GoalsHistoryTab />}
      </div>
    </Layout>
  );
}