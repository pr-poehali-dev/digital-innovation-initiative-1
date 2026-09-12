import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";
import { orgModelApi, OrgUnitNode, ORG_UNIT_TYPE_LABEL } from "@/lib/execOrgModelApi";

/** Интерактивное дерево подразделений: карточками, без графового редактора
 * (по решению — на первом выпуске достаточно древовидных карточек). */
export default function OrgStructureTab({ centerId }: { centerId: number }) {
  const [items, setItems] = useState<OrgUnitNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<OrgUnitNode | null>(null);

  const reload = () => {
    setLoading(true);
    setError("");
    orgModelApi
      .tree(centerId)
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [centerId]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!items) return null;

  if (!items.length) {
    return (
      <Empty
        text="Структура Центра ещё не описана. Добавьте первое подразделение на вкладке «Подразделения»."
        icon="Network"
      />
    );
  }

  const byParent = new Map<number | null, OrgUnitNode[]>();
  for (const it of items) {
    const key = it.parent_id;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(it);
  }

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (node: OrgUnitNode, depth: number) => {
    const children = byParent.get(node.id) || [];
    const isOpen = expanded.has(node.id);
    return (
      <div key={node.id} style={{ marginLeft: depth * 20 }}>
        <div
          className={`rounded-lg border p-3 mb-2 cursor-pointer transition-colors ${
            selected?.id === node.id
              ? "border-violet-400 bg-violet-50"
              : "border-slate-200 bg-white hover:border-violet-200"
          }`}
          onClick={() => setSelected(node)}
        >
          <div className="flex items-center gap-2">
            {children.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(node.id);
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                <Icon name={isOpen ? "ChevronDown" : "ChevronRight"} size={14} />
              </button>
            )}
            <Icon name="Building2" size={14} className="text-violet-500 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-900">{node.name}</span>
            {node.code && <span className="text-xs text-slate-400">({node.code})</span>}
            <span className="text-[11px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500">
              {ORG_UNIT_TYPE_LABEL[node.type] || node.type}
            </span>
            {node.status === "planned" && (
              <span className="text-[11px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">
                Планируется
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3 mt-1.5 pl-5 text-xs text-slate-500">
            <span>
              <Icon name="User" size={11} className="inline mr-1" />
              {node.head_name || "руководитель не назначен"}
            </span>
            <span>
              <Icon name="ListChecks" size={11} className="inline mr-1" />
              функций: {node.function_count}
            </span>
            <span>
              <Icon name="Users" size={11} className="inline mr-1" />
              штат {node.staff_plan_fte} / факт {node.staff_fact_fte} FTE
            </span>
            {node.vacancy_count > 0 && (
              <span className="text-amber-700">
                <Icon name="UserX" size={11} className="inline mr-1" />
                вакансий: {node.vacancy_count}
              </span>
            )}
          </div>
        </div>
        {isOpen && children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const roots = byParent.get(null) || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">{roots.map((r) => renderNode(r, 0))}</div>
      <div>
        {selected ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 sticky top-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">{selected.name}</h3>
            {selected.description && (
              <p className="text-xs text-slate-500 mb-3">{selected.description}</p>
            )}
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Руководитель</dt>
                <dd className="text-slate-900">{selected.head_name || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Тип</dt>
                <dd className="text-slate-900">{ORG_UNIT_TYPE_LABEL[selected.type] || selected.type}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Функций</dt>
                <dd className="text-slate-900">{selected.function_count}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Штат / факт</dt>
                <dd className="text-slate-900">
                  {selected.staff_plan_fte} / {selected.staff_fact_fte} FTE
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Вакансий</dt>
                <dd className="text-slate-900">{selected.vacancy_count}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <Empty text="Выберите подразделение слева, чтобы увидеть детали" icon="MousePointerClick" />
        )}
      </div>
    </div>
  );
}
