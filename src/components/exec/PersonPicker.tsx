import { useMemo, useState } from "react";
import Icon from "@/components/ui/icon";
import { PersonRef } from "@/lib/execPlannerApi";
import { execApi } from "@/lib/execCabinetApi";

/**
 * Выбор ответственного: поиск по заведённым участникам
 * либо ввод ФИО вручную — человек создаётся на лету.
 */
export default function PersonPicker({
  label,
  hint,
  value,
  persons,
  onChange,
  onPersonCreated,
}: {
  label: string;
  hint?: string;
  value: string;
  persons: PersonRef[];
  onChange: (id: string) => void;
  onPersonCreated?: (p: PersonRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [newPos, setNewPos] = useState("");
  const [err, setErr] = useState("");

  const selected = persons.find((p) => String(p.id) === value) || null;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return persons;
    return persons.filter((p) =>
      `${p.display_name} ${p.position_title || ""} ${p.org_name || ""}`
        .toLowerCase()
        .includes(s),
    );
  }, [persons, q]);

  const exactExists = persons.some(
    (p) => p.display_name.trim().toLowerCase() === q.trim().toLowerCase(),
  );
  const canCreate = q.trim().length >= 3 && !exactExists;

  const createPerson = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    setErr("");
    try {
      const res = await execApi.createPerson({
        display_name: q.trim(),
        position_title: newPos.trim() || undefined,
      });
      const person: PersonRef = {
        id: res.id,
        display_name: q.trim(),
        position_title: newPos.trim() || null,
        org_name: null,
      };
      onPersonCreated?.(person);
      onChange(String(res.id));
      setQ("");
      setNewPos("");
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <span className="text-xs text-slate-500 mb-1.5 block">{label}</span>

      {/* Кнопка-значение */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-left hover:border-slate-300 transition-colors"
      >
        <Icon name="User" size={14} className="text-slate-400 flex-shrink-0" />
        <span className="flex-1 min-w-0">
          {selected ? (
            <>
              <span className="text-sm text-slate-900 block leading-snug truncate">
                {selected.display_name}
              </span>
              {selected.position_title && (
                <span className="text-[11px] text-slate-400 block truncate">
                  {selected.position_title}
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-slate-400">не выбрано</span>
          )}
        </span>
        {selected && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                onChange("");
              }
            }}
            className="text-slate-300 hover:text-slate-500 transition-colors p-0.5 rounded"
            title="Очистить"
          >
            <Icon name="X" size={13} />
          </span>
        )}
        <Icon
          name="ChevronDown"
          size={14}
          className={`text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Выпадающая панель */}
      {open && (
        <div className="mt-1.5 rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Icon
                name="Search"
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setErr("");
                }}
                placeholder="Найти или ввести ФИО"
                className="w-full pl-8 pr-3 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-300"
              />
            </div>
          </div>

          <div className="max-h-44 overflow-y-auto divide-y divide-slate-100">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(String(p.id));
                  setOpen(false);
                  setQ("");
                }}
                className={`w-full px-3 py-2 text-left transition-colors ${
                  String(p.id) === value ? "bg-violet-50" : "hover:bg-slate-50"
                }`}
              >
                <span className="text-sm text-slate-800 block leading-snug">
                  {p.display_name}
                </span>
                {p.position_title && (
                  <span className="text-[11px] text-slate-400 block">{p.position_title}</span>
                )}
              </button>
            ))}
            {filtered.length === 0 && !canCreate && (
              <p className="px-3 py-3 text-xs text-slate-400">
                {persons.length ? "Никого не найдено" : "Участники пока не заведены"}
              </p>
            )}
          </div>

          {/* Добавление нового по ФИО */}
          {canCreate && (
            <div className="p-2 border-t border-slate-100 bg-slate-50/70 space-y-2">
              <input
                value={newPos}
                onChange={(e) => setNewPos(e.target.value)}
                placeholder="Должность (необязательно)"
                className="w-full px-2.5 py-1.5 rounded-md bg-white border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-300"
              />
              <button
                type="button"
                onClick={createPerson}
                disabled={creating}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
              >
                <Icon name="UserPlus" size={13} />
                {creating ? "Добавляю…" : `Добавить «${q.trim()}»`}
              </button>
            </div>
          )}

          {err && <p className="px-3 py-2 text-xs text-red-600 border-t border-slate-100">{err}</p>}
        </div>
      )}

      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
