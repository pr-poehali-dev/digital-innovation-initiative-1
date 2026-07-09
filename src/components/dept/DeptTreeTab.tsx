import { useEffect, useMemo, useState, useCallback } from "react";
import { deptFunctionsApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import SourceCoverageBanner from "@/components/dept/SourceCoverageBanner";
import PostImportBanner from "@/components/dept/PostImportBanner";

type OrgNode = {
  id: number;
  code: string;
  name: string;
  type: string;
  parent_id: number | null;
  path: string;
  level: number;
  sort_order: number;
  own_count: number;
};

type OrgFunction = {
  id: number;
  title: string;
  description: string;
  category: string;
  priority: number;
  role: string;
  org_unit_id: number;
  unit_code: string;
  automation_status: string;
  ai_potential_score: number;
  directions: { code: string; name: string }[];
};

type UnassignedFunction = { id: number; title: string; dept_name: string; category: string };

const TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  department: { label: "Департамент", icon: "Building2", color: "text-slate-800" },
  management: { label: "Управление", icon: "Network", color: "text-blue-700" },
  division:   { label: "Отдел", icon: "Users", color: "text-emerald-700" },
  group:      { label: "Группа", icon: "UsersRound", color: "text-amber-700" },
  center:     { label: "Центр", icon: "Target", color: "text-purple-700" },
};

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner:       { label: "Владелец", color: "bg-blue-100 text-blue-700" },
  co_executor: { label: "Соисполнитель", color: "bg-emerald-100 text-emerald-700" },
  participant: { label: "Участник", color: "bg-slate-100 text-slate-600" },
  reviewer:    { label: "Проверяющий", color: "bg-amber-100 text-amber-700" },
};

const AUTOMATION_LABELS: Record<string, { label: string; color: string }> = {
  manual:    { label: "Ручной", color: "bg-red-100 text-red-700" },
  partial:   { label: "Частично", color: "bg-amber-100 text-amber-700" },
  automated: { label: "Автоматизирован", color: "bg-emerald-100 text-emerald-700" },
  planned:   { label: "Планируется", color: "bg-blue-100 text-blue-700" },
};

const ROLE_OPTIONS = ["owner", "co_executor", "participant", "reviewer"];

type Coverage = {
  status: string;
  thin_managements: { code: string; name: string; own_count: number }[];
  missing_section_code_count: number;
  show_upload_reminder: boolean;
};

interface Props {
  projectId: number;
  onNavigateToUpload?: () => void;
}

export default function DeptTreeTab({ projectId, onNavigateToUpload }: Props) {
  const [nodes, setNodes] = useState<OrgNode[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [includeChildren, setIncludeChildren] = useState(false);
  const [functions, setFunctions] = useState<OrgFunction[]>([]);
  const [funcsLoading, setFuncsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [dirFilter, setDirFilter] = useState("all");
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [unassigned, setUnassigned] = useState<UnassignedFunction[]>([]);
  const [assignTarget, setAssignTarget] = useState<{ funcId: number; unitId: number } | null>(null);

  const loadTree = useCallback(() => {
    setLoading(true);
    deptFunctionsApi.getOrgTree(projectId)
      .then((d: { nodes: OrgNode[]; unassigned: number; coverage?: Coverage }) => {
        setNodes(d.nodes || []);
        setUnassignedCount(d.unassigned || 0);
        setCoverage(d.coverage || null);
        if (!selectedId && d.nodes?.length) setSelectedId(d.nodes[0].id);
      })
      .catch((e: Error) => toast({ title: "Ошибка загрузки дерева", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [projectId, selectedId]);

  useEffect(() => { loadTree(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  const loadFunctions = useCallback((unitId: number, withChildren: boolean) => {
    setFuncsLoading(true);
    deptFunctionsApi.getOrgFunctions(projectId, unitId, withChildren)
      .then((d: { functions: OrgFunction[] }) => setFunctions(d.functions || []))
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }))
      .finally(() => setFuncsLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (selectedId) loadFunctions(selectedId, includeChildren);
  }, [selectedId, includeChildren, loadFunctions]);

  const loadUnassigned = useCallback(() => {
    deptFunctionsApi.getUnassignedFunctions(projectId)
      .then((d: { functions: UnassignedFunction[] }) => setUnassigned(d.functions || []))
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }));
  }, [projectId]);

  useEffect(() => { if (showUnassigned) loadUnassigned(); }, [showUnassigned, loadUnassigned]);

  const childrenOf = (pid: number | null) =>
    nodes.filter((n) => n.parent_id === pid).sort((a, b) => a.sort_order - b.sort_order);

  const totalCountWithChildren = (unitId: number): number => {
    const acc = (id: number): number => {
      const self = nodes.find((n) => n.id === id)?.own_count || 0;
      return self + childrenOf(id).reduce((s, c) => s + acc(c.id), 0);
    };
    return acc(unitId);
  };

  const selectedNode = nodes.find((n) => n.id === selectedId) || null;

  const allDirections = useMemo(() => {
    const set = new Map<string, string>();
    functions.forEach((f) => f.directions.forEach((d) => set.set(d.code, d.name)));
    return Array.from(set.entries()).map(([code, name]) => ({ code, name }));
  }, [functions]);

  const filteredFunctions = useMemo(() => {
    return functions.filter((f) => {
      if (roleFilter !== "all" && f.role !== roleFilter) return false;
      if (dirFilter !== "all" && !f.directions.some((d) => d.code === dirFilter)) return false;
      if (search && !f.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [functions, roleFilter, dirFilter, search]);

  const assignFunction = (funcId: number, unitId: number, role: string) => {
    deptFunctionsApi.assignOrgUnit({ project_id: projectId, function_id: funcId, org_unit_id: unitId, role })
      .then(() => {
        toast({ title: "Функция привязана" });
        setAssignTarget(null);
        loadTree();
        if (selectedId) loadFunctions(selectedId, includeChildren);
        if (showUnassigned) loadUnassigned();
      })
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }));
  };

  const unassignFunction = (funcId: number, unitId: number, role: string) => {
    deptFunctionsApi.unassignOrgUnit({ project_id: projectId, function_id: funcId, org_unit_id: unitId, role })
      .then(() => {
        toast({ title: "Привязка снята" });
        loadTree();
        if (selectedId) loadFunctions(selectedId, includeChildren);
      })
      .catch((e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }));
  };

  const renderNode = (node: OrgNode) => {
    const kids = childrenOf(node.id);
    const t = TYPE_LABELS[node.type] || TYPE_LABELS.division;
    const isSelected = node.id === selectedId;
    const totalCount = totalCountWithChildren(node.id);
    return (
      <div key={node.id}>
        <button
          onClick={() => setSelectedId(node.id)}
          className={`w-full flex items-start gap-2 text-left px-2 py-1.5 rounded-md transition ${
            isSelected ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50"
          }`}
          style={{ paddingLeft: `${node.level * 14 + 8}px` }}
        >
          <Icon name={t.icon} size={15} className={`mt-0.5 shrink-0 ${t.color}`} fallback="Circle" />
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono text-slate-400">{node.code}</span>
              <span className={`text-sm ${isSelected ? "font-semibold text-slate-900" : "text-slate-700"}`}>{node.name}</span>
            </span>
          </span>
          {node.own_count > 0 && (
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0" title={`${node.own_count} на узле, ${totalCount} с дочерними`}>
              {node.own_count}{totalCount > node.own_count ? `/${totalCount}` : ""}
            </Badge>
          )}
        </button>
        {kids.map(renderNode)}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Дерево департамента</h2>
          <p className="text-sm text-slate-500">Оргструктура и привязка функций к отделам, ролям и направлениям.</p>
        </div>
        {unassignedCount > 0 && (
          <Button
            variant={showUnassigned ? "default" : "outline"}
            size="sm"
            onClick={() => setShowUnassigned((v) => !v)}
          >
            <Icon name="AlertTriangle" size={14} className="mr-1.5" />
            Без привязки: {unassignedCount}
          </Button>
        )}
      </div>

      {/* Результат последней дозагрузки — поверх состояния покрытия */}
      <PostImportBanner
        projectId={projectId}
        onOpenTree={undefined}
        onShowUnassigned={() => setShowUnassigned(true)}
      />

      {coverage?.show_upload_reminder && (
        <SourceCoverageBanner
          thinManagements={coverage.thin_managements}
          onUpload={onNavigateToUpload}
          onShowUnassigned={unassignedCount > 0 ? () => setShowUnassigned(true) : undefined}
        />
      )}

      {showUnassigned && (
        <div className="border border-amber-200 bg-amber-50/60 rounded-lg p-3">
          <div className="text-sm font-medium text-amber-800 mb-2">Функции без привязки к оргединице</div>
          {unassigned.length === 0 ? (
            <p className="text-sm text-slate-500">Все функции привязаны.</p>
          ) : (
            <div className="space-y-1.5">
              {unassigned.map((f) => (
                <div key={f.id} className="flex items-center gap-2 flex-wrap bg-white rounded-md px-2.5 py-1.5 border border-amber-100">
                  <span className="text-sm text-slate-700 flex-1 min-w-0">{f.title}</span>
                  <Select onValueChange={(unitId) => setAssignTarget({ funcId: f.id, unitId: Number(unitId) })}>
                    <SelectTrigger className="h-7 w-[220px] text-xs">
                      <SelectValue placeholder="Привязать к узлу…" />
                    </SelectTrigger>
                    <SelectContent>
                      {nodes.map((n) => (
                        <SelectItem key={n.id} value={String(n.id)} className="text-xs">
                          {n.code} · {n.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {assignTarget?.funcId === f.id && (
                    <Select onValueChange={(role) => assignFunction(f.id, assignTarget.unitId, role)}>
                      <SelectTrigger className="h-7 w-[130px] text-xs">
                        <SelectValue placeholder="Роль…" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r} value={r} className="text-xs">{ROLE_LABELS[r].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        {/* Дерево */}
        <div className="border border-slate-200 rounded-lg p-2 bg-white h-fit">
          {loading ? (
            <div className="p-4 text-sm text-slate-400">Загрузка…</div>
          ) : nodes.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">Оргструктура не задана.</div>
          ) : (
            childrenOf(null).map(renderNode)
          )}
        </div>

        {/* Функции узла */}
        <div className="border border-slate-200 rounded-lg bg-white">
          {!selectedNode ? (
            <div className="p-6 text-sm text-slate-400">Выберите узел слева.</div>
          ) : (
            <>
              <div className="p-3 border-b border-slate-100">
                <div className="text-[11px] text-slate-400 mb-0.5">{selectedNode.path}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-slate-400">{selectedNode.code}</span>
                  <span className="font-semibold text-slate-900">{selectedNode.name}</span>
                  <Badge variant="outline" className="text-[10px]">{(TYPE_LABELS[selectedNode.type] || TYPE_LABELS.division).label}</Badge>
                </div>
              </div>

              <div className="p-3 flex items-center gap-2 flex-wrap border-b border-slate-100 bg-slate-50/50">
                <div className="relative flex-1 min-w-[160px]">
                  <Icon name="Search" size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск функции…" className="h-8 pl-7 text-sm" />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Все роли</SelectItem>
                    {ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r} className="text-xs">{ROLE_LABELS[r].label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={dirFilter} onValueChange={setDirFilter}>
                  <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Направление" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">Все направления</SelectItem>
                    {allDirections.map((d) => <SelectItem key={d.code} value={d.code} className="text-xs">{d.code} {d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 ml-auto">
                  <Switch checked={includeChildren} onCheckedChange={setIncludeChildren} />
                  Включая дочерние
                </label>
              </div>

              <div className="p-3">
                {funcsLoading ? (
                  <div className="text-sm text-slate-400 py-6 text-center">Загрузка…</div>
                ) : filteredFunctions.length === 0 ? (
                  <div className="text-sm text-slate-400 py-6 text-center">
                    {functions.length === 0 ? "К этому узлу пока не привязано функций." : "Нет функций по фильтру."}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredFunctions.map((f) => {
                      const role = ROLE_LABELS[f.role] || ROLE_LABELS.participant;
                      const auto = AUTOMATION_LABELS[f.automation_status] || AUTOMATION_LABELS.manual;
                      return (
                        <div key={`${f.id}-${f.role}-${f.org_unit_id}`} className="border border-slate-100 rounded-md p-2.5 hover:border-slate-200 transition">
                          <div className="flex items-start gap-2">
                            <span className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-slate-800">{f.title}</span>
                              {includeChildren && f.unit_code !== selectedNode.code && (
                                <span className="ml-1.5 text-[10px] font-mono text-slate-400">({f.unit_code})</span>
                              )}
                            </span>
                            <Badge className={`text-[10px] ${role.color} border-0`}>{role.label}</Badge>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                            <Badge className={`text-[10px] ${auto.color} border-0`}>
                              <Icon name="Cpu" size={10} className="mr-0.5" />{auto.label}
                            </Badge>
                            {f.ai_potential_score > 0 && (
                              <Badge variant="outline" className="text-[10px]">AI {f.ai_potential_score}%</Badge>
                            )}
                            {f.directions.map((d) => (
                              <Badge key={d.code} variant="secondary" className="text-[10px]" title={d.name}>
                                {d.code}
                              </Badge>
                            ))}
                            <button
                              onClick={() => unassignFunction(f.id, f.org_unit_id, f.role)}
                              className="ml-auto text-slate-300 hover:text-red-500 transition"
                              title="Снять привязку"
                            >
                              <Icon name="X" size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}