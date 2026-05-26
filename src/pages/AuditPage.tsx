import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { auditApi, documentsApi, fileToBase64 } from "@/lib/api";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";

interface DocForAudit {
  id: number;
  name: string;
  file_type: string;
  extracted_text?: string;
  role: string;
  instruction: string;
}

interface Finding {
  issue_id: string;
  severity: string;
  slide_index: number;
  slide_title: string;
  issue_type: string;
  short_title: string;
  explanation: string;
  evidence_from_presentation: string;
  evidence_from_source_docs: string;
  related_document_name: string;
  violated_criterion: string;
  suggested_fix: string;
  rationale: string;
  confidence: string;
}

interface SlideReport {
  slide_index: number;
  slide_title: string;
  status: string;
  issue_count: number;
  summary: string;
}

interface ComplianceItem {
  criterion: string;
  source: string;
  status: string;
  slide_index: number | null;
  comment: string;
}

interface SuggestedChange {
  slide_index: number;
  slide_title: string;
  action: string;
  current_text: string;
  proposed_text: string;
  rationale: string;
}

interface AuditSummary {
  total_slides: number;
  total_issues: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  compliance_score: number | null;
  key_risks: string[];
}

interface AuditResult {
  audit_summary: AuditSummary;
  findings: Finding[];
  slide_reports: SlideReport[];
  compliance_matrix: ComplianceItem[];
  suggested_changes: SuggestedChange[];
  warnings: string[];
}

const ROLE_OPTIONS = [
  { value: "standard",  label: "📜 Стандарт",  desc: "Нормативы и обязательные требования (высший приоритет)" },
  { value: "criteria",  label: "✅ Критерии",   desc: "Чеклист и критерии оценки" },
  { value: "source",    label: "📚 Источник",   desc: "Факты и формулировки для проверки" },
  { value: "material",  label: "📄 Материал",   desc: "Дополнительный контекст" },
  { value: "template",  label: "🎨 Шаблон",     desc: "Образец структуры (не источник фактов)" },
  { value: "example",   label: "💡 Пример",     desc: "Пример похожей работы" },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high:     "bg-orange-100 text-orange-800 border-orange-200",
  medium:   "bg-amber-100 text-amber-800 border-amber-200",
  low:      "bg-slate-100 text-slate-700 border-slate-200",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "🔴 Критично",
  high:     "🟠 Высокий",
  medium:   "🟡 Средний",
  low:      "⚪ Низкий",
};

const SLIDE_STATUS_COLORS: Record<string, string> = {
  ok:               "text-green-700 bg-green-50",
  needs_attention:  "text-amber-700 bg-amber-50",
  critical:         "text-red-700 bg-red-50",
};

const COMPLIANCE_COLORS: Record<string, string> = {
  met:           "text-green-700",
  partially_met: "text-amber-700",
  not_met:       "text-red-700",
  not_checked:   "text-slate-500",
};

const COMPLIANCE_LABELS: Record<string, string> = {
  met:           "✅ Выполнен",
  partially_met: "⚠️ Частично",
  not_met:       "❌ Не выполнен",
  not_checked:   "— Не проверено",
};

const ACTION_LABELS: Record<string, string> = {
  rewrite: "Переписать",
  add:     "Добавить",
  remove:  "Удалить",
  replace: "Заменить",
};

export default function AuditPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  // Шаг: upload | configure | running | result
  const [step, setStep] = useState<"upload" | "configure" | "running" | "result">("upload");

  const [pptxFile, setPptxFile] = useState<File | null>(null);
  const [projectDocs, setProjectDocs] = useState<DocForAudit[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [running, setRunning] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState("");

  // Фильтры в результате
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterSlide, setFilterSlide] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"findings" | "slides" | "compliance" | "changes">("findings");

  // Загружаем документы проекта
  useEffect(() => {
    if (!projectId) return;
    setLoadingDocs(true);
    documentsApi.list(projectId)
      .then((d) => {
        const docs = (d.documents || d || []).map((doc: { id: number; original_name?: string; name?: string; file_type: string; extracted_text?: string }) => ({
          id: doc.id,
          name: doc.original_name || doc.name || "Документ",
          file_type: doc.file_type,
          extracted_text: doc.extracted_text || "",
          role: "material",
          instruction: "",
        }));
        setProjectDocs(docs);
      })
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  }, [projectId]);

  const handlePptxSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setPptxFile(f);
      setStep("configure");
    }
    e.target.value = "";
  };

  const updateDocRole = (docId: number, role: string) => {
    setProjectDocs((prev) => prev.map((d) => d.id === docId ? { ...d, role } : d));
  };

  const updateDocInstruction = (docId: number, instruction: string) => {
    setProjectDocs((prev) => prev.map((d) => d.id === docId ? { ...d, instruction } : d));
  };

  const handleRunAudit = async () => {
    if (!pptxFile) return;
    setRunning(true);
    setStep("running");
    setError("");
    try {
      const pptxB64 = await fileToBase64(pptxFile);
      const docs = projectDocs
        .filter((d) => d.extracted_text)
        .map((d) => ({
          name: d.name,
          role: d.role,
          text: d.extracted_text || "",
          instruction: d.instruction || undefined,
        }));

      const res = await auditApi.run(projectId, pptxB64, docs);
      setAuditResult(res.result || res);
      setStep("result");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка аудита");
      setStep("configure");
    } finally {
      setRunning(false);
    }
  };

  const summary = auditResult?.audit_summary;

  const filteredFindings = (auditResult?.findings || []).filter((f) => {
    if (filterSeverity !== "all" && f.severity !== filterSeverity) return false;
    if (filterSlide !== "all" && String(f.slide_index) !== filterSlide) return false;
    return true;
  });

  const uniqueSlides = Array.from(
    new Set((auditResult?.findings || []).map((f) => f.slide_index))
  ).sort((a, b) => a - b);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to="/cabinet" className="hover:text-foreground">Кабинет</Link>
          <Icon name="ChevronRight" size={14} />
          <Link to={`/cabinet/project/${projectId}`} className="hover:text-foreground">Проект</Link>
          <Icon name="ChevronRight" size={14} />
          <span className="text-foreground font-medium">Аудит презентации</span>
        </div>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Icon name="ShieldCheck" size={24} className="text-blue-600" />
              Аудит презентации
            </h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-xl">
              Загрузите готовую PPTX и документы-критерии. AI проверит соответствие,
              найдёт противоречия и предложит правки.
            </p>
          </div>
        </div>

        {/* ===== ШАГ 1: Загрузка PPTX ===== */}
        {step === "upload" && (
          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Icon name="FileUp" size={28} className="text-blue-600" />
            </div>
            <h2 className="font-semibold text-lg mb-2">Загрузите презентацию для проверки</h2>
            <p className="text-muted-foreground text-sm mb-6">Поддерживается формат PPTX</p>
            <label className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-sm font-medium cursor-pointer transition-colors">
              <Icon name="Upload" size={16} />
              Выбрать PPTX-файл
              <input type="file" accept=".pptx" className="hidden" onChange={handlePptxSelect} />
            </label>
          </div>
        )}

        {/* ===== ШАГ 2: Настройка документов ===== */}
        {step === "configure" && pptxFile && (
          <div className="space-y-6">
            {/* Выбранный файл */}
            <div className="flex items-center gap-3 border border-green-200 bg-green-50 rounded-xl px-4 py-3">
              <Icon name="FileCheck" size={18} className="text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">{pptxFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(pptxFile.size / 1024 / 1024).toFixed(1)} МБ
                </p>
              </div>
              <button
                onClick={() => { setPptxFile(null); setStep("upload"); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <Icon name="X" size={16} />
              </button>
            </div>

            {/* Документы */}
            <div>
              <h2 className="font-semibold mb-1">Документы для проверки</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Назначьте роль каждому документу. Стандарты и критерии имеют высший приоритет.
              </p>

              {loadingDocs ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
                </div>
              ) : projectDocs.length === 0 ? (
                <div className="text-sm text-muted-foreground border border-slate-200 rounded-xl p-4 text-center">
                  В проекте нет документов. Загрузите их на странице проекта.
                </div>
              ) : (
                <div className="space-y-3">
                  {projectDocs.map((doc) => (
                    <div key={doc.id} className="border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Icon name="FileText" size={16} className="text-slate-400 flex-shrink-0" />
                        <span className="text-sm font-medium flex-1 truncate">{doc.name}</span>
                        <span className="text-xs text-slate-400 uppercase">{doc.file_type}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                        {ROLE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => updateDocRole(doc.id, opt.value)}
                            title={opt.desc}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                              doc.role === opt.value
                                ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                                : "border-slate-200 text-slate-600 hover:border-slate-400"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={doc.instruction}
                        onChange={(e) => updateDocInstruction(doc.id, e.target.value)}
                        placeholder="Доп. инструкция (необязательно)..."
                        className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setPptxFile(null); setStep("upload"); }}
                className="border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2.5 rounded-xl text-sm"
              >
                ← Назад
              </button>
              <button
                onClick={handleRunAudit}
                disabled={running || projectDocs.filter((d) => d.extracted_text).length === 0}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                <Icon name="ShieldCheck" size={16} />
                Запустить проверку
              </button>
            </div>
          </div>
        )}

        {/* ===== ШАГ 3: Выполнение ===== */}
        {step === "running" && (
          <div className="text-center py-20">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <h2 className="font-semibold text-lg mb-2">AI анализирует презентацию</h2>
            <p className="text-muted-foreground text-sm">
              Сравниваем слайды с документами, ищем противоречия и несоответствия...
            </p>
            <p className="text-xs text-muted-foreground mt-2">Обычно занимает 30–60 секунд</p>
          </div>
        )}

        {/* ===== ШАГ 4: Результат ===== */}
        {step === "result" && auditResult && summary && (
          <div className="space-y-6">
            {/* Summary header */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-card">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-semibold text-lg mb-1">Результат аудита</h2>
                  <p className="text-sm text-muted-foreground">
                    {summary.total_slides} слайдов · {projectDocs.filter((d) => d.extracted_text).length} документов
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {summary.compliance_score !== null && (
                    <div className={`text-center px-4 py-2 rounded-xl ${
                      summary.compliance_score >= 80 ? "bg-green-50 text-green-700" :
                      summary.compliance_score >= 60 ? "bg-amber-50 text-amber-700" :
                      "bg-red-50 text-red-700"
                    }`}>
                      <p className="text-2xl font-bold">{summary.compliance_score}%</p>
                      <p className="text-xs font-medium">Соответствие</p>
                    </div>
                  )}
                  <button
                    onClick={() => { setPptxFile(null); setAuditResult(null); setStep("upload"); }}
                    className="border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm"
                  >
                    ← Новая проверка
                  </button>
                </div>
              </div>

              {/* Счётчики */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                {[
                  { label: "Критично", count: summary.critical_count, color: "text-red-700 bg-red-50" },
                  { label: "Высокий", count: summary.high_count,     color: "text-orange-700 bg-orange-50" },
                  { label: "Средний", count: summary.medium_count,   color: "text-amber-700 bg-amber-50" },
                  { label: "Низкий",  count: summary.low_count,      color: "text-slate-600 bg-slate-100" },
                ].map((s) => (
                  <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
                    <p className="text-xl font-bold">{s.count}</p>
                    <p className="text-xs">{s.label}</p>
                  </div>
                ))}
              </div>

              {summary.key_risks && summary.key_risks.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-xs font-medium text-slate-700 mb-2">Ключевые риски:</p>
                  <ul className="space-y-1">
                    {summary.key_risks.map((r, i) => (
                      <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                        <span className="text-red-500 mt-0.5">▸</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Вкладки */}
            <div className="flex gap-1 border border-slate-200 rounded-xl p-1 bg-slate-50 overflow-x-auto">
              {(["findings", "slides", "compliance", "changes"] as const).map((tab) => {
                const labels = { findings: "Замечания", slides: "По слайдам", compliance: "Критерии", changes: "Правки" };
                const counts = {
                  findings: auditResult.findings.length,
                  slides: auditResult.slide_reports.length,
                  compliance: auditResult.compliance_matrix.length,
                  changes: auditResult.suggested_changes.length,
                };
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                      activeTab === tab ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {labels[tab]}
                    {counts[tab] > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        activeTab === tab ? "bg-slate-100" : "bg-slate-200"
                      }`}>
                        {counts[tab]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ─── Findings ─── */}
            {activeTab === "findings" && (
              <div className="space-y-4">
                {/* Фильтры */}
                <div className="flex flex-wrap gap-2">
                  <select
                    value={filterSeverity}
                    onChange={(e) => setFilterSeverity(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
                  >
                    <option value="all">Все уровни</option>
                    <option value="critical">🔴 Критично</option>
                    <option value="high">🟠 Высокий</option>
                    <option value="medium">🟡 Средний</option>
                    <option value="low">⚪ Низкий</option>
                  </select>
                  <select
                    value={filterSlide}
                    onChange={(e) => setFilterSlide(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
                  >
                    <option value="all">Все слайды</option>
                    {uniqueSlides.map((si) => (
                      <option key={si} value={String(si)}>Слайд {si}</option>
                    ))}
                  </select>
                </div>

                {filteredFindings.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Замечаний нет</p>
                ) : (
                  filteredFindings.map((f) => (
                    <div key={f.issue_id} className={`border rounded-xl p-4 space-y-3 ${SEVERITY_COLORS[f.severity] || "border-slate-200"}`}>
                      <div className="flex items-start gap-3 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SEVERITY_COLORS[f.severity]}`}>
                          {SEVERITY_LABELS[f.severity] || f.severity}
                        </span>
                        <span className="text-xs text-slate-500">Слайд {f.slide_index} · {f.slide_title}</span>
                        <span className="text-xs text-slate-400 font-mono">{f.issue_type}</span>
                        {f.confidence === "low" && (
                          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">⚠ Нужна проверка</span>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{f.short_title}</p>
                        <p className="text-sm text-slate-700 mt-1">{f.explanation}</p>
                      </div>
                      {(f.evidence_from_presentation || f.evidence_from_source_docs) && (
                        <div className="grid sm:grid-cols-2 gap-3">
                          {f.evidence_from_presentation && (
                            <div className="bg-white/60 rounded-lg p-3 border border-slate-200">
                              <p className="text-xs font-medium text-slate-500 mb-1">📊 В презентации:</p>
                              <p className="text-xs italic text-slate-700">«{f.evidence_from_presentation}»</p>
                            </div>
                          )}
                          {f.evidence_from_source_docs && (
                            <div className="bg-white/60 rounded-lg p-3 border border-slate-200">
                              <p className="text-xs font-medium text-slate-500 mb-1">📄 В документе{f.related_document_name ? ` (${f.related_document_name})` : ""}:</p>
                              <p className="text-xs italic text-slate-700">«{f.evidence_from_source_docs}»</p>
                            </div>
                          )}
                        </div>
                      )}
                      {f.suggested_fix && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <p className="text-xs font-medium text-green-700 mb-1">💡 Рекомендация:</p>
                          <p className="text-xs text-green-800">{f.suggested_fix}</p>
                          {f.rationale && (
                            <p className="text-xs text-green-600 mt-1 italic">{f.rationale}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ─── Slides ─── */}
            {activeTab === "slides" && (
              <div className="space-y-2">
                {auditResult.slide_reports.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Нет данных по слайдам</p>
                ) : (
                  auditResult.slide_reports.map((sr) => (
                    <div key={sr.slide_index} className="border border-slate-200 rounded-xl p-4 flex items-start gap-4">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {sr.slide_index}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium">{sr.slide_title}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${SLIDE_STATUS_COLORS[sr.status] || "bg-slate-100 text-slate-600"}`}>
                            {sr.status === "ok" ? "✅ OK" : sr.status === "critical" ? "🔴 Критично" : "⚠️ Внимание"}
                            {sr.issue_count > 0 && ` · ${sr.issue_count} замеч.`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">{sr.summary}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ─── Compliance ─── */}
            {activeTab === "compliance" && (
              <div className="space-y-2">
                {auditResult.compliance_matrix.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
                ) : (
                  auditResult.compliance_matrix.map((c, i) => (
                    <div key={i} className="border border-slate-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <span className={`text-xs font-semibold whitespace-nowrap ${COMPLIANCE_COLORS[c.status]}`}>
                          {COMPLIANCE_LABELS[c.status] || c.status}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{c.criterion}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {c.source}
                            {c.slide_index ? ` · Слайд ${c.slide_index}` : ""}
                          </p>
                          {c.comment && <p className="text-xs text-slate-600 mt-1">{c.comment}</p>}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ─── Changes ─── */}
            {activeTab === "changes" && (
              <div className="space-y-4">
                {auditResult.suggested_changes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Нет предложений по правкам</p>
                ) : (
                  auditResult.suggested_changes.map((ch, i) => (
                    <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          {ACTION_LABELS[ch.action] || ch.action}
                        </span>
                        <span className="text-xs text-slate-500">Слайд {ch.slide_index} · {ch.slide_title}</span>
                      </div>
                      {ch.current_text && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-xs text-red-600 font-medium mb-1">Сейчас:</p>
                          <p className="text-xs text-red-800 italic">«{ch.current_text}»</p>
                        </div>
                      )}
                      {ch.proposed_text && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <p className="text-xs text-green-600 font-medium mb-1">Предлагаем:</p>
                          <p className="text-xs text-green-800">«{ch.proposed_text}»</p>
                        </div>
                      )}
                      {ch.rationale && (
                        <p className="text-xs text-slate-500 italic">{ch.rationale}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Warnings */}
            {auditResult.warnings && auditResult.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-medium text-amber-700 mb-2">⚠️ Предупреждения системы:</p>
                {auditResult.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600">• {w}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
