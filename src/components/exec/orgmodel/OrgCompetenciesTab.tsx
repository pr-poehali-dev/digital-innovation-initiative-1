import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, Card } from "@/components/exec/ExecUI";
import { Modal, SelectField, CheckField } from "@/components/exec/ExecForm";
import { centerApi, Center, CenterRole } from "@/lib/execCenterApi";
import { peopleApi } from "@/lib/execPeopleApi";
import { orgModelApi } from "@/lib/execOrgModelApi";

interface CompetencyItem {
  id: number;
  code: string;
  name: string;
  domain_name: string | null;
}

/** Единый справочник компетенций переиспользуется из professional_competencies
 * (через exec-people). Здесь — только связка "роль → требуемая компетенция
 * и уровень" (exec_center_role_competency), без создания нового справочника
 * и без чувствительных оценок личности. */
export default function OrgCompetenciesTab({ centerId }: { centerId: number }) {
  const [center, setCenter] = useState<Center | null>(null);
  const [catalog, setCatalog] = useState<CompetencyItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<{ role_id: number } | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const reload = () => {
    setLoading(true);
    setError("");
    Promise.all([centerApi.center(centerId), peopleApi.competencyCatalog()])
      .then(([c, cat]) => {
        setCenter(c.center);
        setCatalog(cat);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [centerId]);

  const save = async () => {
    if (!adding) return;
    setSaving(true);
    setSaveError("");
    try {
      await orgModelApi.saveRoleCompetency({ ...form, role_id: adding.role_id });
      setAdding(null);
      setForm({});
      reload();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const roles = center?.roles || [];
  const compOptions = (catalog || []).map((c) => ({
    value: String(c.id),
    label: c.domain_name ? `${c.name} (${c.domain_name})` : c.name,
  }));

  return (
    <div className="space-y-4">
      <Card
        title="Каталог компетенций"
        icon="GraduationCap"
        subtitle="Общий справочник professional_competencies — используется людьми и ролями"
      >
        {!catalog?.length ? (
          <Empty text="Справочник компетенций пуст" icon="GraduationCap" />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {catalog.map((c) => (
              <span
                key={c.id}
                className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600"
                title={c.domain_name || ""}
              >
                {c.name}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card title="Требуемые компетенции по ролям" icon="IdCard">
        {!roles.length ? (
          <Empty text="Роли ещё не заведены" icon="IdCard" />
        ) : (
          <div className="space-y-3">
            {roles.map((r) => (
              <RoleCompetencyRow
                key={r.id}
                role={r}
                onAdd={() => setAdding({ role_id: r.id })}
              />
            ))}
          </div>
        )}
      </Card>

      {adding && (
        <Modal
          title="Требование к компетенции"
          onClose={() => setAdding(null)}
          onSave={save}
          saving={saving}
          error={saveError}
        >
          <SelectField
            label="Компетенция"
            value={String(form.competency_id || "")}
            onChange={(v) => setForm({ ...form, competency_id: Number(v) })}
            options={compOptions}
            required
          />
          <SelectField
            label="Требуемый уровень"
            value={String(form.required_level || 3)}
            onChange={(v) => setForm({ ...form, required_level: Number(v) })}
            options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `Уровень ${n}` }))}
          />
          <CheckField
            label="Критичная компетенция"
            checked={!!form.is_critical}
            onChange={(v) => setForm({ ...form, is_critical: v })}
          />
        </Modal>
      )}
    </div>
  );
}

function RoleCompetencyRow({ role, onAdd }: { role: CenterRole; onAdd: () => void }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-900">{role.title}</p>
        <button
          onClick={onAdd}
          className="text-xs text-violet-700 hover:text-violet-900 inline-flex items-center gap-1"
        >
          <Icon name="Plus" size={12} />
          Добавить компетенцию
        </button>
      </div>
    </div>
  );
}
