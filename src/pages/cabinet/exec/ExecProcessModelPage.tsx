import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Loading, ErrorBox, Empty } from "@/components/exec/ExecUI";
import { processModelApi, Overview, Refs, ClarificationNote } from "@/lib/execProcessModelApi";
import { PROCESS_MODEL_WIZARD_GUIDE, getWizardStage, WizardStageCode } from "@/config/processModelWizardGuide";
import WizardAssistant from "@/components/exec/processModel/WizardAssistant";
import FunctionsManager from "@/components/exec/processModel/FunctionsManager";
import ArchitectureManager from "@/components/exec/processModel/ArchitectureManager";

type TopTab = "overview" | "wizard" | "documents" | "functions" | "architecture" | "questions";

const TOP_TABS: { id: TopTab; label: string; icon: string }[] = [
  { id: "overview", label: "Обзор модели", icon: "LayoutDashboard" },
  { id: "wizard", label: "Помощник построения", icon: "Compass" },
  { id: "documents", label: "Документы", icon: "FileText" },
  { id: "functions", label: "Функции", icon: "ListTree" },
  { id: "architecture", label: "Архитектура процессов", icon: "Network" },
  { id: "questions", label: "Вопросы на уточнение", icon: "HelpCircle" },
];

function OverviewScreen({ overview, onNavigate }: { overview: Overview; onNavigate: (tab: TopTab, stageCode?: string) => void }) {
  const m = overview.metrics;

  const metricCards = [
    { label: "Функций", value: m.functions_total, sub: `подтверждено: ${m.functions_confirmed}`, icon: "ListTree", tone: "default" as const },
    { label: "Процессов и подпроцессов", value: m.processes_total, sub: Object.entries(m.processes_by_level).map(([k, v]) => `${k}: ${v}`).join(", ") || "пока нет", icon: "Network", tone: "default" as const },
    { label: "Паспорта заполнены", value: m.passports_filled, icon: "IdCard", tone: "default" as const },
    { label: "Схемы AS-IS / TO-BE", value: `${m.diagrams_as_is} / ${m.diagrams_to_be}`, icon: "GitBranch", tone: "default" as const },
    { label: "Риски без контролей", value: m.risks_without_controls, icon: "ShieldAlert", tone: m.risks_without_controls > 0 ? "danger" as const : "success" as const },
    { label: "Процессы без владельца", value: m.processes_without_owner, icon: "UserX", tone: m.processes_without_owner > 0 ? "warning" as const : "success" as const },
    { label: "Документы без подтверждения", value: m.docs_need_confirmation, icon: "FileWarning", tone: m.docs_need_confirmation > 0 ? "warning" as const : "success" as const },
    { label: "Открытые вопросы", value: m.open_questions, icon: "HelpCircle", tone: m.open_questions > 0 ? "warning" as const : "success" as const },
  ];

  const toneCls = {
    default: "border-slate-200 bg-white",
    danger: "border-red-200 bg-red-50",
    warning: "border-amber-200 bg-amber-50",
    success: "border-green-200 bg-green-50",
  };
  const valueCls = {
    default: "text-slate-900",
    danger: "text-red-700",
    warning: "text-amber-700",
    success: "text-green-700",
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <p className="text-xs font-medium text-violet-600 uppercase tracking-wide">Карта модели</p>
            <h2 className="text-lg font-semibold text-slate-900 mt-0.5">Блок внутреннего контроля</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-28 h-2 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${overview.progress_pct}%` }} />
            </div>
            <span className="text-sm font-medium text-violet-700">{overview.progress_pct}%</span>
          </div>
        </div>

        <div className="flex flex-wrap items-stretch gap-2">
          <div className="rounded-xl border border-violet-300 bg-white px-4 py-3 flex items-center gap-2">
            <Icon name="Shield" size={16} className="text-violet-600" />
            <span className="text-sm font-semibold text-slate-900">Блок ВК</span>
          </div>
          <div className="flex items-center text-violet-300"><Icon name="ArrowRight" size={16} /></div>
          <div className="flex flex-wrap gap-2 items-center">
            {overview.units.filter((u) => u.decision === "included").map((u) => (
              <div key={u.org_unit_id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${u.confirmation_status === "confirmed" ? "bg-green-500" : "bg-amber-400"}`} />
                <span className="text-xs font-medium text-slate-700">{u.short_name || u.code || u.name}</span>
              </div>
            ))}
            {overview.units.length === 0 && (
              <span className="text-xs text-slate-400">Состав ещё не подтверждён</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metricCards.map((c) => (
          <div key={c.label} className={`rounded-xl border p-3.5 ${toneCls[c.tone]}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] text-slate-500 leading-snug">{c.label}</p>
              <Icon name={c.icon} size={14} className="text-slate-400 flex-shrink-0" />
            </div>
            <p className={`text-xl font-semibold mt-1.5 ${valueCls[c.tone]}`}>{c.value}</p>
            {c.sub && <p className="text-[10px] text-slate-400 mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Путь построения модели</p>
        <div className="flex flex-wrap gap-2">
          {overview.stages.map((s, i) => (
            <div key={s.code} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
                s.done ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-slate-50 text-slate-500"
              }`}>
                <Icon name={s.done ? "CheckCircle2" : "Circle"} size={12} />
                {s.label}
              </div>
              {i < overview.stages.length - 1 && <Icon name="ChevronRight" size={12} className="text-slate-300" />}
            </div>
          ))}
        </div>
      </div>

      {overview.next_step && (
        <div className="rounded-xl border border-violet-300 bg-violet-50 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
              <Icon name="Sparkles" size={17} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-violet-600 font-medium uppercase tracking-wide">Следующий рекомендуемый шаг</p>
              <p className="text-sm font-semibold text-slate-900 mt-0.5">{overview.next_step.label}</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate("wizard", overview.next_step!.code)}
            className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors flex items-center gap-1.5"
          >
            Перейти
            <Icon name="ArrowRight" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function WizardScreen({
  scopeId,
  refs,
  initialStage,
}: {
  scopeId: number;
  refs: Refs | null;
  initialStage: WizardStageCode | null;
}) {
  const nav = useNavigate();
  const [stageCode, setStageCode] = useState<WizardStageCode>(initialStage || "boundaries");
  const stage = getWizardStage(stageCode);

  useEffect(() => {
    if (initialStage) setStageCode(initialStage);
  }, [initialStage]);

  return (
    <div className="grid md:grid-cols-[220px_1fr_300px] gap-4 items-start">
      <div className="space-y-1">
        {PROCESS_MODEL_WIZARD_GUIDE.map((s) => (
          <button
            key={s.code}
            onClick={() => setStageCode(s.code)}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
              stageCode === s.code
                ? "bg-violet-100 text-violet-700 font-medium"
                : s.available
                  ? "text-slate-600 hover:bg-slate-50"
                  : "text-slate-350 text-slate-400 hover:bg-slate-50"
            }`}
          >
            <Icon name={s.icon} size={13} className="flex-shrink-0" />
            <span className="flex-1 truncate">{s.shortTitle}</span>
            {!s.available && <Icon name="Lock" size={10} className="text-slate-300 flex-shrink-0" />}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 min-h-[420px]">
        <div className="flex items-center gap-2 mb-1">
          <Icon name={stage.icon} size={16} className="text-violet-600" />
          <h3 className="text-base font-semibold text-slate-900">{stage.title}</h3>
        </div>
        {stage.code === "boundaries" && (
          <div className="mt-4 text-sm text-slate-600 leading-relaxed space-y-3">
            <p>
              Этот этап уже реализован как отдельный обучающий мастер и включён в общий маршрут
              первым шагом. Откройте его, чтобы проверить или завершить состав, назначение и
              документы Блока ВК.
            </p>
          </div>
        )}
        {stage.code === "functions" && <FunctionsManager scopeId={scopeId} canEdit={!!refs?.can_edit} />}
        {stage.code === "architecture" && <ArchitectureManager scopeId={scopeId} canEdit={!!refs?.can_edit} canConfirm={!!refs?.can_confirm} />}
        {stage.code === "passports" && (
          <div className="mt-4 text-sm text-slate-600 leading-relaxed">
            <p>Паспорт заполняется внутри карточки конкретного процесса — откройте раздел «Архитектура процессов», выберите процесс и перейдите на вкладку «Паспорт».</p>
            <button onClick={() => nav("/cabinet/exec/process-model?tab=architecture")}
              className="mt-3 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-700 flex items-center gap-1.5">
              Открыть архитектуру процессов <Icon name="ArrowRight" size={12} />
            </button>
          </div>
        )}
        {stage.code === "documents" && (
          <div className="mt-4 text-sm text-slate-600 leading-relaxed">
            <p>Реестр документов ведётся на отдельной вкладке «Документы» — там же, где загружались документы на этапе границ.</p>
            <button onClick={() => nav("/cabinet/exec/process-model?tab=documents")}
              className="mt-3 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-700 flex items-center gap-1.5">
              Открыть документы <Icon name="ArrowRight" size={12} />
            </button>
          </div>
        )}
        {!stage.available && stage.code !== "boundaries" && stage.code !== "documents" && (
          <div className="mt-8 flex flex-col items-center text-center py-10">
            <Icon name="Construction" size={28} className="text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 max-w-md">
              Этот раздел маршрута появится в следующей итерации разработки контура «Процессное управление».
            </p>
          </div>
        )}
      </div>

      <WizardAssistant
        stage={stage}
        scopeId={scopeId}
        onNavigate={(path) => {
          if (path === "/cabinet/exec/process-model/block-vk") { nav(path); return; }
          const url = new URL(path, window.location.origin);
          const tab = url.searchParams.get("tab");
          if (tab) {
            nav(`/cabinet/exec/process-model?tab=${tab}`);
          } else {
            nav(path);
          }
        }}
      />
    </div>
  );
}

function QuestionsScreen({ scopeId }: { scopeId: number }) {
  const [items, setItems] = useState<ClarificationNote[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    processModelApi.clarificationNotes(scopeId).then((r) => setItems(r.items)).finally(() => setLoading(false));
  };
  useEffect(load, [scopeId]);

  const resolve = async (id: number) => {
    await processModelApi.resolveClarificationNote(id);
    load();
  };

  if (loading) return <Loading />;

  const open = items.filter((i) => i.status === "open");
  const resolved = items.filter((i) => i.status === "resolved");

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Пометки «требует уточнения», созданные помощником вместо придуманных данных. Это отдельный
        лёгкий список — не дублирует «Реестр вопросов» портфеля инициатив.
      </p>
      {open.length === 0 ? (
        <Empty text="Открытых вопросов нет" icon="CheckCircle2" />
      ) : (
        <div className="space-y-2">
          {open.map((n) => (
            <div key={n.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-amber-900">{n.question}</p>
                <p className="text-[10px] text-amber-600 mt-1">{n.entity_type} · {n.created_by}</p>
              </div>
              <button onClick={() => resolve(n.id)}
                className="text-xs px-2.5 py-1 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-100 flex-shrink-0">
                Отметить решённым
              </button>
            </div>
          ))}
        </div>
      )}
      {resolved.length > 0 && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer">Решённые ({resolved.length})</summary>
          <div className="mt-2 space-y-1.5">
            {resolved.map((n) => (
              <div key={n.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-500">
                {n.question}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function ExecProcessModelPage() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [refs, setRefs] = useState<Refs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const tab = (searchParams.get("tab") as TopTab) || "overview";
  const stageParam = searchParams.get("stage") as WizardStageCode | null;

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([processModelApi.overview(), processModelApi.refs()])
      .then(([o, r]) => { setOverview(o); setRefs(r); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const setTab = (t: TopTab, stage?: string) => {
    const params: Record<string, string> = { tab: t };
    if (stage) params.stage = stage;
    setSearchParams(params);
  };

  if (loading) {
    return <Layout><Loading /></Layout>;
  }
  if (error) {
    return <Layout><div className="max-w-3xl mx-auto px-4 py-10"><ErrorBox message={error} onRetry={load} /></div></Layout>;
  }

  if (!overview || !overview.scope) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Icon name="Network" size={32} className="text-slate-300 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-900">Модель ещё не создана</h1>
          <p className="text-sm text-slate-500 mt-1.5 mb-4">
            Начните с мастера границ Блока ВК — он создаст паспорт модели, на котором строится весь маршрут.
          </p>
          <button onClick={() => nav("/cabinet/exec/process-model/block-vk")}
            className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700">
            Открыть мастер границ
          </button>
        </div>
      </Layout>
    );
  }

  const scopeId = overview.scope.id as number;

  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <header className="mb-4">
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Icon name="Network" size={22} className="text-violet-600" />
            Процессное управление
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Единый раздел построения процессной модели Блока внутреннего контроля — от границ до публикации.
          </p>
        </header>

        <div className="border-b border-slate-200 mb-5 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {TOP_TABS.map((t) => (
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
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "overview" && <OverviewScreen overview={overview} onNavigate={setTab} />}
        {tab === "wizard" && <WizardScreen scopeId={scopeId} refs={refs} initialStage={stageParam} />}
        {tab === "documents" && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <Icon name="FileText" size={24} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500 mb-3">
              Реестр документов ведётся в мастере границ Блока ВК (шаг «Нормативные документы») —
              он общий для всего контура.
            </p>
            <button onClick={() => nav("/cabinet/exec/process-model/block-vk")}
              className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-700">
              Открыть документы в мастере границ
            </button>
          </div>
        )}
        {tab === "functions" && <FunctionsManager scopeId={scopeId} canEdit={!!refs?.can_edit} />}
        {tab === "architecture" && <ArchitectureManager scopeId={scopeId} canEdit={!!refs?.can_edit} canConfirm={!!refs?.can_confirm} />}
        {tab === "questions" && <QuestionsScreen scopeId={scopeId} />}
      </div>
    </Layout>
  );
}