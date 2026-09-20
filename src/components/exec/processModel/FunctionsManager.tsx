import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";
import { TextField, TextArea, SelectField, Modal } from "@/components/exec/ExecForm";
import {
  processModelApi,
  ProcessFunction,
  FunctionCheckIssue,
  OrgUnitRef,
} from "@/lib/execProcessModelApi";

function FunctionModal({
  scopeId,
  fn,
  orgUnits,
  onClose,
  onSaved,
}: {
  scopeId: number;
  fn: ProcessFunction | null;
  orgUnits: OrgUnitRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(fn?.title || "");
  const [code, setCode] = useState(fn?.code || "");
  const [orgUnitId, setOrgUnitId] = useState(fn?.org_unit_id ? String(fn.org_unit_id) : "");
  const [role, setRole] = useState(fn?.responsible_role || "");
  const [basis, setBasis] = useState(fn?.normative_basis || "");
  const [comment, setComment] = useState(fn?.comment || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!title.trim()) {
      setError("Укажите формулировку функции");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await processModelApi.saveFunction({
        id: fn?.id,
        scope_id: scopeId,
        title: title.trim(),
        code: code.trim() || null,
        org_unit_id: orgUnitId ? Number(orgUnitId) : null,
        responsible_role: role.trim() || null,
        normative_basis: basis.trim() || null,
        comment: comment.trim() || null,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={fn ? "Редактировать функцию" : "Добавить функцию"}
      subtitle="Функция — это ЧТО обязано делать подразделение по нормативному документу"
      onClose={onClose}
      onSave={save}
      saving={saving}
      canSave={!!title.trim()}
      error={error}
      wide
    >
      <TextArea
        label="Формулировка функции *"
        value={title}
        onChange={setTitle}
        rows={2}
        placeholder="Например: Выявление и оценка регуляторных требований и изменений законодательства"
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Код (необязательно)" value={code} onChange={setCode} placeholder="F-01" />
        <SelectField
          label="Подразделение"
          value={orgUnitId}
          onChange={setOrgUnitId}
          options={orgUnits.map((u) => ({ value: String(u.id), label: u.name }))}
          placeholder="не указано"
        />
      </div>
      <TextField label="Ответственная роль" value={role} onChange={setRole}
        placeholder="Например: Руководитель ДВКиК" />
      <TextArea label="Нормативное основание" value={basis} onChange={setBasis} rows={2}
        placeholder="Например: Положение о ДВКиК, п. 3.2" />
      <TextArea label="Комментарий" value={comment} onChange={setComment} rows={2} />
    </Modal>
  );
}

const ISSUE_LABEL: Record<string, { label: string; icon: string }> = {
  duplicate: { label: "Дубли", icon: "Copy" },
  no_org_unit: { label: "Без подразделения", icon: "Building2" },
  no_basis: { label: "Без основания", icon: "FileQuestion" },
  no_process_link: { label: "Без связи с процессом", icon: "Unlink" },
  similar_wording: { label: "Похожие формулировки", icon: "GitCompare" },
  responsibility_gap: { label: "Разрыв ответственности", icon: "AlertTriangle" },
};

export default function FunctionsManager({
  scopeId,
  canEdit,
  onCreateClarification,
}: {
  scopeId: number;
  canEdit: boolean;
  onCreateClarification?: (question: string, entityId?: number) => void;
}) {
  const [items, setItems] = useState<ProcessFunction[]>([]);
  const [issues, setIssues] = useState<FunctionCheckIssue[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalFn, setModalFn] = useState<ProcessFunction | null | "new">(null);
  const [showIssues, setShowIssues] = useState(true);

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      processModelApi.functions(scopeId),
      processModelApi.functionChecks(scopeId),
      processModelApi.orgUnits(),
    ])
      .then(([f, c, u]) => {
        setItems(f.items);
        setIssues(c.items);
        setOrgUnits(u.items);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [scopeId]);

  const toggleConfirm = async (fn: ProcessFunction) => {
    try {
      if (fn.confirmation_status === "confirmed") {
        await processModelApi.unconfirmFunction(fn.id);
      } else {
        await processModelApi.confirmFunction(fn.id);
      }
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Реестр функций подразделений</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Функция — то, что подразделение обязано делать по нормативному документу. Вводится и подтверждается вручную.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setModalFn("new")}
            className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors flex items-center gap-1.5"
          >
            <Icon name="Plus" size={12} />
            Добавить функцию
          </button>
        )}
      </div>

      {issues.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
          <button
            onClick={() => setShowIssues(!showIssues)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left"
          >
            <span className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
              <Icon name="AlertTriangle" size={13} />
              Найдено предупреждений: {issues.length}
            </span>
            <Icon name={showIssues ? "ChevronUp" : "ChevronDown"} size={14} className="text-amber-600" />
          </button>
          {showIssues && (
            <div className="px-3 pb-3 space-y-1.5">
              {issues.map((iss, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs bg-white rounded-md border border-amber-200 p-2">
                  <Icon name={ISSUE_LABEL[iss.code]?.icon || "AlertTriangle"} size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-amber-900 font-medium">{iss.title}</p>
                    <p className="text-amber-700 mt-0.5">{iss.detail}</p>
                  </div>
                  {onCreateClarification && (
                    <button
                      onClick={() => onCreateClarification(iss.title, iss.function_ids[0])}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-100 flex-shrink-0"
                    >
                      Уточнить
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <Empty text="Функции ещё не добавлены" icon="ListTree" />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="py-2 px-3 font-medium">Функция</th>
                <th className="py-2 px-3 font-medium">Подразделение</th>
                <th className="py-2 px-3 font-medium">Роль</th>
                <th className="py-2 px-3 font-medium">Основание</th>
                <th className="py-2 px-3 font-medium">Процессы</th>
                <th className="py-2 px-3 font-medium">Статус</th>
                <th className="py-2 px-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((f) => (
                <tr key={f.id} className="align-top hover:bg-slate-50/50">
                  <td className="py-2.5 px-3 max-w-xs">
                    <p className="text-slate-900">{f.title}</p>
                    {f.code && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{f.code}</p>}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-600">
                    {f.org_unit_name || <span className="text-amber-600">не указано</span>}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-600">{f.responsible_role || "—"}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-600 max-w-[160px] truncate" title={f.normative_basis || ""}>
                    {f.normative_basis || <span className="text-amber-600">не указано</span>}
                  </td>
                  <td className="py-2.5 px-3 text-xs">
                    {f.process_links_count > 0 ? (
                      <span className="text-slate-600">{f.process_links_count}</span>
                    ) : (
                      <span className="text-amber-600">0</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        f.confirmation_status === "confirmed"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                    >
                      {f.confirmation_status === "confirmed" ? "Подтверждено" : "Черновик"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setModalFn(f)} className="text-slate-400 hover:text-violet-600 p-1">
                          <Icon name="Pencil" size={13} />
                        </button>
                        <button
                          onClick={() => toggleConfirm(f)}
                          className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
                            f.confirmation_status === "confirmed"
                              ? "border-slate-200 text-slate-500 hover:bg-slate-50"
                              : "border-violet-300 text-violet-700 hover:bg-violet-50"
                          }`}
                        >
                          {f.confirmation_status === "confirmed" ? "Снять" : "Подтвердить"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalFn && (
        <FunctionModal
          scopeId={scopeId}
          fn={modalFn === "new" ? null : modalFn}
          orgUnits={orgUnits}
          onClose={() => setModalFn(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}