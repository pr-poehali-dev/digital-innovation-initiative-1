import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading } from "@/components/exec/ExecUI";
import { TextField, TextArea, SelectField, Modal } from "@/components/exec/ExecForm";
import {
  processModelApi,
  ProcessNode,
  ProcessDetail,
  ProcessLevel,
  ProcessFunction,
  STATUS_STYLE,
  PersonRef,
  OrgUnitRef,
  InfoSystem,
  Refs,
} from "@/lib/execProcessModelApi";
import PassportForm from "./PassportForm";
import DiagramsTab from "./DiagramsTab";
import RisksMetricsTab from "./RisksMetricsTab";

const LEVEL_LABEL: Record<ProcessLevel, string> = {
  direction: "Направление",
  process: "Процесс",
  subprocess: "Подпроцесс",
  operation: "Операция",
};
const LEVEL_ICON: Record<ProcessLevel, string> = {
  direction: "Compass",
  process: "GitBranch",
  subprocess: "GitFork",
  operation: "CircleDot",
};
const CHILD_LEVEL: Record<ProcessLevel, ProcessLevel | null> = {
  direction: "process",
  process: "subprocess",
  subprocess: "operation",
  operation: null,
};

function NodeModal({
  scopeId,
  parent,
  level,
  node,
  orgUnits,
  people,
  onClose,
  onSaved,
}: {
  scopeId: number;
  parent: ProcessNode | null;
  level: ProcessLevel;
  node: ProcessNode | null;
  orgUnits: OrgUnitRef[];
  people: PersonRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(node?.name || "");
  const [code, setCode] = useState(node?.code || "");
  const [ownerId, setOwnerId] = useState(node?.owner_person_id ? String(node.owner_person_id) : "");
  const [orgUnitId, setOrgUnitId] = useState(node?.responsible_org_unit_id ? String(node.responsible_org_unit_id) : "");
  const [result, setResult] = useState(node?.result_description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim()) {
      setError("Укажите название");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await processModelApi.saveProcessNode({
        id: node?.id,
        scope_id: scopeId,
        parent_id: parent?.id || null,
        level: node?.level || level,
        name: name.trim(),
        code: code.trim() || null,
        owner_person_id: ownerId ? Number(ownerId) : null,
        responsible_org_unit_id: orgUnitId ? Number(orgUnitId) : null,
        result_description: result.trim() || null,
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
      title={node ? `Редактировать: ${LEVEL_LABEL[node.level]}` : `Новый узел: ${LEVEL_LABEL[level]}`}
      subtitle={parent ? `Внутри «${parent.name}»` : "Верхний уровень архитектуры"}
      onClose={onClose}
      onSave={save}
      saving={saving}
      canSave={!!name.trim()}
      error={error}
      wide
    >
      <TextField label="Название" value={name} onChange={setName} required
        placeholder={level === "direction" ? "Например: Регуляторное управление" : "Например: Управление регуляторными требованиями и изменениями"} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Код (необязательно)" value={code} onChange={setCode} placeholder="P-01" />
        <SelectField label="Владелец" value={ownerId} onChange={setOwnerId}
          options={people.map((p) => ({ value: String(p.id), label: p.display_name }))} placeholder="не назначен" />
      </div>
      <SelectField label="Ответственное подразделение" value={orgUnitId} onChange={setOrgUnitId}
        options={orgUnits.map((u) => ({ value: String(u.id), label: u.name }))} placeholder="не указано" />
      <TextArea label="Результат" value={result} onChange={setResult} rows={2}
        placeholder="Что получает потребитель после завершения" />
    </Modal>
  );
}

function TreeNode({
  node,
  allNodes,
  depth,
  selectedId,
  onSelect,
  onAddChild,
  expanded,
  toggleExpand,
}: {
  node: ProcessNode;
  allNodes: ProcessNode[];
  depth: number;
  selectedId: number | null;
  onSelect: (n: ProcessNode) => void;
  onAddChild: (parent: ProcessNode) => void;
  expanded: Set<number>;
  toggleExpand: (id: number) => void;
}) {
  const children = allNodes.filter((n) => n.parent_id === node.id);
  const isOpen = expanded.has(node.id);
  const canHaveChildren = CHILD_LEVEL[node.level] !== null;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer group ${
          selectedId === node.id ? "bg-violet-100" : "hover:bg-slate-50"
        }`}
        style={{ marginLeft: depth * 16 }}
      >
        {children.length > 0 ? (
          <button onClick={() => toggleExpand(node.id)} className="text-slate-400 flex-shrink-0">
            <Icon name={isOpen ? "ChevronDown" : "ChevronRight"} size={13} />
          </button>
        ) : (
          <span className="w-[13px] flex-shrink-0" />
        )}
        <Icon name={LEVEL_ICON[node.level]} size={13} className="text-violet-500 flex-shrink-0" />
        <span onClick={() => onSelect(node)} className={`text-sm flex-1 min-w-0 truncate ${selectedId === node.id ? "text-violet-900 font-medium" : "text-slate-700"}`}>
          {node.name}
        </span>
        <span className={`text-[9px] px-1 py-0.5 rounded border flex-shrink-0 ${STATUS_STYLE[node.model_status].cls}`}>
          {STATUS_STYLE[node.model_status].title}
        </span>
        {canHaveChildren && (
          <button
            onClick={() => onAddChild(node)}
            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-violet-600 flex-shrink-0 transition-opacity"
            title={`Добавить ${LEVEL_LABEL[CHILD_LEVEL[node.level]!]}`}
          >
            <Icon name="Plus" size={13} />
          </button>
        )}
      </div>
      {isOpen && children.map((c) => (
        <TreeNode key={c.id} node={c} allNodes={allNodes} depth={depth + 1} selectedId={selectedId}
          onSelect={onSelect} onAddChild={onAddChild} expanded={expanded} toggleExpand={toggleExpand} />
      ))}
    </div>
  );
}

function FunctionLinkBlock({ nodeId, linked, canEdit, onChanged }: {
  nodeId: number; linked: ProcessDetail["functions"]; canEdit: boolean; onChanged: () => void;
}) {
  const [allFunctions, setAllFunctions] = useState<ProcessFunction[]>([]);
  const [adding, setAdding] = useState(false);
  const [pickId, setPickId] = useState("");

  const loadCandidates = () => {
    // scope_id функции не всегда известен здесь напрямую — подгружаем через overview default scope
    processModelApi.defaultScope().then((r) => {
      if (r.scope_id) processModelApi.functions(r.scope_id).then((f) => setAllFunctions(f.items));
    });
  };

  const unlinkedIds = new Set(linked.map((l) => l.id));
  const candidates = allFunctions.filter((f) => !unlinkedIds.has(f.id));

  const link = async () => {
    if (!pickId) return;
    await processModelApi.linkFunction(Number(pickId), nodeId);
    setPickId(""); setAdding(false);
    onChanged();
  };

  const unlink = async (fid: number) => {
    await processModelApi.unlinkFunction(fid, nodeId);
    onChanged();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Функции, реализуемые этим процессом.</p>
        {canEdit && !adding && (
          <button onClick={() => { setAdding(true); loadCandidates(); }}
            className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1">
            <Icon name="Link2" size={12} /> Связать функцию
          </button>
        )}
      </div>
      {linked.length === 0 ? (
        <Empty text="Процесс пока не связан ни с одной функцией" icon="Unlink" />
      ) : (
        linked.map((f) => (
          <div key={f.id} className="flex items-center justify-between text-sm bg-slate-50 rounded-md px-3 py-2">
            <span>{f.title}</span>
            {canEdit && (
              <button onClick={() => unlink(f.id)} className="text-slate-300 hover:text-red-600">
                <Icon name="X" size={13} />
              </button>
            )}
          </div>
        ))
      )}
      {adding && (
        <div className="flex items-center gap-2">
          <select value={pickId} onChange={(e) => setPickId(e.target.value)}
            className="flex-1 px-2.5 py-1.5 rounded-md border border-slate-300 text-xs">
            <option value="">выберите функцию</option>
            {candidates.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
          <button onClick={link} disabled={!pickId} className="text-xs px-2.5 py-1.5 rounded-md bg-violet-600 text-white disabled:opacity-40">
            Связать
          </button>
          <button onClick={() => setAdding(false)} className="text-xs text-slate-500 px-1.5">Отмена</button>
        </div>
      )}
    </div>
  );
}

function ProcessDetailPanel({
  nodeId,
  people,
  orgUnits,
  canEdit,
  canConfirm,
  onChanged,
}: {
  nodeId: number;
  people: PersonRef[];
  orgUnits: OrgUnitRef[];
  canEdit: boolean;
  canConfirm: boolean;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ProcessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"passport" | "functions" | "diagrams" | "systems" | "documents" | "next">("passport");
  const [refs, setRefs] = useState<Refs | null>(null);
  const [systems, setSystems] = useState<InfoSystem[]>([]);
  const [diagramNodeOptions, setDiagramNodeOptions] = useState<{ id: number; label: string }[]>([]);

  const load = () => {
    setLoading(true);
    processModelApi.processDetail(nodeId).then(setDetail).finally(() => setLoading(false));
  };
  useEffect(load, [nodeId]);
  useEffect(() => {
    processModelApi.refs().then(setRefs);
    processModelApi.systems().then((r) => setSystems(r.items));
  }, []);

  useEffect(() => {
    const asIs = detail?.diagrams.find((d) => d.variant === "as_is");
    if (!asIs) { setDiagramNodeOptions([]); return; }
    processModelApi.diagramFull(asIs.id).then((full) => {
      setDiagramNodeOptions(
        full.nodes
          .filter((n) => n.node_type === "task")
          .map((n) => ({ id: n.id, label: n.label || `Операция #${n.id}` }))
      );
    });
  }, [detail?.diagrams]);

  const setStatus = async (status: string) => {
    await processModelApi.setProcessStatus(nodeId, status as never);
    load();
    onChanged();
  };

  if (loading || !detail) return <Loading />;

  const TABS = [
    { id: "passport", label: "Паспорт", icon: "IdCard" },
    { id: "functions", label: "Функции", icon: "ListTree" },
    { id: "diagrams", label: "Схемы", icon: "GitBranch" },
    { id: "systems", label: "Системы", icon: "Server" },
    { id: "documents", label: "Документы", icon: "FileText" },
    { id: "next", label: "Риски и показатели", icon: "ShieldAlert" },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">{detail.node.name}</h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[detail.node.model_status].cls}`}>
              {STATUS_STYLE[detail.node.model_status].title}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {LEVEL_LABEL[detail.node.level]} · версия {detail.node.version}
            {detail.node.org_unit_name && ` · ${detail.node.org_unit_name}`}
          </p>
        </div>
        {canEdit && detail.node.model_status === "draft" && (
          <button onClick={() => setStatus("in_review")}
            className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50">
            Отправить на проверку
          </button>
        )}
        {canConfirm && detail.node.model_status === "in_review" && (
          <button onClick={() => setStatus("confirmed")}
            className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700">
            Подтвердить
          </button>
        )}
        {canConfirm && detail.node.model_status === "confirmed" && (
          <button onClick={() => setStatus("draft")}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
            Вернуть в черновик
          </button>
        )}
      </div>

      <div className="border-b border-slate-200 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-2.5 py-2 text-xs whitespace-nowrap border-b-2 transition-colors inline-flex items-center gap-1.5 ${
                tab === t.id ? "border-violet-600 text-violet-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}>
              <Icon name={t.icon} size={12} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "passport" && (
        <PassportForm detail={detail} people={people} orgUnits={orgUnits} canEdit={canEdit} onChanged={load} />
      )}

      {tab === "functions" && (
        <FunctionLinkBlock nodeId={detail.node.id} linked={detail.functions} canEdit={canEdit} onChanged={load} />
      )}

      {tab === "diagrams" && (
        <DiagramsTab processNodeId={detail.node.id} diagrams={detail.diagrams} canEdit={canEdit} canConfirm={canConfirm}
          refs={refs} people={people} onChanged={load} />
      )}

      {tab === "systems" && (
        <div className="space-y-2">
          {detail.systems.length === 0 ? (
            <Empty text="Информационные системы не указаны" icon="Server" />
          ) : (
            detail.systems.map((s) => (
              <div key={s.id} className="text-sm bg-slate-50 rounded-md px-3 py-2">{s.name}</div>
            ))
          )}
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-2">
          {detail.documents.length === 0 ? (
            <Empty text="Документы не привязаны" icon="FileText" />
          ) : (
            detail.documents.map((d) => (
              <div key={d.id} className="text-sm bg-slate-50 rounded-md px-3 py-2">{d.title}</div>
            ))
          )}
        </div>
      )}

      {tab === "next" && (
        <RisksMetricsTab
          processNodeId={detail.node.id}
          refs={refs}
          canEdit={canEdit}
          canConfirm={canConfirm}
          people={people}
          orgUnits={orgUnits}
          systems={systems}
          diagramNodeOptions={diagramNodeOptions}
        />
      )}
    </div>
  );
}

export default function ArchitectureManager({
  scopeId,
  canEdit,
  canConfirm,
}: {
  scopeId: number;
  canEdit: boolean;
  canConfirm: boolean;
}) {
  const [nodes, setNodes] = useState<ProcessNode[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRef[]>([]);
  const [people, setPeople] = useState<PersonRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<{ parent: ProcessNode | null; level: ProcessLevel; node: ProcessNode | null } | null>(null);
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([processModelApi.processTree(scopeId), processModelApi.orgUnits(), processModelApi.people()])
      .then(([t, u, p]) => {
        setNodes(t.items);
        setOrgUnits(u.items);
        setPeople(p.items);
        if (t.items.length > 0) setExpanded(new Set(t.items.filter((n) => !n.parent_id).map((n) => n.id)));
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [scopeId]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  const roots = nodes.filter((n) => !n.parent_id);
  const filteredRoots = search.trim()
    ? nodes.filter((n) => n.name.toLowerCase().includes(search.toLowerCase()))
    : roots;

  return (
    <div className="grid md:grid-cols-[320px_1fr] gap-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Дерево архитектуры</h3>
          {canEdit && (
            <button onClick={() => setModal({ parent: null, level: "direction", node: null })}
              className="text-xs px-2.5 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700 flex items-center gap-1">
              <Icon name="Plus" size={11} /> Направление
            </button>
          )}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию"
          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-violet-400"
        />
        <div className="rounded-xl border border-slate-200 bg-white p-2 max-h-[600px] overflow-y-auto">
          {nodes.length === 0 ? (
            <Empty text="Архитектура ещё не построена" icon="Network" />
          ) : (
            (search.trim() ? filteredRoots : roots).map((n) => (
              <TreeNode key={n.id} node={n} allNodes={nodes} depth={0} selectedId={selectedId}
                onSelect={(node) => setSelectedId(node.id)}
                onAddChild={(parent) => setModal({ parent, level: CHILD_LEVEL[parent.level]!, node: null })}
                expanded={expanded} toggleExpand={toggleExpand} />
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 min-h-[400px]">
        {selectedId ? (
          <ProcessDetailPanel nodeId={selectedId} people={people} orgUnits={orgUnits}
            canEdit={canEdit} canConfirm={canConfirm} onChanged={load} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center py-16 text-center">
            <Icon name="MousePointerClick" size={28} className="text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">Выберите узел в дереве слева, чтобы увидеть паспорт процесса</p>
          </div>
        )}
      </div>

      {modal && (
        <NodeModal scopeId={scopeId} parent={modal.parent} level={modal.level} node={modal.node}
          orgUnits={orgUnits} people={people} onClose={() => setModal(null)}
          onSaved={() => { load(); }} />
      )}
    </div>
  );
}