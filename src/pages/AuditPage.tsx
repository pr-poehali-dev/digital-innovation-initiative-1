import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { auditApi, documentsApi, uploadPptxChunked } from "@/lib/api";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import HelpPanel from "@/components/HelpPanel";

// ------------------------------------------------------------------ //
//  Types                                                               //
// ------------------------------------------------------------------ //

interface DocForAudit {
  id: number;
  name: string;
  file_type: string;
  extracted_text?: string;
  status?: string; // processing | ready | failed
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

interface SlideReport { slide_index: number; slide_title: string; status: string; issue_count: number; summary: string; }
interface ComplianceItem { criterion: string; source: string; status: string; slide_index: number | null; comment: string; }
interface SuggestedChange { slide_index: number; slide_title: string; action: string; current_text: string; proposed_text: string; rationale: string; }

interface AuditSummary {
  total_slides: number; total_issues: number;
  critical_count: number; high_count: number; medium_count: number; low_count: number;
  compliance_score: number | null; key_risks: string[];
}

interface AuditResult {
  audit_summary: AuditSummary;
  findings: Finding[];
  slide_reports: SlideReport[];
  compliance_matrix: ComplianceItem[];
  suggested_changes: SuggestedChange[];
  warnings: string[];
}

interface PlanItem {
  plan_item_id: string;
  slide_index: number;
  slide_title: string;
  change_type: string;
  based_on_finding_ids: string[];
  problem_summary: string;
  proposed_change: string;
  rationale: string;
  confidence: string;
  will_affect_visual: boolean;
  visual_action: string;
  requires_user_review: boolean;
  priority: number;
}

interface RevisionPlan {
  revision_plan: PlanItem[];
  revision_summary: { total_changes: number; slides_affected: number[]; will_add_slides: boolean; expected_improvement: string; manual_review_required: string[] };
  generate_instruction: string;
  applicable_findings: Finding[];
  skipped_findings: { issue_id: string; reason: string }[];
  options: Record<string, unknown>;
}

interface RevisionResult {
  run_id?: number;
  task_id?: number;
  version?: number;
  content?: string;
  revision_meta?: {
    source_audit_run_id: number;
    revision_mode: string;
    applied_finding_ids: string[];
    applied_plan_item_ids: string[];
    skipped_plan_item_ids: string[];
    visual_changes: { slide_index: number; visual_action: string; reason: string }[];
    warnings: string[];
  };
}

// ------------------------------------------------------------------ //
//  Constants                                                           //
// ------------------------------------------------------------------ //

const ROLE_OPTIONS = [
  { value: "standard", label: "📜 Стандарт",  desc: "Нормативы и обязательные требования" },
  { value: "criteria", label: "✅ Критерии",   desc: "Чеклист и критерии оценки" },
  { value: "source",   label: "📚 Источник",   desc: "Факты и формулировки для проверки" },
  { value: "material", label: "📄 Материал",   desc: "Дополнительный контекст" },
  { value: "template", label: "🎨 Шаблон",     desc: "Образец структуры (не источник фактов)" },
  { value: "example",  label: "💡 Пример",     desc: "Пример похожей работы" },
];

const SEV_COLOR: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high:     "bg-orange-100 text-orange-800 border-orange-200",
  medium:   "bg-amber-100 text-amber-800 border-amber-200",
  low:      "bg-slate-100 text-slate-700 border-slate-200",
};
const SEV_LABEL: Record<string, string> = {
  critical: "🔴 Критично", high: "🟠 Высокий", medium: "🟡 Средний", low: "⚪ Низкий",
};
const COMPLIANCE_COLOR: Record<string, string> = {
  met: "text-green-700", partially_met: "text-amber-700", not_met: "text-red-700", not_checked: "text-slate-500",
};
const COMPLIANCE_LABEL: Record<string, string> = {
  met: "✅ Выполнен", partially_met: "⚠️ Частично", not_met: "❌ Не выполнен", not_checked: "— Н/п",
};
const CHANGE_TYPE_LABEL: Record<string, string> = {
  rewrite_text: "✏️ Переписать",
  add_missing_point: "➕ Добавить тезис",
  remove_unsupported_claim: "🗑 Убрать необоснованное",
  replace_terminology: "🔤 Заменить термин",
  add_missing_slide: "📄 Добавить слайд",
  restructure_slide: "🔀 Реструктурировать",
  update_numbers: "🔢 Обновить данные",
  mark_for_manual_review: "👁 Ручная проверка",
};
const VISUAL_ACTION_LABEL: Record<string, string> = {
  keep: "✅ Сохранить визуал",
  needs_review: "👁 Требует проверки",
  needs_regeneration: "♻️ Перегенерировать",
  preserve_user_override: "👤 Сохранить (заменён пользователем)",
};

// ------------------------------------------------------------------ //
//  Setup CORS — одноразовая кнопка для настройки bucket               //
// ------------------------------------------------------------------ //

function SetupCorsButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  const handleClick = async () => {
    const token = prompt("Введи CORS_SETUP_TOKEN из секретов:");
    if (!token) return;
    setStatus("loading");
    try {
      const res = await auditApi.setupCors(token) as { message?: string };
      setMsg(res.message || "Готово");
      setStatus("ok");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Ошибка");
      setStatus("err");
    }
  };

  if (status === "ok") return <p className="mt-4 text-xs text-green-600">✓ {msg} — CORS настроен, кнопку можно убрать</p>;
  return (
    <div className="mt-6">
      <button
        onClick={handleClick}
        disabled={status === "loading"}
        className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
      >
        {status === "loading" ? "Настраиваем…" : "⚙ Настроить CORS (одноразово)"}
      </button>
      {status === "err" && <p className="mt-1 text-xs text-red-500">{msg}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ //
//  Main component                                                      //
// ------------------------------------------------------------------ //

export default function AuditPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  type Step = "upload" | "configure" | "running" | "result" | "plan" | "revising" | "revised" | "reauditing";
  const [step, setStep] = useState<Step>("upload");

  const [pptxFile, setPptxFile]       = useState<File | null>(null);
  const [pptxUploadId, setPptxUploadId] = useState<string>("");
  const [uploadingPptx, setUploadingPptx] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [projectDocs, setProjectDocs] = useState<DocForAudit[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [running, setRunning]         = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [currentAuditId, setCurrentAuditId] = useState<number | null>(null);
  const [error, setError]             = useState("");

  // Findings filters
  const [filterSev, setFilterSev]     = useState("all");
  const [filterSlide, setFilterSlide] = useState("all");
  const [activeTab, setActiveTab]     = useState<"findings"|"slides"|"compliance"|"changes">("findings");

  // Revision
  const [revisionOptions, setRevisionOptions] = useState({
    revision_mode: "fix_text",
    severity_filter: ["critical", "high"],
    exclude_low_confidence: true,
    keep_slide_count: true,
    allow_add_slides: false,
    keep_visuals: true,
  });
  const [revisionPlan, setRevisionPlan]       = useState<RevisionPlan | null>(null);
  const [buildingPlan, setBuildingPlan]       = useState(false);
  const [confirmedItems, setConfirmedItems]   = useState<Set<string>>(new Set());
  const [revisionResult, setRevisionResult]   = useState<RevisionResult | null>(null);
  const [reauditResult, setReauditResult]     = useState<Record<string, unknown> | null>(null);

  // Load docs + polling пока есть processing
  const loadDocs = (silent = false) => {
    if (!projectId) return;
    if (!silent) setLoadingDocs(true);
    documentsApi.list(projectId)
      .then((d) => {
        setProjectDocs((prev) => {
          const fresh = (d.documents || d || []).map((doc: Record<string, unknown>) => {
            const existing = prev.find(p => p.id === (doc.id as number));
            return {
              id: doc.id as number,
              name: (doc.original_name || doc.name || "Документ") as string,
              file_type: doc.file_type as string,
              extracted_text: (doc.extracted_text || "") as string,
              status: (doc.status || "ready") as string,
              role: existing?.role ?? "material",
              instruction: existing?.instruction ?? "",
            };
          });
          return fresh;
        });
      })
      .catch(() => {})
      .finally(() => { if (!silent) setLoadingDocs(false); });
  };

  useEffect(() => { loadDocs(); }, [projectId]);

  // Polling: обновляем список каждые 8 сек пока есть документы в статусе processing
  useEffect(() => {
    const hasProcessing = projectDocs.some(d => d.status === "processing");
    if (!hasProcessing) return;
    const timer = setTimeout(() => loadDocs(true), 8000);
    return () => clearTimeout(timer);
  }, [projectDocs]);

  const handlePptxSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPptxFile(f);
    setUploadError("");
    setError("");
    setUploadingPptx(true);
    setUploadProgress(0);
    try {
      const uploadId = await uploadPptxChunked(projectId, f, setUploadProgress);
      setPptxUploadId(uploadId);
      setStep("configure");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "попробуйте ещё раз";
      setUploadError(msg);
      setPptxFile(null);
      setPptxUploadId("");
    } finally {
      setUploadingPptx(false);
    }
    e.target.value = "";
  };

  const getDocsPayload = () =>
    projectDocs.map((d) => ({
      document_id: d.id, role: d.role, instruction: d.instruction || undefined,
    }));

  const hasAnyDocs = projectDocs.length > 0;
  const docsProcessing = projectDocs.filter((d) => d.status === "processing");
  const docsFailed = projectDocs.filter((d) => d.status === "failed");
  const docsReady = projectDocs.filter((d) => d.status !== "processing" && d.status !== "failed");

  const handleRunAudit = async () => {
    if (!pptxFile || !pptxUploadId) return;
    setRunning(true);
    setStep("running");
    setError("");
    try {
      const res = await auditApi.run(projectId, pptxUploadId, getDocsPayload());
      setAuditResult(res.data?.result || res.result || res);
      setCurrentAuditId(res.data?.audit_id || res.audit_id || null);
      setStep("result");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка аудита");
      setStep("configure");
    } finally {
      setRunning(false);
    }
  };

  const handleBuildPlan = async () => {
    if (!currentAuditId) return;
    setBuildingPlan(true);
    try {
      const res = await auditApi.buildRevisionPlan(currentAuditId, revisionOptions);
      const plan: RevisionPlan = res.data?.revision_plan || res.revision_plan;
      setRevisionPlan(plan);
      // По умолчанию подтверждаем все, кроме requires_user_review
      const defaults = new Set<string>();
      (plan.revision_plan || []).forEach((p) => {
        if (!p.requires_user_review && p.confidence !== "low") defaults.add(p.plan_item_id);
      });
      setConfirmedItems(defaults);
      setStep("plan");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка построения плана");
    } finally {
      setBuildingPlan(false);
    }
  };

  const handleCreateRevision = async () => {
    if (!currentAuditId || !revisionPlan) return;
    setStep("revising");
    try {
      const res = await auditApi.createRevisionRun(
        currentAuditId,
        getDocsPayload(),
        undefined,
        Array.from(confirmedItems),
      );
      setRevisionResult(res.data || res);
      setStep("revised");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка создания версии");
      setStep("plan");
    }
  };

  const handleReaudit = async () => {
    if (!currentAuditId) return;
    setStep("reauditing");
    try {
      const res = await auditApi.runReaudit(currentAuditId, getDocsPayload());
      setReauditResult(res.data?.reaudit || res.reaudit);
      setStep("revised");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка повторного аудита");
      setStep("revised");
    }
  };

  const summary = auditResult?.audit_summary;

  const filteredFindings = (auditResult?.findings || []).filter((f) => {
    if (filterSev !== "all" && f.severity !== filterSev) return false;
    if (filterSlide !== "all" && String(f.slide_index) !== filterSlide) return false;
    return true;
  });
  const uniqueSlides = Array.from(new Set((auditResult?.findings || []).map((f) => f.slide_index))).sort((a,b)=>a-b);

  // ---------------------------------------------------------------- //
  //  Render                                                            //
  // ---------------------------------------------------------------- //
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

        <div className="mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Icon name="ShieldCheck" size={24} className="text-blue-600" />
            Аудит презентации
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-xl">
            Загрузите готовую PPTX — AI найдёт ошибки, противоречия и предложит конкретные правки.
          </p>
        </div>

        <HelpPanel
          title="Как пользоваться аудитом"
          summary="Загрузите презентацию и документы-критерии. AI сравнит содержимое со стандартами и источниками, найдёт несоответствия и предложит исправления."
          steps={[
            { num: 1, title: "Загрузите PPTX", description: "Выберите готовую презентацию в формате .pptx. Это та версия, которую хотите проверить." },
            { num: 2, title: "Назначьте роли документам", description: "Документы проекта отображаются автоматически. Укажите роль каждого: Стандарт, Критерии, Источник и т.д." },
            { num: 3, title: "Запустите проверку", description: "AI прочитает слайды и сравнит с вашими документами. Займёт 30–60 секунд." },
            { num: 4, title: "Изучите замечания", description: "Каждое замечание содержит цитату из слайда, цитату из документа и конкретную рекомендацию." },
            { num: 5, title: "Создайте исправленную версию", description: "Выберите режим правок, просмотрите план изменений и запустите генерацию исправленной версии." },
          ]}
          sections={[
            {
              title: "Роли документов — что они значат",
              icon: "Tag",
              subsections: [
                { title: "📜 Стандарт", content: "Нормативный документ с обязательными требованиями. Высший приоритет для проверки." },
                { title: "✅ Критерии", content: "Чеклист оценки или требования к содержанию. AI проверяет выполнение каждого пункта." },
                { title: "📚 Источник", content: "Документ с фактами и правильными формулировками. AI ищет противоречия с ним." },
                { title: "🎨 Шаблон / Пример", content: "Только для проверки структуры. AI не считает шаблон источником фактической истины." },
              ],
            },
            {
              title: "Как читать замечания",
              icon: "AlertCircle",
              subsections: [
                { title: "🔴 Критично", content: "Серьёзное нарушение требований. Исправить обязательно." },
                { title: "🟠 Высокий", content: "Значимая проблема, влияет на оценку или восприятие." },
                { title: "🟡 Средний", content: "Желательно исправить, но некритично." },
                { title: "⚠ Нужна проверка", content: "AI не уверен — проверьте вручную перед внесением изменений." },
              ],
            },
            {
              title: "Как работает план исправлений",
              icon: "ClipboardList",
              content: "После просмотра замечаний нажмите «Создать исправленную версию». Настройте режим и фильтры — AI составит пошаговый план. Каждый пункт можно включить или выключить чекбоксом. Спорные пункты отключены по умолчанию.",
            },
          ]}
          tips={[
            { kind: "tip", text: "Чем точнее роли документов — тем точнее аудит. Стандарт важнее Примера." },
            { kind: "warning", text: "Если AI пометил замечание «Нужна проверка» — не применяйте его автоматически, сначала проверьте вручную." },
            { kind: "example", text: "После исправлений запустите «Повторный аудит» — увидите, насколько улучшился score соответствия." },
          ]}
        />

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* ===== UPLOAD ===== */}
        {step === "upload" && (
          <div className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${uploadError ? "border-red-300 bg-red-50" : "border-slate-300"}`}>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
              uploadingPptx ? "bg-slate-100" : uploadError ? "bg-red-100" : "bg-blue-50"
            }`}>
              {uploadingPptx
                ? <div className="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                : uploadError
                ? <Icon name="AlertCircle" size={28} className="text-red-500" />
                : <Icon name="FileUp" size={28} className="text-blue-600" />
              }
            </div>
            <h2 className="font-semibold text-lg mb-2">
              {uploadingPptx ? "Загружаем файл…"
               : uploadError ? "Не удалось загрузить файл"
               : "Загрузите презентацию для проверки"}
            </h2>
            <p className={`text-sm mb-4 ${uploadError ? "text-red-600" : "text-muted-foreground"}`}>
              {uploadingPptx ? pptxFile?.name
               : uploadError ? uploadError
               : "Поддерживается PPTX · максимум 50 МБ"}
            </p>
            {uploadingPptx && (
              <div className="w-full max-w-xs mx-auto mb-6">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Загрузка {pptxFile?.name}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}
            {!uploadingPptx && (
              <label className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium cursor-pointer transition-colors text-white ${
                uploadError ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
              }`}>
                <Icon name={uploadError ? "RefreshCw" : "Upload"} size={16} />
                {uploadError ? "Попробовать снова" : "Выбрать PPTX"}
                <input type="file" accept=".pptx" className="hidden" onChange={handlePptxSelect} />
              </label>
            )}
            <SetupCorsButton />
          </div>
        )}

        {/* ===== CONFIGURE ===== */}
        {step === "configure" && pptxFile && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 border border-green-200 bg-green-50 rounded-xl px-4 py-3">
              <Icon name="FileCheck" size={18} className="text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">{pptxFile.name}</p>
                <p className="text-xs text-muted-foreground">{(pptxFile.size/1024/1024).toFixed(1)} МБ</p>
              </div>
              <button onClick={() => { setPptxFile(null); setPptxUploadId(""); setStep("upload"); }} className="text-slate-400 hover:text-slate-600">
                <Icon name="X" size={16} />
              </button>
            </div>

            <div>
              <h2 className="font-semibold mb-1">Документы для проверки</h2>
              <p className="text-xs text-muted-foreground mb-4">Назначьте роль каждому документу.</p>
              {loadingDocs ? (
                <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse"/>)}</div>
              ) : projectDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4 border border-slate-200 rounded-xl">
                  В проекте нет документов.
                </p>
              ) : (
                <div className="space-y-3">
                  {projectDocs.map((doc) => (
                    <div key={doc.id} className="border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Icon name="FileText" size={15} className="text-slate-400 flex-shrink-0" />
                        <span className="text-sm font-medium flex-1 truncate">{doc.name}</span>
                        <span className="text-xs text-slate-400 uppercase">{doc.file_type}</span>
                        {doc.status === "processing"
                          ? <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md flex-shrink-0 animate-pulse">⚙ Обработка…</span>
                          : doc.status === "failed"
                          ? <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md flex-shrink-0" title="Не удалось извлечь текст из документа">✗ Ошибка</span>
                          : <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-md flex-shrink-0">✓ Готов</span>
                        }
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {ROLE_OPTIONS.map((opt) => (
                          <button key={opt.value} onClick={() => setProjectDocs((p) => p.map(d => d.id===doc.id ? {...d,role:opt.value} : d))}
                            title={opt.desc}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${doc.role===opt.value ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <input type="text" value={doc.instruction}
                        onChange={(e) => setProjectDocs((p) => p.map(d => d.id===doc.id ? {...d,instruction:e.target.value} : d))}
                        placeholder="Доп. инструкция..."
                        className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"/>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Нет документов */}
            {projectDocs.length === 0 && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <Icon name="AlertTriangle" size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Нет документов для проверки</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Загрузите хотя бы один документ в проект — стандарт, критерии или источник.{" "}
                    <Link to={`/cabinet/project/${projectId}`} className="underline hover:text-amber-900">Перейти в проект →</Link>
                  </p>
                </div>
              </div>
            )}

            {/* Все документы ещё обрабатываются */}
            {docsProcessing.length > 0 && docsReady.length === 0 && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <Icon name="Loader" size={16} className="text-amber-600 flex-shrink-0 mt-0.5 animate-spin" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Документы обрабатываются…</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Статус обновляется автоматически. Запуск возможен как только хотя бы один документ будет готов.
                  </p>
                </div>
              </div>
            )}

            {/* Часть обрабатывается */}
            {docsProcessing.length > 0 && docsReady.length > 0 && (
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <Icon name="Info" size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800">
                  {docsProcessing.length} из {projectDocs.length} документов ещё обрабатываются — AI проверит только готовые. Статус обновляется автоматически.
                </p>
              </div>
            )}

            {/* Ошибки обработки */}
            {docsFailed.length > 0 && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <Icon name="AlertCircle" size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-800">
                  {docsFailed.length} документ(ов) не удалось обработать (отмечены красным). Они не будут учтены при проверке.
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => { setPptxFile(null); setPptxUploadId(""); setUploadError(""); setStep("upload"); }}
                className="border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2.5 rounded-xl text-sm">
                ← Назад
              </button>
              <button onClick={handleRunAudit}
                disabled={running || !hasAnyDocs || !pptxUploadId || docsReady.length === 0}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl text-sm font-medium">
                <Icon name="ShieldCheck" size={16} />
                Запустить проверку
              </button>
              {!hasAnyDocs && (
                <p className="text-xs text-slate-500">Сначала загрузите документы в проект</p>
              )}
              {hasAnyDocs && docsReady.length === 0 && (
                <p className="text-xs text-slate-500">Ждём обработки документов…</p>
              )}
              <button onClick={() => loadDocs(true)} className="text-xs text-slate-400 hover:text-slate-600 underline">
                Обновить
              </button>
            </div>
          </div>
        )}

        {/* ===== RUNNING / REVISING / REAUDITING ===== */}
        {(step === "running" || step === "revising" || step === "reauditing") && (
          <div className="text-center py-20">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"/>
            <h2 className="font-semibold text-lg mb-2">
              {step === "running"    ? "AI анализирует презентацию..." :
               step === "revising"  ? "Создаю исправленную версию..." :
               "Повторная проверка..."}
            </h2>
            <p className="text-muted-foreground text-sm">Обычно 30–90 секунд</p>
          </div>
        )}

        {/* ===== RESULT ===== */}
        {step === "result" && auditResult && summary && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-card">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-semibold text-lg">Результат аудита</h2>
                  <p className="text-sm text-muted-foreground">{summary.total_slides} слайдов · {getDocsPayload().length} документов</p>
                </div>
                <div className="flex items-center gap-3">
                  {summary.compliance_score !== null && (
                    <div className={`text-center px-4 py-2 rounded-xl ${summary.compliance_score >= 80 ? "bg-green-50 text-green-700" : summary.compliance_score >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                      <p className="text-2xl font-bold">{summary.compliance_score}%</p>
                      <p className="text-xs font-medium">Соответствие</p>
                    </div>
                  )}
                  <button onClick={() => { setPptxFile(null); setAuditResult(null); setStep("upload"); }}
                    className="border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm">
                    ← Новая проверка
                  </button>
                </div>
              </div>

              {/* Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                {[
                  { label: "Критично", count: summary.critical_count, cls: "text-red-700 bg-red-50" },
                  { label: "Высокий",  count: summary.high_count,     cls: "text-orange-700 bg-orange-50" },
                  { label: "Средний",  count: summary.medium_count,   cls: "text-amber-700 bg-amber-50" },
                  { label: "Низкий",   count: summary.low_count,      cls: "text-slate-600 bg-slate-100" },
                ].map((s) => (
                  <div key={s.label} className={`rounded-xl p-3 text-center ${s.cls}`}>
                    <p className="text-xl font-bold">{s.count}</p>
                    <p className="text-xs">{s.label}</p>
                  </div>
                ))}
              </div>

              {summary.key_risks && summary.key_risks.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-xs font-medium text-slate-700 mb-2">Ключевые риски:</p>
                  <ul className="space-y-1">{summary.key_risks.map((r,i) => (
                    <li key={i} className="text-xs text-slate-600 flex gap-1.5"><span className="text-red-500">▸</span>{r}</li>
                  ))}</ul>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border border-slate-200 rounded-xl p-1 bg-slate-50 overflow-x-auto">
              {(["findings","slides","compliance","changes"] as const).map((tab) => {
                const labels = { findings:"Замечания", slides:"По слайдам", compliance:"Критерии", changes:"Правки" };
                const counts = { findings:auditResult.findings.length, slides:auditResult.slide_reports.length, compliance:auditResult.compliance_matrix.length, changes:auditResult.suggested_changes.length };
                return (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab===tab ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {labels[tab]}
                    {counts[tab] > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab===tab?"bg-slate-100":"bg-slate-200"}`}>{counts[tab]}</span>}
                  </button>
                );
              })}
            </div>

            {/* Findings */}
            {activeTab === "findings" && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <select value={filterSev} onChange={(e) => setFilterSev(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
                    <option value="all">Все уровни</option>
                    <option value="critical">🔴 Критично</option>
                    <option value="high">🟠 Высокий</option>
                    <option value="medium">🟡 Средний</option>
                    <option value="low">⚪ Низкий</option>
                  </select>
                  <select value={filterSlide} onChange={(e) => setFilterSlide(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
                    <option value="all">Все слайды</option>
                    {uniqueSlides.map((si) => <option key={si} value={String(si)}>Слайд {si}</option>)}
                  </select>
                </div>
                {filteredFindings.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Замечаний нет</p>
                ) : filteredFindings.map((f) => (
                  <div key={f.issue_id} className={`border rounded-xl p-4 space-y-3 ${SEV_COLOR[f.severity]||"border-slate-200"}`}>
                    <div className="flex items-start gap-3 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SEV_COLOR[f.severity]}`}>{SEV_LABEL[f.severity]||f.severity}</span>
                      <span className="text-xs text-slate-500">Слайд {f.slide_index} · {f.slide_title}</span>
                      <span className="text-xs text-slate-400 font-mono">{f.issue_type}</span>
                      {f.confidence==="low" && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">⚠ Нужна проверка</span>}
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
                            <p className="text-xs font-medium text-slate-500 mb-1">📄 {f.related_document_name||"Документ"}:</p>
                            <p className="text-xs italic text-slate-700">«{f.evidence_from_source_docs}»</p>
                          </div>
                        )}
                      </div>
                    )}
                    {f.suggested_fix && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-green-700 mb-1">💡 Рекомендация:</p>
                        <p className="text-xs text-green-800">{f.suggested_fix}</p>
                        {f.rationale && <p className="text-xs text-green-600 mt-1 italic">{f.rationale}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Slides */}
            {activeTab === "slides" && (
              <div className="space-y-2">
                {auditResult.slide_reports.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
                  : auditResult.slide_reports.map((sr) => (
                    <div key={sr.slide_index} className="border border-slate-200 rounded-xl p-4 flex items-start gap-4">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold flex-shrink-0">{sr.slide_index}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium">{sr.slide_title}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${sr.status==="ok"?"bg-green-50 text-green-700":sr.status==="critical"?"bg-red-50 text-red-700":"bg-amber-50 text-amber-700"}`}>
                            {sr.status==="ok"?"✅ OK":sr.status==="critical"?"🔴 Критично":"⚠️ Внимание"}
                            {sr.issue_count > 0 && ` · ${sr.issue_count}`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">{sr.summary}</p>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Compliance */}
            {activeTab === "compliance" && (
              <div className="space-y-2">
                {auditResult.compliance_matrix.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
                  : auditResult.compliance_matrix.map((c, i) => (
                    <div key={i} className="border border-slate-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <span className={`text-xs font-semibold whitespace-nowrap ${COMPLIANCE_COLOR[c.status]}`}>{COMPLIANCE_LABEL[c.status]||c.status}</span>
                        <div>
                          <p className="text-sm font-medium">{c.criterion}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{c.source}{c.slide_index ? ` · Слайд ${c.slide_index}` : ""}</p>
                          {c.comment && <p className="text-xs text-slate-600 mt-1">{c.comment}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Changes */}
            {activeTab === "changes" && (
              <div className="space-y-4">
                {auditResult.suggested_changes.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-8">Нет предложений</p>
                  : auditResult.suggested_changes.map((ch, i) => (
                    <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{ch.action}</span>
                        <span className="text-xs text-slate-500">Слайд {ch.slide_index} · {ch.slide_title}</span>
                      </div>
                      {ch.current_text && <div className="bg-red-50 border border-red-200 rounded-lg p-3"><p className="text-xs text-red-600 font-medium mb-1">Сейчас:</p><p className="text-xs italic text-red-800">«{ch.current_text}»</p></div>}
                      {ch.proposed_text && <div className="bg-green-50 border border-green-200 rounded-lg p-3"><p className="text-xs text-green-600 font-medium mb-1">Предлагаем:</p><p className="text-xs text-green-800">«{ch.proposed_text}»</p></div>}
                      {ch.rationale && <p className="text-xs text-slate-500 italic">{ch.rationale}</p>}
                    </div>
                  ))}
              </div>
            )}

            {auditResult.warnings && auditResult.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-medium text-amber-700 mb-2">⚠️ Предупреждения:</p>
                {auditResult.warnings.map((w,i) => <p key={i} className="text-xs text-amber-600">• {w}</p>)}
              </div>
            )}

            {/* ===== REVISION LAUNCHER ===== */}
            {(summary.critical_count > 0 || summary.high_count > 0 || summary.medium_count > 0) && (
              <RevisionLauncher
                options={revisionOptions}
                onOptionsChange={setRevisionOptions}
                onBuildPlan={handleBuildPlan}
                building={buildingPlan}
                findingCounts={{ critical: summary.critical_count, high: summary.high_count, medium: summary.medium_count }}
              />
            )}
          </div>
        )}

        {/* ===== PLAN ===== */}
        {step === "plan" && revisionPlan && (
          <RevisionPlanView
            plan={revisionPlan}
            confirmedItems={confirmedItems}
            onToggleItem={(id) => setConfirmedItems((prev) => {
              const next = new Set(prev);
              if (next.has(id)) { next.delete(id); } else { next.add(id); }
              return next;
            })}
            onConfirmAll={() => setConfirmedItems(new Set(revisionPlan.revision_plan.map(p => p.plan_item_id)))}
            onBack={() => setStep("result")}
            onCreate={handleCreateRevision}
          />
        )}

        {/* ===== REVISED ===== */}
        {step === "revised" && revisionResult && (
          <RevisedView
            result={revisionResult}
            reaudit={reauditResult}
            projectId={projectId}
            onReaudit={handleReaudit}
            onNewAudit={() => { setPptxFile(null); setPptxUploadId(""); setUploadError(""); setAuditResult(null); setRevisionResult(null); setRevisionPlan(null); setReauditResult(null); setStep("upload"); }}
          />
        )}
      </div>
    </Layout>
  );
}

// ================================================================ //
//  RevisionLauncher sub-component                                   //
// ================================================================ //

function RevisionLauncher({ options, onOptionsChange, onBuildPlan, building, findingCounts }:{
  options: Record<string, unknown>;
  onOptionsChange: (o: Record<string, unknown>) => void;
  onBuildPlan: () => void;
  building: boolean;
  findingCounts: { critical: number; high: number; medium: number };
}) {
  const totalApplicable = findingCounts.critical + findingCounts.high;
  const sevFilter = options.severity_filter as string[] || ["critical","high"];

  const toggleSev = (sev: string) => {
    const next = sevFilter.includes(sev) ? sevFilter.filter(s=>s!==sev) : [...sevFilter, sev];
    onOptionsChange({ ...options, severity_filter: next });
  };

  return (
    <div className="border-2 border-blue-200 bg-blue-50/50 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="Wand2" size={18} className="text-blue-600" />
        <h3 className="font-semibold text-blue-900">Создать исправленную версию</h3>
      </div>

      <div className="space-y-4">
        {/* Режим */}
        <div>
          <p className="text-xs font-medium text-slate-600 mb-2">Режим исправления</p>
          <div className="grid sm:grid-cols-3 gap-2">
            {[
              { val: "fix_text", label: "Только текст", desc: "Переписываем формулировки, структура не меняется" },
              { val: "fix_and_add", label: "Текст + блоки", desc: "Можно добавить недостающие тезисы / разделы" },
              { val: "full_revision", label: "Полная редакция", desc: "Разрешена реструктуризация по findings" },
            ].map((m) => (
              <button key={m.val} onClick={() => onOptionsChange({ ...options, revision_mode: m.val })}
                title={m.desc}
                className={`text-xs px-3 py-2 rounded-lg border text-left transition-colors ${options.revision_mode===m.val ? "border-blue-500 bg-white text-blue-700 font-medium shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>
                {m.label}
                <span className="block text-slate-400 font-normal mt-0.5 text-[10px] leading-tight">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Фильтр severity */}
        <div>
          <p className="text-xs font-medium text-slate-600 mb-2">Применять замечания</p>
          <div className="flex flex-wrap gap-2">
            {[
              { val: "critical", label: `🔴 Критично (${findingCounts.critical})` },
              { val: "high",     label: `🟠 Высокий (${findingCounts.high})` },
              { val: "medium",   label: `🟡 Средний (${findingCounts.medium})` },
            ].map((s) => (
              <button key={s.val} onClick={() => toggleSev(s.val)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${sevFilter.includes(s.val) ? "border-blue-500 bg-blue-100 text-blue-700 font-medium" : "border-slate-200 bg-white text-slate-500"}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Переключатели */}
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { key: "exclude_low_confidence", label: "Исключить замечания с низкой уверенностью AI" },
            { key: "keep_slide_count",        label: "Сохранять число слайдов" },
            { key: "allow_add_slides",        label: "Разрешить добавление новых слайдов" },
            { key: "keep_visuals",            label: "Сохранять текущие визуалы" },
          ].map((opt) => (
            <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={Boolean(options[opt.key])}
                onChange={(e) => onOptionsChange({ ...options, [opt.key]: e.target.checked })}
                className="w-4 h-4 rounded accent-blue-600"/>
              <span className="text-xs text-slate-700">{opt.label}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-blue-200">
          <p className="text-xs text-blue-700">
            Будет применено: <b>{sevFilter.includes("critical")?findingCounts.critical:0} + {sevFilter.includes("high")?findingCounts.high:0}</b> замечаний
          </p>
          <button onClick={onBuildPlan} disabled={building}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium">
            <Icon name={building ? "Loader" : "ClipboardList"} size={15} className={building ? "animate-spin" : ""} />
            {building ? "Строю план..." : "Сформировать план →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ================================================================ //
//  RevisionPlanView sub-component                                   //
// ================================================================ //

function RevisionPlanView({ plan, confirmedItems, onToggleItem, onConfirmAll, onBack, onCreate }: {
  plan: RevisionPlan;
  confirmedItems: Set<string>;
  onToggleItem: (id: string) => void;
  onConfirmAll: () => void;
  onBack: () => void;
  onCreate: () => void;
}) {
  const rs = plan.revision_summary;
  const items = plan.revision_plan || [];
  const confirmed = items.filter(p => confirmedItems.has(p.plan_item_id)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm">← Назад</button>
        <div>
          <h2 className="font-semibold text-lg">План исправлений</h2>
          <p className="text-sm text-muted-foreground">{confirmed} из {items.length} изменений выбрано</p>
        </div>
      </div>

      {/* Summary */}
      <div className="border border-slate-200 rounded-2xl p-4 bg-card space-y-3">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1">
            <p className="text-sm font-semibold">Ожидаемый результат</p>
            <p className="text-sm text-slate-600 mt-1">{rs?.expected_improvement || "—"}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-700">{rs?.total_changes || items.length}</p>
            <p className="text-xs text-slate-500">изменений</p>
          </div>
        </div>
        {rs?.manual_review_required && rs.manual_review_required.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-700 font-medium">⚠️ Требуют ручной проверки: {rs.manual_review_required.join(", ")}</p>
          </div>
        )}

        {/* Применяемые / пропущенные findings */}
        <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <div>
            <p className="text-xs font-medium text-green-700 mb-1">✅ Будут применены ({plan.applicable_findings?.length||0})</p>
            {(plan.applicable_findings||[]).slice(0,5).map(f => (
              <p key={f.issue_id} className="text-xs text-slate-600">• [{f.issue_id}] {f.short_title}</p>
            ))}
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">⏭ Пропущено ({plan.skipped_findings?.length||0})</p>
            {(plan.skipped_findings||[]).slice(0,5).map(f => (
              <p key={f.issue_id} className="text-xs text-slate-400">• [{f.issue_id}] {f.reason}</p>
            ))}
          </div>
        </div>
      </div>

      {/* Plan items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Изменения по слайдам</p>
          <button onClick={onConfirmAll} className="text-xs text-blue-600 hover:text-blue-800">Выбрать все</button>
        </div>
        {items.map((p) => {
          const isOn = confirmedItems.has(p.plan_item_id);
          const needsReview = p.requires_user_review || p.confidence === "low";
          return (
            <div key={p.plan_item_id} onClick={() => onToggleItem(p.plan_item_id)}
              className={`border rounded-xl p-4 cursor-pointer transition-colors ${isOn ? "border-blue-400 bg-blue-50/40" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${isOn ? "border-blue-600 bg-blue-600" : "border-slate-300"}`}>
                  {isOn && <Icon name="Check" size={12} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-medium text-slate-400">{p.plan_item_id}</span>
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                      {CHANGE_TYPE_LABEL[p.change_type] || p.change_type}
                    </span>
                    <span className="text-xs text-slate-500">Слайд {p.slide_index} · {p.slide_title}</span>
                    {needsReview && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">⚠ Ручная проверка</span>}
                    {p.will_affect_visual && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.visual_action==="keep" ? "text-green-700 bg-green-50" : "text-orange-700 bg-orange-50"}`}>
                        {VISUAL_ACTION_LABEL[p.visual_action] || p.visual_action}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600">{p.problem_summary}</p>
                  {p.proposed_change && (
                    <div className="mt-2 bg-white border border-slate-200 rounded-lg p-2">
                      <p className="text-xs text-slate-500 mb-0.5">Предлагаемое изменение:</p>
                      <p className="text-xs text-slate-800">{p.proposed_change}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action */}
      <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
        <button onClick={onBack} className="border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2.5 rounded-xl text-sm">← Назад</button>
        <button onClick={onCreate} disabled={confirmed === 0}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium">
          <Icon name="Sparkles" size={15} />
          Создать исправленную версию ({confirmed} изм.)
        </button>
      </div>
    </div>
  );
}

// ================================================================ //
//  RevisedView sub-component                                        //
// ================================================================ //

function RevisedView({ result, reaudit, onReaudit, onNewAudit, projectId }: {
  result: RevisionResult;
  reaudit: Record<string, unknown> | null;
  onReaudit: () => void;
  onNewAudit: () => void;
  projectId: number;
}) {
  const meta = result.revision_meta;
  const ra = reaudit as { score_before?: number; score_after?: number; score_delta?: number; issues_before?: number; issues_after?: number } | null;

  return (
    <div className="space-y-6">
      <HelpPanel
        title="Что делать с исправленной версией"
        summary="AI создал новую версию на основе плана правок. Просмотрите что изменилось, запустите повторный аудит — и скачайте итоговый файл."
        steps={[
          { num: 1, title: "Проверьте статистику правок", description: "Сверху — сколько изменений применено, сколько пропущено, сколько замечаний закрыто." },
          { num: 2, title: "Просмотрите текст", description: "Ниже — предпросмотр исправленной версии. Прокрутите и убедитесь что изменения корректны." },
          { num: 3, title: "Проверьте статус визуалов", description: "Если слайд изменился существенно — визуал отмечен «Требует проверки». Замените вручную при необходимости." },
          { num: 4, title: "Запустите повторный аудит", description: "Кнопка «Повторный аудит» прогонит новую версию через те же критерии и покажет score до/после." },
          { num: 5, title: "Откройте задание для экспорта", description: "Кнопка «Открыть задание» ведёт к полной версии результата — там можно скачать PPTX или DOCX." },
        ]}
        sections={[
          {
            title: "Статус визуалов — что означают метки",
            icon: "LayoutTemplate",
            subsections: [
              { title: "✅ Сохранить визуал", content: "Слайд не изменился или изменения не затронули смысл — визуал останется как был при экспорте." },
              { title: "👤 Сохранить (заменён пользователем)", content: "Вы ранее загрузили своё изображение — оно не будет перезаписано автоматически." },
              { title: "👁 Требует проверки", content: "Смысл слайда изменился. Зайдите в задание и при необходимости замените или перегенерируйте визуал." },
              { title: "♻️ Перегенерировать", content: "AI рекомендует обновить схему под новое содержание слайда." },
            ],
          },
          {
            title: "Что такое re-audit и зачем он нужен",
            icon: "BarChart3",
            content: "Повторный аудит прогоняет исправленную версию через те же документы-критерии. Вы видите: compliance score до и после, сколько замечаний закрыто, сколько осталось. Это объективное подтверждение что правки действительно помогли.",
          },
        ]}
        tips={[
          { kind: "tip", text: "После re-audit можно снова запустить план правок — итерировать до нужного уровня соответствия." },
          { kind: "warning", text: "Исходная версия не удаляется — она сохраняется в истории задания. Можно вернуться в любой момент." },
          { kind: "example", text: "Хороший результат: score вырос с 58% до 82%, критичных замечаний стало 0 вместо 3." },
        ]}
      />

      <div className="border border-green-200 bg-green-50 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <Icon name="CheckCircle" size={20} className="text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold">Исправленная версия создана</h2>
            {result.run_id && <p className="text-xs text-slate-500">Run #{result.run_id} · v{result.version}</p>}
          </div>
        </div>

        {meta && (
          <div className="grid sm:grid-cols-3 gap-3 mt-4">
            <div className="bg-white rounded-xl p-3 border border-green-200">
              <p className="text-xl font-bold text-green-700">{meta.applied_plan_item_ids?.length || 0}</p>
              <p className="text-xs text-slate-500">Изменений применено</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-green-200">
              <p className="text-xl font-bold text-slate-500">{meta.skipped_plan_item_ids?.length || 0}</p>
              <p className="text-xs text-slate-500">Пропущено</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-green-200">
              <p className="text-xl font-bold text-blue-700">{meta.applied_finding_ids?.length || 0}</p>
              <p className="text-xs text-slate-500">Findings закрыто</p>
            </div>
          </div>
        )}

        {/* Визуальные изменения */}
        {meta?.visual_changes && meta.visual_changes.length > 0 && (
          <div className="mt-4 border-t border-green-200 pt-4">
            <p className="text-xs font-medium text-slate-700 mb-2">Статус визуалов:</p>
            <div className="space-y-1.5">
              {meta.visual_changes.map((vc, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 ${vc.visual_action === "keep" || vc.visual_action === "preserve_user_override" ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800"}`}>
                  <span>Слайд {vc.slide_index}:</span>
                  <span className="font-medium">{VISUAL_ACTION_LABEL[vc.visual_action] || vc.visual_action}</span>
                  {vc.reason && <span className="text-slate-500">— {vc.reason}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Предпросмотр текста */}
      {result.content && (
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-slate-50 border-b px-4 py-2 flex items-center gap-2">
            <Icon name="FileText" size={14} className="text-slate-500" />
            <span className="text-sm font-medium">Содержимое исправленной версии</span>
          </div>
          <div className="p-4 max-h-64 overflow-y-auto">
            <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans">{result.content.slice(0, 2000)}{result.content.length > 2000 ? "\n..." : ""}</pre>
          </div>
        </div>
      )}

      {/* Re-audit результат */}
      {ra && (
        <div className="border border-blue-200 bg-blue-50/40 rounded-2xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Icon name="BarChart3" size={16} className="text-blue-600" />
            Повторный аудит: было → стало
          </h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-4 border border-blue-200">
              <p className="text-xs text-slate-500 mb-2">Соответствие</p>
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{ra.score_before ?? "—"}%</p>
                  <p className="text-xs text-slate-400">До</p>
                </div>
                <Icon name="ArrowRight" size={16} className="text-slate-400" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{ra.score_after ?? "—"}%</p>
                  <p className="text-xs text-slate-400">После</p>
                </div>
                {ra.score_delta !== null && ra.score_delta !== undefined && (
                  <div className={`ml-2 text-sm font-bold ${Number(ra.score_delta) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {Number(ra.score_delta) >= 0 ? "+" : ""}{ra.score_delta}
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-blue-200">
              <p className="text-xs text-slate-500 mb-2">Замечания</p>
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{ra.issues_before ?? "—"}</p>
                  <p className="text-xs text-slate-400">До</p>
                </div>
                <Icon name="ArrowRight" size={16} className="text-slate-400" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{ra.issues_after ?? "—"}</p>
                  <p className="text-xs text-slate-400">После</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {!reaudit && (
          <button onClick={onReaudit}
            className="flex items-center gap-2 border border-blue-400 text-blue-700 hover:bg-blue-50 px-5 py-2.5 rounded-xl text-sm font-medium">
            <Icon name="RotateCcw" size={15} />
            Повторный аудит (проверить улучшение)
          </button>
        )}
        {result.task_id && (
          <Link to={`/cabinet/project/${projectId}/task/${result.task_id}`}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium">
            <Icon name="ExternalLink" size={15} />
            Открыть задание с результатом
          </Link>
        )}
        <button onClick={onNewAudit}
          className="border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2.5 rounded-xl text-sm">
          ← Новая проверка
        </button>
      </div>
    </div>
  );
}