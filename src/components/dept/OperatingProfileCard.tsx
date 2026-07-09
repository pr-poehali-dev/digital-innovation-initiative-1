import { useEffect, useState } from "react";
import { deptFunctionsApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import {
  FREQUENCY, VOLUME, SHARE, SLA, PARTICIPANTS, SENSITIVITY, AI_POLICY, DEPLOYMENT,
  SOURCE_KIND, INPUT_TYPES, OUTPUT_TYPES, PAIN_POINTS, type Opt, type OperatingProfile,
} from "@/components/dept/operatingProfileOptions";

interface Props {
  projectId: number;
  functionId: number;
  onSaved?: () => void;
}

const EMPTY: OperatingProfile = { input_types: [], output_types: [], pain_points: [] };

export default function OperatingProfileCard({ projectId, functionId, onSaved }: Props) {
  const [profile, setProfile] = useState<OperatingProfile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState(false);

  useEffect(() => {
    setLoading(true);
    deptFunctionsApi.getOperatingProfile(projectId, functionId)
      .then((d: { profile: OperatingProfile | null }) => {
        setProfile(d.profile || EMPTY);
        setEdit(!d.profile);
      })
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [projectId, functionId]);

  const set = (k: keyof OperatingProfile, v: unknown) => setProfile((p) => ({ ...p, [k]: v }));
  const toggleMulti = (k: keyof OperatingProfile, val: string) =>
    setProfile((p) => {
      const arr = (p[k] as string[]) || [];
      return { ...p, [k]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
    });

  const save = () => {
    setSaving(true);
    deptFunctionsApi.saveOperatingProfile({ project_id: projectId, function_id: functionId, profile: profile as Record<string, unknown> })
      .then(() => { toast({ title: "Профиль сохранён" }); setEdit(false); onSaved?.(); })
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setSaving(false));
  };

  if (loading) return <div className="text-xs text-slate-400 py-2">Загрузка профиля…</div>;

  const SelectField = ({ label, field, opts }: { label: string; field: keyof OperatingProfile; opts: Opt[] }) => (
    <div>
      <div className="text-[11px] text-slate-500 mb-0.5">{label}</div>
      {edit ? (
        <Select value={(profile[field] as string) || ""} onValueChange={(v) => set(field, v)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {opts.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <div className="text-xs text-slate-800">{opts.find((o) => o.value === profile[field])?.label || <span className="text-slate-300">не заполнено</span>}</div>
      )}
    </div>
  );

  const MultiField = ({ label, field, opts }: { label: string; field: keyof OperatingProfile; opts: Opt[] }) => {
    const arr = (profile[field] as string[]) || [];
    return (
      <div>
        <div className="text-[11px] text-slate-500 mb-0.5">{label}</div>
        {edit ? (
          <div className="flex flex-wrap gap-1">
            {opts.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleMulti(field, o.value)}
                className={`text-[11px] px-1.5 py-0.5 rounded border ${arr.includes(o.value) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : arr.length ? (
          <div className="flex flex-wrap gap-1">
            {arr.map((v) => <Badge key={v} variant="secondary" className="text-[10px]">{opts.find((o) => o.value === v)?.label || v}</Badge>)}
          </div>
        ) : <span className="text-xs text-slate-300">не заполнено</span>}
      </div>
    );
  };

  return (
    <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-slate-50/50">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
          <Icon name="Gauge" size={15} /> Операционный профиль
        </div>
        {edit ? (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEdit(false)} disabled={saving}>Отмена</Button>
            <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>Сохранить</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEdit(true)}>
            <Icon name="Pencil" size={12} className="mr-1" /> Редактировать
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2.5">
        <SelectField label="Частота" field="frequency_band" opts={FREQUENCY} />
        <SelectField label="Объём" field="volume_band" opts={VOLUME} />
        <SelectField label="Доля ручного труда" field="manual_share_band" opts={SHARE} />
        <SelectField label="Доля операций по правилам" field="rule_based_share_band" opts={SHARE} />
        <SelectField label="Доля эксперт. суждения" field="expert_judgment_share_band" opts={SHARE} />
        <SelectField label="Частота исключений" field="exception_rate_band" opts={SHARE} />
        <SelectField label="Критичность SLA" field="sla_criticality" opts={SLA} />
        <div>
          <div className="text-[11px] text-slate-500 mb-0.5">Требуется аудит</div>
          {edit ? (
            <Select value={profile.audit_required === true ? "yes" : profile.audit_required === false ? "no" : ""} onValueChange={(v) => set("audit_required", v === "yes" ? true : v === "no" ? false : null)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes" className="text-xs">Да</SelectItem>
                <SelectItem value="no" className="text-xs">Нет</SelectItem>
              </SelectContent>
            </Select>
          ) : <div className="text-xs text-slate-800">{profile.audit_required === true ? "Да" : profile.audit_required === false ? "Нет" : <span className="text-slate-300">не заполнено</span>}</div>}
        </div>
        <SelectField label="Участники" field="participants_band" opts={PARTICIPANTS} />
        <SelectField label="Чувствительность данных" field="sensitive_data_level" opts={SENSITIVITY} />
        <SelectField label="Политика AI" field="ai_policy" opts={AI_POLICY} />
        <SelectField label="Размещение" field="deployment_constraint" opts={DEPLOYMENT} />
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2.5">
        <MultiField label="Входы" field="input_types" opts={INPUT_TYPES} />
        <MultiField label="Выходы" field="output_types" opts={OUTPUT_TYPES} />
      </div>
      <div className="mt-2.5">
        <MultiField label="Боли" field="pain_points" opts={PAIN_POINTS} />
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-x-3 gap-y-2.5">
        <div>
          <div className="text-[11px] text-slate-500 mb-0.5">Задействованные системы</div>
          {edit ? (
            <Input value={profile.systems_involved || ""} onChange={(e) => set("systems_involved", e.target.value)} placeholder="через запятую" className="h-7 text-xs" />
          ) : <div className="text-xs text-slate-800">{profile.systems_involved || <span className="text-slate-300">не заполнено</span>}</div>}
        </div>
        <SelectField label="Источник данных" field="source_kind" opts={SOURCE_KIND} />
        <div>
          <div className="text-[11px] text-slate-500 mb-0.5">Примечание к источнику</div>
          {edit ? (
            <Input value={profile.source_note || ""} onChange={(e) => set("source_note", e.target.value)} className="h-7 text-xs" />
          ) : <div className="text-xs text-slate-800">{profile.source_note || <span className="text-slate-300">не заполнено</span>}</div>}
        </div>
      </div>
    </div>
  );
}
