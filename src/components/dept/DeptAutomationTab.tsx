import { useState } from "react";
import { deptFunctionsApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type AutomationRecord = {
  id: number;
  function_id: number;
  function_title: string;
  dept_name: string;
  category: string;
  current_tools: string;
  current_status: string;
  planned_tools: string;
  ai_potential_score: number;
  ai_recommendation: string;
  ai_recommendation_generated: boolean;
  implementation_horizon: string;
  notes: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  manual:    { label: "Ручной",              color: "bg-red-100 text-red-700",    icon: "Hand" },
  partial:   { label: "Частично автом.",     color: "bg-amber-100 text-amber-700", icon: "Zap" },
  automated: { label: "Автоматизирован",     color: "bg-green-100 text-green-700", icon: "Bot" },
  planned:   { label: "Планируется",         color: "bg-blue-100 text-blue-700",   icon: "Calendar" },
};

const HORIZON_LABELS: Record<string, string> = {
  short: "до 3 мес",
  medium: "3–12 мес",
  long: "1–3 года",
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 7 ? "bg-green-500" : score >= 4 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score * 10}%` }} />
      </div>
      <span className="text-sm font-bold text-slate-700 w-6 text-right">{score}</span>
    </div>
  );
}

type Props = {
  projectId: number;
  automation: AutomationRecord[];
  onReload: () => void;
};

export default function DeptAutomationTab({ projectId, automation, onReload }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<AutomationRecord>>({});
  const [recommending, setRecommending] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (rec: AutomationRecord) => {
    setEditing(rec.id);
    setEditData({
      current_tools: rec.current_tools,
      current_status: rec.current_status,
      planned_tools: rec.planned_tools,
      implementation_horizon: rec.implementation_horizon,
      notes: rec.notes,
    });
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    try {
      await deptFunctionsApi.updateAutomation({ id, project_id: projectId, ...editData });
      setEditing(null);
      onReload();
    } finally {
      setSaving(false);
    }
  };

  const getRecommendation = async (rec: AutomationRecord) => {
    setRecommending(rec.function_id);
    try {
      await deptFunctionsApi.aiRecommend({ project_id: projectId, function_id: rec.function_id });
      onReload();
    } finally {
      setRecommending(null);
    }
  };

  const sorted = [...automation].sort((a, b) => b.ai_potential_score - a.ai_potential_score);

  const avgScore = automation.length
    ? Math.round(automation.reduce((s, r) => s + r.ai_potential_score, 0) / automation.length)
    : 0;

  const statuses = automation.reduce<Record<string, number>>((acc, r) => {
    acc[r.current_status] = (acc[r.current_status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Сводка */}
      {automation.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border border-slate-200 rounded-xl p-3 bg-white text-center">
            <p className="text-2xl font-bold text-slate-800">{automation.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Функций</p>
          </div>
          <div className="border border-slate-200 rounded-xl p-3 bg-white text-center">
            <p className="text-2xl font-bold text-green-600">{avgScore}/10</p>
            <p className="text-xs text-muted-foreground mt-0.5">Средний AI-потенциал</p>
          </div>
          <div className="border border-slate-200 rounded-xl p-3 bg-white text-center">
            <p className="text-2xl font-bold text-red-500">{statuses.manual || 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Ручных</p>
          </div>
          <div className="border border-slate-200 rounded-xl p-3 bg-white text-center">
            <p className="text-2xl font-bold text-blue-500">{statuses.automated || 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Автоматизировано</p>
          </div>
        </div>
      )}

      {/* Список */}
      {automation.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Icon name="Bot" size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Нет данных по автоматизации</p>
          <p className="text-sm mt-1">Сначала добавь функции подразделения во вкладке «Функции»</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(rec => {
            const st = STATUS_CONFIG[rec.current_status] || STATUS_CONFIG.manual;
            const isExpanded = expanded === rec.id;
            const isEditing = editing === rec.id;
            const isRecommending = recommending === rec.function_id;

            return (
              <div key={rec.id} className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                {/* Заголовок */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    className="flex-1 flex items-center gap-3 text-left"
                    onClick={() => setExpanded(isExpanded ? null : rec.id)}
                  >
                    <Icon name={isExpanded ? "ChevronDown" : "ChevronRight"} size={14} className="text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-800 truncate">{rec.function_title}</p>
                      {rec.dept_name && <p className="text-xs text-muted-foreground">{rec.dept_name}</p>}
                    </div>
                  </button>
                  <Badge className={`text-xs flex-shrink-0 border-0 ${st.color}`}>{st.label}</Badge>
                  <div className="w-24 flex-shrink-0">
                    <ScoreBar score={rec.ai_potential_score} />
                  </div>
                </div>

                {/* Детали */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-4 py-4 space-y-4">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Текущий статус</label>
                            <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-full"
                              value={editData.current_status}
                              onChange={e => setEditData(p => ({ ...p, current_status: e.target.value }))}>
                              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Горизонт внедрения</label>
                            <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-full"
                              value={editData.implementation_horizon}
                              onChange={e => setEditData(p => ({ ...p, implementation_horizon: e.target.value }))}>
                              {Object.entries(HORIZON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Текущие инструменты</label>
                          <input className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-full"
                            placeholder="1С, Excel, электронная почта..."
                            value={editData.current_tools}
                            onChange={e => setEditData(p => ({ ...p, current_tools: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Планируемые решения</label>
                          <input className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-full"
                            placeholder="RPA, AI-модуль, low-code платформа..."
                            value={editData.planned_tools}
                            onChange={e => setEditData(p => ({ ...p, planned_tools: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Заметки</label>
                          <textarea className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-full resize-none" rows={2}
                            value={editData.notes}
                            onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Отмена</Button>
                          <Button size="sm" onClick={() => saveEdit(rec.id)} disabled={saving}>
                            {saving ? "Сохраняю..." : "Сохранить"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Текущие инструменты</p>
                            <p className="text-slate-700">{rec.current_tools || <span className="text-muted-foreground italic">не указаны</span>}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Планируемые решения</p>
                            <p className="text-slate-700">{rec.planned_tools || <span className="text-muted-foreground italic">не указаны</span>}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Горизонт</p>
                            <p className="text-slate-700">{HORIZON_LABELS[rec.implementation_horizon] || rec.implementation_horizon}</p>
                          </div>
                        </div>

                        {rec.ai_recommendation && (
                          <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                            <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
                              <Icon name="Sparkles" size={12} /> AI-рекомендация
                            </p>
                            <p className="text-sm text-blue-900 leading-relaxed">{rec.ai_recommendation}</p>
                          </div>
                        )}

                        {rec.notes && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Заметки</p>
                            <p className="text-sm text-slate-700">{rec.notes}</p>
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" onClick={() => startEdit(rec)} className="gap-1.5">
                            <Icon name="Pencil" size={12} />Редактировать
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => getRecommendation(rec)}
                            disabled={isRecommending} className="gap-1.5">
                            {isRecommending
                              ? <><Icon name="Loader2" size={12} className="animate-spin" />Анализирую...</>
                              : <><Icon name="Sparkles" size={12} />{rec.ai_recommendation_generated ? "Обновить AI-оценку" : "Получить AI-оценку"}</>
                            }
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
