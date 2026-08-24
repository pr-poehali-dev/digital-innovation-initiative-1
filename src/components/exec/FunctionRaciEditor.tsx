import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Modal, SelectField } from "@/components/exec/ExecForm";
import { CenterFunction, CenterRefs, centerApi } from "@/lib/execCenterApi";

interface RaciRow {
  id: number;
  function_id: number;
  person_id: number;
  raci_role: string;
  is_backup: boolean;
  valid_to: string | null;
  person_name: string;
  position_title: string | null;
}

const personOpts = (refs: CenterRefs) =>
  refs.persons.map((p) => ({
    value: String(p.id),
    label: p.position_title ? `${p.display_name} — ${p.position_title}` : p.display_name,
  }));

/** Назначение владельца (A) и замещающего функции через матрицу RACI.
 * Единственный источник владельца — exec_function_raci, не поле функции. */
export default function FunctionRaciEditor({
  fn,
  refs,
  onClose,
  onSaved,
}: {
  fn: CenterFunction;
  refs: CenterRefs;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [raci, setRaci] = useState<RaciRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerId, setOwnerId] = useState("");
  const [backupId, setBackupId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    centerApi
      .functionDetail(fn.id)
      .then((d) => {
        const list = (d.raci as unknown as RaciRow[]).filter((r) => !r.valid_to);
        setRaci(list);
        const owner = list.find((r) => r.raci_role === "A" && !r.is_backup);
        const backup = list.find((r) => r.is_backup);
        setOwnerId(owner ? String(owner.person_id) : "");
        setBackupId(backup ? String(backup.person_id) : "");
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [fn.id]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const currentOwner = raci.find((r) => r.raci_role === "A" && !r.is_backup);
      const currentBackup = raci.find((r) => r.is_backup);

      if (ownerId && (!currentOwner || String(currentOwner.person_id) !== ownerId)) {
        await centerApi.saveRaci({
          function_id: fn.id,
          person_id: Number(ownerId),
          raci_role: "A",
          is_backup: false,
        });
      } else if (!ownerId && currentOwner) {
        await centerApi.closeRaci(currentOwner.id);
      }

      if (backupId && (!currentBackup || String(currentBackup.person_id) !== backupId)) {
        await centerApi.saveRaci({
          function_id: fn.id,
          person_id: Number(backupId),
          raci_role: "A",
          is_backup: true,
        });
      } else if (!backupId && currentBackup) {
        await centerApi.closeRaci(currentBackup.id);
      }

      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Ответственность за функцию"
      subtitle={fn.title}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
    >
      {loading ? (
        <p className="text-sm text-slate-400 py-4 text-center">Загрузка…</p>
      ) : (
        <>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex items-start gap-2">
            <Icon name="Info" size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              Владелец получает роль A в матрице RACI. Прежнее назначение автоматически
              закрывается датой — история сохраняется.
            </p>
          </div>
          <SelectField
            label="Владелец (роль A)"
            value={ownerId}
            onChange={setOwnerId}
            options={personOpts(refs)}
          />
          <SelectField
            label="Замещающий"
            value={backupId}
            onChange={setBackupId}
            options={personOpts(refs)}
            hint="Кто подхватит, если основной недоступен"
          />
        </>
      )}
    </Modal>
  );
}
