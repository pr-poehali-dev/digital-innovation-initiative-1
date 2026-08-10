import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { execApi } from "@/lib/execCabinetApi";
import { Card, Empty, ErrorBox, Loading, Metric } from "@/components/exec/ExecUI";
import { Modal, TextField } from "@/components/exec/ExecForm";

interface Person {
  id: number;
  display_name: string;
  position_title: string | null;
  org_name: string | null;
  is_anonymized: boolean;
  record_state: string;
  stakeholder_count: number;
  role_count: number;
}

export default function ExecPersonsPage() {
  const [items, setItems] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [f, setF] = useState({ display_name: "", position_title: "", org_name: "" });

  const load = () => {
    setLoading(true);
    setError("");
    execApi
      .persons()
      .then((r) => setItems(r.items as unknown as Person[]))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(
    () =>
      items.filter((p) =>
        `${p.display_name} ${p.position_title || ""} ${p.org_name || ""}`
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
    [items, q],
  );

  const save = async () => {
    if (!f.display_name.trim()) {
      setFormError("Укажите обозначение участника");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await execApi.createPerson({
        display_name: f.display_name.trim(),
        position_title: f.position_title.trim(),
        org_name: f.org_name.trim(),
      });
      setF({ display_name: "", position_title: "", org_name: "" });
      setOpen(false);
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell>
      <div className="max-w-[1200px] space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-white">Справочник участников</h1>
            <p className="text-sm text-gray-500 mt-1">
              Единая карточка лица — используется во всех инициативах и решениях
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Icon name="Plus" size={15} />
            Добавить участника
          </button>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Всего участников" value={items.length} icon="Users" />
          <Metric
            label="Участвуют в инициативах"
            value={items.filter((p) => p.stakeholder_count > 0).length}
            icon="UserCheck"
          />
          <Metric
            label="Имеют назначенные роли"
            value={items.filter((p) => p.role_count > 0).length}
            icon="Shield"
          />
          <Metric
            label="Не задействованы"
            value={items.filter((p) => !p.stakeholder_count && !p.role_count).length}
            icon="UserMinus"
          />
        </div>

        <div className="relative">
          <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по обозначению, должности или организации"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-white text-sm placeholder:text-gray-600 focus:border-gray-700 outline-none"
          />
        </div>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : (
          <Card title="Участники" subtitle={`${filtered.length} записей`} icon="Users">
            {filtered.length === 0 ? (
              <Empty text={items.length ? "Ничего не найдено" : "Участники не заведены"} />
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                      <th className="pb-2 font-medium">Обозначение</th>
                      <th className="pb-2 font-medium">Должность</th>
                      <th className="pb-2 font-medium">Организация</th>
                      <th className="pb-2 font-medium text-center">Инициатив</th>
                      <th className="pb-2 font-medium text-center">Ролей</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {filtered.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-900/40 transition-colors">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-200">{p.display_name}</span>
                            {p.is_anonymized && (
                              <span
                                title="Обезличенная запись"
                                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-400"
                              >
                                обезличено
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-gray-400 text-xs">{p.position_title || "—"}</td>
                        <td className="py-3 text-gray-500 text-xs">{p.org_name || "—"}</td>
                        <td className="py-3 text-center text-gray-400">{p.stakeholder_count}</td>
                        <td className="py-3 text-center text-gray-400">{p.role_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        <Card title="Правило обезличивания" icon="ShieldCheck">
          <p className="text-sm text-gray-400 leading-relaxed">
            До согласования вопросов информационной безопасности используйте условные обозначения
            («Участник А», «Руководитель Группы»), должности и подразделения. Реальные фамилии и
            персональные контакты не заводите.
          </p>
        </Card>

        {open && (
          <Modal
            title="Новый участник"
            subtitle="Используйте условное обозначение, а не реальное имя"
            onClose={() => setOpen(false)}
            onSave={save}
            saving={saving}
            error={formError}
            canSave={!!f.display_name.trim()}
          >
            <TextField
              label="Обозначение"
              value={f.display_name}
              onChange={(v) => setF((p) => ({ ...p, display_name: v }))}
              placeholder="Например: Участник З"
              required
              hint="Условное обозначение вместо фамилии"
            />
            <TextField
              label="Должность"
              value={f.position_title}
              onChange={(v) => setF((p) => ({ ...p, position_title: v }))}
              placeholder="Например: Руководитель управления"
            />
            <TextField
              label="Организация или подразделение"
              value={f.org_name}
              onChange={(v) => setF((p) => ({ ...p, org_name: v }))}
              placeholder="Например: Блок внутреннего контроля"
            />
          </Modal>
        )}
      </div>
    </AdminShell>
  );
}
