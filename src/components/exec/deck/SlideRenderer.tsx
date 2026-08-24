import { DashboardData, ModelData } from "@/lib/execCenterApi";
import { DeckSlide, ExpertValue } from "@/lib/execCenterDeckApi";
import { NarrativeBlock, SlideEmptyState, SlideHeader, StatTile } from "./DeckUI";
import {
  CheckpointsList,
  CompetencyMatrix,
  FunctionRoleMatrix,
  HoursByFunctionChart,
  InitiativePortfolio,
  IssuesRisksCompact,
  OrgStructureCompare,
  PlanFactChart,
  ResourceBySourceChart,
  RiskMap,
  RoadmapTimeline,
  StaffingChart,
  TeamLoadChart,
} from "./DeckCharts";
import Icon from "@/components/ui/icon";

export interface SlideContext {
  model: ModelData;
  dashboard: DashboardData;
  expertValues: ExpertValue[];
  onGoto?: (path: string) => void;
}

const num = (v: number | string | null | undefined) => Math.round(Number(v || 0));

function expertFor(ctx: SlideContext, key: string): string | null {
  return ctx.expertValues.find((v) => v.metric_key === key)?.value_text || null;
}

/** Собирает контент слайда по его ключу. Каждый шаблон сам решает, достаточно
 * ли данных для показа — если нет, возвращает SlideEmptyState вместо графика. */
export default function SlideRenderer({ slide, ctx }: { slide: DeckSlide; ctx: SlideContext }) {
  const { model, dashboard } = ctx;
  const title = slide.title_override || slide.catalog_title;
  const center = model.center;

  switch (slide.key) {
    case "cover":
      return (
        <div className="h-full flex flex-col items-center justify-center text-center px-10 bg-gradient-to-br from-violet-700 via-purple-700 to-fuchsia-700 rounded-xl">
          <span className="text-xs font-bold uppercase tracking-[0.25em] text-white/70 mb-4">
            Обоснование создания
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight max-w-3xl" style={{ fontFamily: "'Montserrat',sans-serif" }}>
            {center?.title || "Центр не создан"}
          </h1>
          {slide.thesis_text && <p className="text-lg text-white/85 mt-5 max-w-2xl">{slide.thesis_text}</p>}
        </div>
      );

    case "premises":
      if (!center?.problem_statement && !center?.rationale) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState
              text="Проблема и обоснование создания ещё не заполнены в паспорте Центра"
              actionLabel="Заполнить паспорт"
              onAction={() => ctx.onGoto?.("/cabinet/exec/center")}
            />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind="fact">
          <div className="space-y-4">
            {center.problem_statement && (
              <TextCard label="Проблема" text={center.problem_statement} />
            )}
            {center.rationale && (
              <TextCard label="Почему нужен отдельный центр" text={center.rationale} />
            )}
          </div>
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );

    case "current_activity": {
      const hasData = dashboard.initiatives.length > 0 || dashboard.checkpoints.length > 0;
      if (!hasData) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState
              text="Инициативы и контрольные точки Центра ещё не привязаны"
              actionLabel="Открыть инициативы"
              onAction={() => ctx.onGoto?.("/cabinet/exec/initiatives")}
            />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind="fact">
          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            <StatTile label="Инициатив" value={dashboard.initiatives.length} />
            <StatTile label="Задач выполнено" value={dashboard.results.steps_done} />
            <StatTile
              label="Просрочено задач"
              value={dashboard.results.steps_overdue}
              tone={dashboard.results.steps_overdue ? "danger" : "default"}
            />
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            <InitiativePortfolio initiatives={dashboard.initiatives} />
            <CheckpointsList checkpoints={dashboard.checkpoints} />
          </div>
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );
    }

    case "current_problems": {
      if (!model.status_quo_risks.length) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState text="Риски рассчитываются автоматически, когда описаны функции и участники команды" />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind="calc">
          <RiskMap risks={model.status_quo_risks} />
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );
    }

    case "goals":
      if (!dashboard.goals.length) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState
              text="Цели Центра ещё не заданы"
              actionLabel="Добавить цели"
              onAction={() => ctx.onGoto?.("/cabinet/exec/center")}
            />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind="fact">
          <div className="space-y-2">
            {dashboard.goals.map((g) => (
              <div key={g.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
                <p className="text-sm font-medium text-slate-900">{g.title}</p>
                {g.metric && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {g.metric}: {g.baseline_value || "—"} → {g.target_value || "—"}
                  </p>
                )}
              </div>
            ))}
          </div>
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );

    case "functions":
      if (!dashboard.functions.length) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState
              text="Функции Центра ещё не описаны"
              actionLabel="Добавить функции"
              onAction={() => ctx.onGoto?.("/cabinet/exec/center")}
            />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind="fact">
          <HoursByFunctionChart functions={dashboard.functions} />
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );

    case "team":
      if (!model.current_team.participation.length) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState
              text="Участие сотрудников распределённой команды в модели Центра ещё не описано"
              actionLabel="Открыть модель Центра"
              onAction={() => ctx.onGoto?.("/cabinet/exec/model")}
            />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind="fact">
          <div className="grid md:grid-cols-2 gap-5">
            <TeamLoadChart participation={model.current_team.participation} />
            <ResourceBySourceChart participation={model.current_team.participation} />
          </div>
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );

    case "workload": {
      const plan = num(dashboard.labor.plan_hours);
      const fact = num(dashboard.labor.fact_hours);
      if (!plan && !fact) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState
              text="Плановые и фактические трудозатраты пока не внесены"
              actionLabel="Открыть загрузку команды"
              onAction={() => ctx.onGoto?.("/cabinet/exec/workload")}
            />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind="fact">
          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            <StatTile label="Плановые часы" value={plan} />
            <StatTile label="Фактические часы" value={fact} />
            <StatTile label="Исполнение" value={plan ? `${Math.round((fact / plan) * 100)}%` : "—"} />
          </div>
          <PlanFactChart planHours={plan} factHours={fact} />
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );
    }

    case "target_structure":
      if (!model.target.roles.length && !model.current_team.participation.length) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState
              text="Целевая структура ещё не описана"
              actionLabel="Добавить штатные позиции"
              onAction={() => ctx.onGoto?.("/cabinet/exec/center")}
            />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind="target">
          <OrgStructureCompare participation={model.current_team.participation} roles={model.target.roles} />
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );

    case "staffing": {
      const s = model.staffing;
      if (!s.total_hours) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState
              text="Расчёт численности появится, когда будут описаны функции с трудоёмкостью"
              actionLabel="Добавить функции"
              onAction={() => ctx.onGoto?.("/cabinet/exec/center")}
            />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind="calc">
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 mb-4">
            <p className="text-sm text-violet-900 font-medium">
              Требуемая численность = годовая трудоёмкость / полезный годовой фонд времени
            </p>
            <p className="text-xs text-violet-700 mt-1">
              {s.base_total_hours} ч базовых функций + {s.reserve_hours} ч резерва ({s.reserve_pct}%)
              + {s.backup_hours} ч замещения ({s.backup_coverage_pct}%) = {s.total_hours} ч ÷{" "}
              {s.annual_fund_hours} ч фонда = <b>{s.required_fte} ставки</b>
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            <StatTile label="Требуется ставок" value={s.required_fte} tone="highlight" />
            <StatTile label="Доступно от команды" value={s.available_fte} />
            <StatTile label="Дефицит" value={s.deficit_fte} tone={s.deficit_fte > 0 ? "warning" : "default"} />
          </div>
          <StaffingChart staffing={s} />
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );
    }

    case "competencies":
      if (!dashboard.coverage.length) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState
              text="Требования к компетенциям функций ещё не заданы"
              actionLabel="Открыть функции Центра"
              onAction={() => ctx.onGoto?.("/cabinet/exec/center")}
            />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind="fact">
          <CompetencyMatrix coverage={dashboard.coverage} />
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );

    case "comparison":
      if (!model.target.functions.length) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState text="Сравнение появится, когда описаны функции" />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind="calc">
          <FunctionRoleMatrix functions={model.target.functions} />
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );

    case "effects": {
      const val = center?.expected_effects || expertFor(ctx, "expected_effects");
      if (!val) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState
              text="Ожидаемые эффекты ещё не сформулированы"
              actionLabel="Заполнить в паспорте Центра"
              onAction={() => ctx.onGoto?.("/cabinet/exec/center")}
            />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind={center?.expected_effects ? "fact" : "expert"}>
          <TextCard label="Ожидаемые эффекты" text={val} />
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );
    }

    case "risks":
      if (!model.status_quo_risks.length && !dashboard.risks.length && !dashboard.issues.length) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState text="Риски отказа от создания Центра пока не выявлены" />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind="calc">
          <RiskMap risks={model.status_quo_risks} />
          <div className="mt-4">
            <IssuesRisksCompact risks={dashboard.risks} issues={dashboard.issues} />
          </div>
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );

    case "roadmap": {
      const val = center?.roadmap_text || expertFor(ctx, "roadmap_text");
      if (!val) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState
              text="Дорожная карта создания ещё не заполнена"
              actionLabel="Заполнить в паспорте Центра"
              onAction={() => ctx.onGoto?.("/cabinet/exec/center")}
            />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind={center?.roadmap_text ? "expert" : "expert"}>
          <RoadmapTimeline text={val} />
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );
    }

    case "decisions":
      if (!slide.narrative_text) {
        return (
          <Slide title={title} thesis={slide.thesis_text}>
            <SlideEmptyState text="Сформулируйте, какие решения требуются от руководства, в поле «Текстовые выводы» этого слайда" />
          </Slide>
        );
      }
      return (
        <Slide title={title} thesis={slide.thesis_text} kind="expert">
          <NarrativeBlock text={slide.narrative_text} />
        </Slide>
      );

    default:
      return (
        <Slide title={title} thesis={slide.thesis_text}>
          <SlideEmptyState text="Шаблон слайда не найден" />
        </Slide>
      );
  }
}

function Slide({
  title,
  thesis,
  kind,
  children,
}: {
  title: string;
  thesis?: string | null;
  kind?: "fact" | "calc" | "expert" | "target";
  children: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col p-8 md:p-10 bg-white overflow-y-auto">
      <SlideHeader title={title} thesis={thesis} kind={kind} />
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}

function TextCard({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1.5">
        <Icon name="FileText" size={12} />
        {label}
      </p>
      <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">{text}</p>
    </div>
  );
}
