import { useEffect, useState } from "react";
import { workspaceApi } from "@/lib/api";
import Icon from "@/components/ui/icon";

type Passport = {
  current_state: string | null;
  problem_statement: string | null;
  stakeholders: string | null;
  systems_involved: string | null;
  documents_involved: string | null;
  constraints_text: string | null;
  metrics_current: string | null;
  previous_attempts: string | null;
  regulatory_context: string | null;
  data_availability: string | null;
  initiator: string | null;
  customer: string | null;
  owner_name: string | null;
  basis: string | null;
  why_now: string | null;
  decision_due_at: string | null;
  expected_result: string | null;
  success_criteria: string | null;
  updated_at?: string;
};

const EMPTY: Passport = {
  current_state: "", problem_statement: "", stakeholders: "", systems_involved: "",
  documents_involved: "", constraints_text: "", metrics_current: "", previous_attempts: "",
  regulatory_context: "", data_availability: "", initiator: "", customer: "", owner_name: "",
  basis: "", why_now: "", decision_due_at: "", expected_result: "", success_criteria: "",
};

interface Props {
  projectId: number;
}

function Field({ label, value, onChange, textarea = true, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean; type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-y"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
      )}
    </div>
  );
}

function Block({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Icon name={icon} size={15} className="text-slate-500" />
        {title}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

export default function PassportTab({ projectId }: Props) {
  const [data, setData] = useState<Passport>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = () => {
    setLoading(true);
    workspaceApi.getPassport(projectId)
      .then((d: { passport: Passport | null }) => {
        if (d.passport) {
          setData({ ...EMPTY, ...d.passport });
          setSavedAt(d.passport.updated_at || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  const set = (field: keyof Passport) => (value: string) => {
    setData((d) => ({ ...d, [field]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await workspaceApi.updatePassport(projectId, data as Record<string, string | null>);
      setDirty(false);
      setSavedAt(new Date().toISOString());
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось сохранить паспорт");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-400 py-8 text-center">Загрузка паспорта…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs sm:text-sm text-slate-500 leading-snug">
          Постановка задачи, текущее состояние, ожидаемый результат и рабочая конструкция кейса
        </p>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
        >
          <Icon name={saving ? "Loader2" : "Save"} size={13} className={saving ? "animate-spin" : ""} />
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>

      {savedAt && !dirty && (
        <p className="text-[11px] text-slate-400">Сохранено: {new Date(savedAt).toLocaleString("ru-RU")}</p>
      )}
      {dirty && (
        <p className="text-[11px] text-amber-600 flex items-center gap-1">
          <Icon name="AlertCircle" size={11} /> Есть несохранённые изменения
        </p>
      )}

      <Block title="1. Постановка задачи" icon="FileText">
        <Field label="Инициатор" value={data.initiator || ""} onChange={set("initiator")} textarea={false} />
        <Field label="Заказчик" value={data.customer || ""} onChange={set("customer")} textarea={false} />
        <Field label="Владелец кейса" value={data.owner_name || ""} onChange={set("owner_name")} textarea={false} />
        <Field label="Срок подготовки решения" value={data.decision_due_at || ""} onChange={set("decision_due_at")} textarea={false} type="date" />
        <div className="sm:col-span-2">
          <Field label="Формулировка проблемы / задачи" value={data.problem_statement || ""} onChange={set("problem_statement")} />
        </div>
        <div className="sm:col-span-2">
          <Field label="Основание" value={data.basis || ""} onChange={set("basis")} />
        </div>
        <div className="sm:col-span-2">
          <Field label="Почему вопрос важен именно сейчас" value={data.why_now || ""} onChange={set("why_now")} />
        </div>
      </Block>

      <Block title="2. Текущее состояние" icon="Activity">
        <div className="sm:col-span-2">
          <Field label="Описание текущей ситуации" value={data.current_state || ""} onChange={set("current_state")} />
        </div>
        <Field label="Заинтересованные стороны" value={data.stakeholders || ""} onChange={set("stakeholders")} />
        <Field label="Затрагиваемые системы" value={data.systems_involved || ""} onChange={set("systems_involved")} />
        <Field label="Связанные документы" value={data.documents_involved || ""} onChange={set("documents_involved")} />
        <Field label="Ограничения" value={data.constraints_text || ""} onChange={set("constraints_text")} />
        <Field label="Текущие метрики" value={data.metrics_current || ""} onChange={set("metrics_current")} />
        <Field label="Регуляторный контекст" value={data.regulatory_context || ""} onChange={set("regulatory_context")} />
      </Block>

      <Block title="3. Ожидаемый результат" icon="Target">
        <div className="sm:col-span-2">
          <Field label="Ожидаемый результат" value={data.expected_result || ""} onChange={set("expected_result")} />
        </div>
        <div className="sm:col-span-2">
          <Field label="Критерии успеха" value={data.success_criteria || ""} onChange={set("success_criteria")} />
        </div>
      </Block>

      <Block title="4. Рабочая конструкция" icon="Wrench">
        <Field label="Предыдущие попытки решения" value={data.previous_attempts || ""} onChange={set("previous_attempts")} />
        <Field label="Доступность данных" value={data.data_availability || ""} onChange={set("data_availability")} />
      </Block>
    </div>
  );
}
