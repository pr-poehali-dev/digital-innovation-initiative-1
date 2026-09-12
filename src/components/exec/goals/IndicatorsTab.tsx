import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";
import {
  goalsApi, Indicator, IndicatorType, ImprovementDirection,
  INDICATOR_TYPE_LABEL, IMPROVEMENT_DIRECTION_LABEL, STATUS_COLOR_LABEL,
} from "@/lib/execGoalsApi";

const TYPES: IndicatorType[] = ["kpi", "performance", "effect", "process", "quality",
  "deadline", "financial", "resource", "risk", "informational"];
const DIRECTIONS: ImprovementDirection[] = ["higher_is_better", "lower_is_better", "in_range", "target_exact", "observe_only"];

const DOT_CLS: Record<string, string> = {
  green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-red-500", gray: "bg-slate-300",
};

/** Единый реестр показателей (KPI, эффект, процессный и т.д.) со светофором
 * и предупреждениями качества данных. */
export default function IndicatorsTab({ onOpenIndicator }: { onOpenIndicator: (id: number) => void }) {
  const [items, setItems] = useState<Indicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Indicator | null>(null);

  const reload = () => {
    setLoading(true);
    setError("");
    goalsApi.listIndicators().then((d) => setItems(d.items)).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, []);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Icon name="Plus" size={14} className="mr-1.5" /> Новый показатель
        </Button>
      </div>

      {!items.length ? <Empty text="Показателей пока нет" icon="Gauge" /> : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {items.map((i) => (
            <div key={i.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50">
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onOpenIndicator(i.id)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-block w-2 h-2 rounded-full ${DOT_CLS[i.status_light.color]}`} />
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{INDICATOR_TYPE_LABEL[i.indicator_type]}</span>
                  <span className="text-[10px] text-slate-400">{IMPROVEMENT_DIRECTION_LABEL[i.improvement_direction]}</span>
                </div>
                <p className="text-sm text-slate-900 mt-1">{i.title}</p>
                {i.data_quality_warnings.length > 0 && (
                  <p className="text-xs text-amber-700 mt-0.5">{i.data_quality_warnings.join(" · ")}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-medium text-slate-900">
                  {i.status_light.actual != null ? `${i.status_light.actual} ${i.unit || ""}` : "—"}
                </p>
                <p className="text-xs text-slate-400">план {i.status_light.plan ?? "—"}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => { setEditing(i); setFormOpen(true); }}>
                <Icon name="Pencil" size={13} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-slate-400">
        {Object.entries(STATUS_COLOR_LABEL).map(([c, l]) => (
          <span key={c} className="inline-flex items-center gap-1 mr-3">
            <span className={`inline-block w-2 h-2 rounded-full ${DOT_CLS[c]}`} /> {l}
          </span>
        ))}
      </div>

      {formOpen && (
        <IndicatorFormDialog
          indicator={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

function IndicatorFormDialog({
  indicator, onClose, onSaved,
}: { indicator: Indicator | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: indicator?.title || "", purpose: indicator?.purpose || "",
    indicator_type: indicator?.indicator_type || "kpi",
    improvement_direction: indicator?.improvement_direction || "higher_is_better",
    unit: indicator?.unit || "", data_source: indicator?.data_source || "",
    baseline_value: indicator?.baseline_value ?? "", target_value: indicator?.target_value ?? "",
    threshold_yellow: indicator?.threshold_yellow ?? "", threshold_red: indicator?.threshold_red ?? "",
    range_min: indicator?.range_min ?? "", range_max: indicator?.range_max ?? "",
    periodicity: indicator?.periodicity || "monthly",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const num = (v: string | number) => (v === "" ? undefined : Number(v));

  const save = async () => {
    if (!form.title.trim()) { setError("Укажите название показателя"); return; }
    setSaving(true);
    setError("");
    try {
      await goalsApi.saveIndicator({
        id: indicator?.id, title: form.title, purpose: form.purpose || undefined,
        indicator_type: form.indicator_type as IndicatorType,
        improvement_direction: form.improvement_direction as ImprovementDirection,
        unit: form.unit || undefined, data_source: form.data_source || undefined,
        baseline_value: num(form.baseline_value), target_value: num(form.target_value),
        threshold_yellow: num(form.threshold_yellow), threshold_red: num(form.threshold_red),
        range_min: num(form.range_min), range_max: num(form.range_max),
        periodicity: form.periodicity,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const isRange = form.improvement_direction === "in_range";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{indicator ? "Изменить показатель" : "Новый показатель"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Название показателя" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea placeholder="Назначение" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} rows={2} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.indicator_type} onValueChange={(v) => setForm({ ...form, indicator_type: v as IndicatorType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{INDICATOR_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={form.improvement_direction} onValueChange={(v) => setForm({ ...form, improvement_direction: v as ImprovementDirection })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DIRECTIONS.map((d) => <SelectItem key={d} value={d}>{IMPROVEMENT_DIRECTION_LABEL[d]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Единица измерения" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <Select value={form.periodicity} onValueChange={(v) => setForm({ ...form, periodicity: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Дата</SelectItem>
                <SelectItem value="monthly">Месяц</SelectItem>
                <SelectItem value="quarterly">Квартал</SelectItem>
                <SelectItem value="yearly">Год</SelectItem>
                <SelectItem value="custom">Произвольный</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input placeholder="Источник данных" value={form.data_source} onChange={(e) => setForm({ ...form, data_source: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="Базовое значение" value={form.baseline_value} onChange={(e) => setForm({ ...form, baseline_value: e.target.value })} />
            {!isRange && (
              <Input type="number" placeholder="Целевое значение" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} />
            )}
          </div>
          {isRange ? (
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder="Мин. диапазона" value={form.range_min} onChange={(e) => setForm({ ...form, range_min: e.target.value })} />
              <Input type="number" placeholder="Макс. диапазона" value={form.range_max} onChange={(e) => setForm({ ...form, range_max: e.target.value })} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder="Порог «жёлтый»" value={form.threshold_yellow} onChange={(e) => setForm({ ...form, threshold_yellow: e.target.value })} />
              <Input type="number" placeholder="Порог «красный»" value={form.threshold_red} onChange={(e) => setForm({ ...form, threshold_red: e.target.value })} />
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={save} disabled={saving}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
