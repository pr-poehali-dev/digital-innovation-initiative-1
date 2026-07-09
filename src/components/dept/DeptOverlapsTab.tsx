import { useEffect, useState, useCallback } from "react";
import { deptFunctionsApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import SourceCoverageBanner from "@/components/dept/SourceCoverageBanner";

type OverlapUnit = { role: string; unit_id: number; code: string; name: string };
type Cluster = {
  canonical_name: string;
  normalized_key: string;
  function_ids: number[];
  repeat_count: number;
  unit_count: number;
  units: OverlapUnit[];
  directions: string[];
  manual_count: number;
  avg_ai_potential: number;
};
type MatrixItem = {
  unit_a: number;
  unit_b: number;
  count: number;
  a: { code: string; name: string } | null;
  b: { code: string; name: string } | null;
};

type ThinMgmt = { code: string; name: string; own_count: number };

interface Props {
  projectId: number;
  onNavigateToTree?: () => void;
  onNavigateToUpload?: () => void;
}

export default function DeptOverlapsTab({ projectId, onNavigateToTree, onNavigateToUpload }: Props) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [matrix, setMatrix] = useState<MatrixItem[]>([]);
  const [thinManagements, setThinManagements] = useState<ThinMgmt[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      deptFunctionsApi.getOverlapsReport(projectId),
      deptFunctionsApi.getOrgTree(projectId).catch(() => null),
    ])
      .then(([rep, tree]: [{ clusters: Cluster[]; matrix: MatrixItem[] }, { coverage?: { thin_managements: ThinMgmt[] } } | null]) => {
        setClusters(rep.clusters || []);
        setMatrix(rep.matrix || []);
        setThinManagements(tree?.coverage?.thin_managements || []);
      })
      .catch((e: Error) => toast({ title: "Ошибка загрузки отчёта", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="py-10 text-center text-sm text-slate-400">Считаю пересечения…</div>;
  }

  const highManualClusters = clusters.filter((c) => c.manual_count >= 2).length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Пересечения функций</h2>
        <p className="text-sm text-slate-500">
          Одинаковые функции, встречающиеся в нескольких подразделениях — кандидаты на централизацию и автоматизацию.
        </p>
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="border border-slate-200 rounded-lg p-3 bg-white">
          <div className="text-2xl font-bold text-slate-900">{clusters.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">пересечений найдено</div>
        </div>
        <div className="border border-slate-200 rounded-lg p-3 bg-white">
          <div className="text-2xl font-bold text-amber-600">{highManualClusters}</div>
          <div className="text-xs text-slate-500 mt-0.5">из них с ручным трудом в 2+ узлах</div>
        </div>
        <div className="border border-slate-200 rounded-lg p-3 bg-white">
          <div className="text-2xl font-bold text-blue-600">{matrix.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">пар подразделений с общими функциями</div>
        </div>
      </div>

      {clusters.length === 0 ? (
        <div className="space-y-2">
          <SourceCoverageBanner variant="empty" thinManagements={thinManagements} onUpload={onNavigateToUpload} />
          {onNavigateToTree && (
            <div className="text-center">
              <Button variant="ghost" size="sm" onClick={onNavigateToTree}>
                <Icon name="Network" size={14} className="mr-1.5" /> Открыть дерево департамента
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Матрица узел × узел */}
          {matrix.length > 0 && (
            <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 text-sm font-medium text-slate-700">
                Матрица пересечений между подразделениями
              </div>
              <div className="divide-y divide-slate-50">
                {matrix.slice(0, 12).map((m, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="font-mono text-[11px] text-slate-400 w-10">{m.a?.code}</span>
                    <span className="flex-1 min-w-0 truncate text-slate-600">{m.a?.name}</span>
                    <Icon name="ArrowLeftRight" size={13} className="text-slate-300 shrink-0" />
                    <span className="font-mono text-[11px] text-slate-400 w-10">{m.b?.code}</span>
                    <span className="flex-1 min-w-0 truncate text-slate-600">{m.b?.name}</span>
                    <Badge className="bg-blue-100 text-blue-700 border-0 shrink-0">{m.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Кластеры пересечений */}
          <div className="space-y-2.5">
            {clusters.map((c, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3 bg-white">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-800">{c.canonical_name}</span>
                  </span>
                  <Badge className="bg-purple-100 text-purple-700 border-0 shrink-0">
                    в {c.unit_count} подразделениях
                  </Badge>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  {c.units.map((u) => (
                    <Badge key={u.unit_id} variant="secondary" className="text-[11px]" title={u.name}>
                      <span className="font-mono mr-1 text-slate-400">{u.code}</span>{u.name}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap mt-2 pt-2 border-t border-slate-50">
                  {c.manual_count > 0 && (
                    <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">
                      <Icon name="Hand" size={10} className="mr-0.5" /> ручной труд ×{c.manual_count}
                    </Badge>
                  )}
                  {c.avg_ai_potential > 0 && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">
                      <Icon name="Sparkles" size={10} className="mr-0.5" /> AI-потенциал {c.avg_ai_potential}%
                    </Badge>
                  )}
                  {c.directions.map((d) => (
                    <Badge key={d} variant="outline" className="text-[10px]">{d}</Badge>
                  ))}
                  {c.manual_count >= 2 && c.avg_ai_potential >= 50 && (
                    <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] ml-auto">
                      <Icon name="Zap" size={10} className="mr-0.5" /> кандидат на автоматизацию
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}