import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { RoadmapFilters as Filters } from "@/lib/execRoadmapApi";

const PROJECT_STATUS_OPTIONS = [
  { value: "idea", label: "Идея" }, { value: "planned", label: "Запланирован" },
  { value: "in_progress", label: "В работе" }, { value: "on_hold", label: "Приостановлен" },
  { value: "completed", label: "Завершён" }, { value: "cancelled", label: "Отменён" },
];
const MILESTONE_STATUS_OPTIONS = [
  { value: "not_started", label: "Не начата" }, { value: "in_progress", label: "В работе" },
  { value: "achieved", label: "Достигнута" }, { value: "cancelled", label: "Отменена" },
];
const KIND_OPTIONS = [
  { value: "project", label: "Проект" }, { value: "event", label: "Мероприятие" },
  { value: "analysis", label: "Аналитическая работа" }, { value: "org_change", label: "Оргизменение" },
  { value: "regular_activity", label: "Регулярная активность" },
];
const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Срочный" }, { value: "high", label: "Высокий" },
  { value: "normal", label: "Обычный" }, { value: "low", label: "Низкий" },
];

/** Фильтры дорожной карты/шкалы вех. Значения синхронизированы с URL на
 * уровне родительской страницы — компонент только отображает и вызывает
 * onChange, состояние фильтров не хранит сам. */
export default function RoadmapFiltersBar({
  filters, onChange, initiatives, showMilestoneStatus = false,
}: {
  filters: Filters & { milestone_status?: string };
  onChange: (next: Partial<Filters> & { milestone_status?: string }) => void;
  initiatives: { id: number; title: string }[];
  showMilestoneStatus?: boolean;
}) {
  const activeCount = Object.values(filters).filter((v) => v !== undefined && v !== "" && v !== false).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filters.initiative_id ? String(filters.initiative_id) : "all"}
              onValueChange={(v) => onChange({ initiative_id: v === "all" ? undefined : Number(v) })}>
        <SelectTrigger className="h-8 w-auto text-xs min-w-[140px]"><SelectValue placeholder="Инициатива" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все инициативы</SelectItem>
          {initiatives.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.title}</SelectItem>)}
        </SelectContent>
      </Select>

      {!showMilestoneStatus && (
        <Select value={filters.project_kind || "all"} onValueChange={(v) => onChange({ project_kind: v === "all" ? undefined : v })}>
          <SelectTrigger className="h-8 w-auto text-xs min-w-[120px]"><SelectValue placeholder="Тип работы" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            {KIND_OPTIONS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <Select value={filters.status || "all"} onValueChange={(v) => onChange({ status: v === "all" ? undefined : v })}>
        <SelectTrigger className="h-8 w-auto text-xs min-w-[120px]"><SelectValue placeholder="Статус" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все статусы</SelectItem>
          {(showMilestoneStatus ? MILESTONE_STATUS_OPTIONS : PROJECT_STATUS_OPTIONS).map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!showMilestoneStatus && (
        <Select value={filters.priority || "all"} onValueChange={(v) => onChange({ priority: v === "all" ? undefined : v })}>
          <SelectTrigger className="h-8 w-auto text-xs min-w-[110px]"><SelectValue placeholder="Приоритет" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любой приоритет</SelectItem>
            {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <FilterToggle active={!!filters.overdue_only} label="Просроченные" icon="CalendarX"
                    onClick={() => onChange({ overdue_only: !filters.overdue_only })} />
      {!showMilestoneStatus && (
        <>
          <FilterToggle active={!!filters.critical_risk_only} label="Критич. риски" icon="TriangleAlert"
                        onClick={() => onChange({ critical_risk_only: !filters.critical_risk_only })} />
          <FilterToggle active={!!filters.resource_gap_only} label="Дефицит ресурсов" icon="UserX"
                        onClick={() => onChange({ resource_gap_only: !filters.resource_gap_only })} />
          <FilterToggle active={!!filters.overbudget_only} label="Перерасход" icon="TrendingUp"
                        onClick={() => onChange({ overbudget_only: !filters.overbudget_only })} />
        </>
      )}

      {activeCount > 0 && (
        <Button size="sm" variant="ghost" className="h-8 text-xs text-slate-400" onClick={() => onChange({
          initiative_id: undefined, project_kind: undefined, status: undefined, priority: undefined,
          overdue_only: false, critical_risk_only: false, resource_gap_only: false, overbudget_only: false,
        })}>
          Сбросить
        </Button>
      )}
    </div>
  );
}

function FilterToggle({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 px-2.5 text-xs rounded-md border flex items-center gap-1.5 transition-colors ${
        active ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
      }`}
    >
      <Icon name={icon} size={12} /> {label}
    </button>
  );
}