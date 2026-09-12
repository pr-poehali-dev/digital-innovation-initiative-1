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
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import {
  goalsApi, Indicator, IndicatorDetail, FormulaKind, FORMULA_KIND_LABEL,
} from "@/lib/execGoalsApi";

/** Детальная карточка показателя: методика (версии), значения по периодам,
 * подтверждение факта. Выбор показателя — из выпадающего списка сверху,
 * чтобы не плодить отдельный роутинг внутри вкладки. */
export default function IndicatorValuesTab({ initialId }: { initialId?: number | null }) {
  const [items, setItems] = useState<Indicator[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(initialId ?? null);
  const [detail, setDetail] = useState<IndicatorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [valueFormOpen, setValueFormOpen] = useState(false);
  const [methodologyFormOpen, setMethodologyFormOpen] = useState(false);

  useEffect(() => {
    goalsApi.listIndicators().then((d) => {
      setItems(d.items);
      if (!selectedId && d.items.length) setSelectedId(d.items[0].id);
    }).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = () => {
    if (!selectedId) { setLoading(false); return; }
    setLoading(true);
    setError("");
    goalsApi.indicatorDetail(selectedId).then(setDetail).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(reload, [selectedId]);

  const confirmValue = async (id: number) => {
    await goalsApi.confirmIndicatorValue(id, "confirmed");
    reload();
  };

  return (
    <div className="space-y-4">
      <Select value={selectedId ? String(selectedId) : ""} onValueChange={(v) => setSelectedId(Number(v))}>
        <SelectTrigger className="max-w-md"><SelectValue placeholder="Выберите показатель" /></SelectTrigger>
        <SelectContent>
          {items.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.title}</SelectItem>)}
        </SelectContent>
      </Select>

      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : !detail ? (
        <Empty text="Выберите показатель" icon="Gauge" />
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{detail.title}</p>
                <p className="text-xs text-slate-500 mt-1">
                  База {detail.baseline_value ?? "—"} · Цель {detail.target_value ?? "—"} {detail.unit}
                </p>
              </div>
              <Button size="sm" onClick={() => setValueFormOpen(true)}>
                <Icon name="Plus" size={13} className="mr-1.5" /> Внести значение
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">Методика расчёта</p>
              <Button size="sm" variant="outline" onClick={() => setMethodologyFormOpen(true)}>
                <Icon name="Plus" size={13} className="mr-1.5" /> Новая версия
              </Button>
            </div>
            {!detail.methodology_versions.length ? (
              <div className="p-4"><Empty text="Методика не задана — показатель нельзя пометить автоматически рассчитываемым" icon="FileText" /></div>
            ) : (
              <div className="divide-y divide-slate-100">
                {detail.methodology_versions.map((m) => (
                  <div key={m.id} className="p-3 flex items-center justify-between text-sm">
                    <div>
                      <p className="text-slate-900">v{m.version_number} · {FORMULA_KIND_LABEL[m.formula_kind]}
                        {m.status === "active" && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">активна</span>}
                        {m.status === "superseded" && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">заменена</span>}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{m.description_text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-medium text-slate-900">Значения по периодам</p>
            </div>
            {!detail.values.length ? (
              <div className="p-4"><Empty text="Значений пока нет" icon="Calendar" /></div>
            ) : (
              <div className="divide-y divide-slate-100">
                {detail.values.filter((v) => !v.superseded_by_id).map((v) => (
                  <div key={v.id} className="p-3 flex items-center justify-between text-sm">
                    <div>
                      <p className="text-slate-900">{fmtDate(v.period_start)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        План {v.plan_value ?? "—"} · Факт {v.actual_value ?? "—"} · {v.verification_status}
                      </p>
                    </div>
                    {v.verification_status !== "confirmed" && (
                      <Button size="sm" variant="outline" onClick={() => confirmValue(v.id)}>Подтвердить</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {valueFormOpen && selectedId && (
        <ValueFormDialog indicatorId={selectedId} onClose={() => setValueFormOpen(false)} onSaved={() => { setValueFormOpen(false); reload(); }} />
      )}
      {methodologyFormOpen && selectedId && (
        <MethodologyFormDialog indicatorId={selectedId} onClose={() => setMethodologyFormOpen(false)} onSaved={() => { setMethodologyFormOpen(false); reload(); }} />
      )}
    </div>
  );
}

function ValueFormDialog({ indicatorId, onClose, onSaved }: { indicatorId: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ period_start: "", plan_value: "", actual_value: "", comment: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!form.period_start) { setError("Укажите начало периода"); return; }
    setSaving(true);
    setError("");
    try {
      await goalsApi.saveIndicatorValue({
        indicator_id: indicatorId, period_start: form.period_start,
        plan_value: form.plan_value !== "" ? Number(form.plan_value) : undefined,
        actual_value: form.actual_value !== "" ? Number(form.actual_value) : undefined,
        comment: form.comment || undefined,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Внести значение</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
          <Input type="number" placeholder="План" value={form.plan_value} onChange={(e) => setForm({ ...form, plan_value: e.target.value })} />
          <Input type="number" placeholder="Факт" value={form.actual_value} onChange={(e) => setForm({ ...form, actual_value: e.target.value })} />
          <Textarea placeholder="Комментарий" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} rows={2} />
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

function MethodologyFormDialog({ indicatorId, onClose, onSaved }: { indicatorId: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    description_text: "", formula_kind: "manual" as FormulaKind,
    numerator_desc: "", denominator_desc: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!form.description_text.trim()) { setError("Опишите методику"); return; }
    setSaving(true);
    setError("");
    try {
      await goalsApi.saveMethodology({
        indicator_id: indicatorId, description_text: form.description_text, formula_kind: form.formula_kind,
        numerator_desc: form.numerator_desc || undefined, denominator_desc: form.denominator_desc || undefined,
        status: "active",
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Новая версия методики</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Новая методика создаёт новую версию — прежние значения показателя сохраняют ссылку на версию,
            по которой были рассчитаны, и не пересчитываются задним числом.
          </p>
          <Textarea placeholder="Описание методики" value={form.description_text} onChange={(e) => setForm({ ...form, description_text: e.target.value })} rows={3} />
          <Select value={form.formula_kind} onValueChange={(v) => setForm({ ...form, formula_kind: v as FormulaKind })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(FORMULA_KIND_LABEL) as [FormulaKind, string][]).map(([k, l]) => (
                <SelectItem key={k} value={k}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formula_kind === "ratio" && (
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Числитель" value={form.numerator_desc} onChange={(e) => setForm({ ...form, numerator_desc: e.target.value })} />
              <Input placeholder="Знаменатель" value={form.denominator_desc} onChange={(e) => setForm({ ...form, denominator_desc: e.target.value })} />
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={save} disabled={saving}>Сохранить версию</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
