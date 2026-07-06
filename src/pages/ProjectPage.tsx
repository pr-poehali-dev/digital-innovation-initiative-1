import { useEffect, useState, useRef } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { projectsApi, documentsApi, uploadDocumentChunked, mediaApi, tasksApi, workspaceApi, fileToBase64 } from "@/lib/api";
import SolutionsTab from "@/components/workspace/SolutionsTab";
import ProcessesTab from "@/components/workspace/ProcessesTab";
import PainsTab from "@/components/workspace/PainsTab";
import { analytics } from "@/lib/analytics";
import { passportApi } from "@/lib/passportApi";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import HelpPanel from "@/components/HelpPanel";

interface Document {
  id: number;
  name: string;
  file_type: string;
  file_size: number;
  status: string;
  created_at: string;
  uploaded_by: string;
  category?: string;
  page_count?: number;
  text_length?: number;
  media_type?: string;
}

const CATEGORIES = [
  { value: "lecture", label: "Лекция", icon: "GraduationCap", color: "text-purple-700 bg-purple-50" },
  { value: "notes", label: "Конспект", icon: "Notebook", color: "text-blue-700 bg-blue-50" },
  { value: "article", label: "Статья", icon: "Newspaper", color: "text-green-700 bg-green-50" },
  { value: "handout", label: "Раздатка", icon: "FileText", color: "text-amber-700 bg-amber-50" },
  { value: "standard", label: "Стандарт", icon: "BookMarked", color: "text-red-700 bg-red-50" },
  { value: "reference", label: "Образец", icon: "Copy", color: "text-cyan-700 bg-cyan-50" },
  { value: "other", label: "Другое", icon: "File", color: "text-slate-700 bg-slate-100" },
];

interface Task {
  id: number;
  title: string;
  task_type: string;
  topic?: string;
  status: string;
  created_at: string;
  created_by: string;
  versions: number;
}

interface ActivityItem {
  action: string;
  entity_type: string;
  details?: string;
  created_at: string;
  user_name: string;
}

interface Project {
  id: number;
  title: string;
  description?: string;
  workspace_mode?: string;
  members: { id: number; name: string; email: string; role: string }[];
  activity: ActivityItem[];
  my_role: string;
}

const TASK_TYPE_LABELS: Record<string, string> = {
  answer_question: "Ответить на вопрос",
  analyze: "Анализ материалов",
  structure: "Структура презентации",
  write_text: "Написать текст работы",
  prepare_presentation: "Подготовить презентацию",
  presentation_by_reference: "Презентация по образцу",
  revise: "Доработать результат",
};

const ACTION_LABELS: Record<string, string> = {
  uploaded_document: "загрузил файл",
  created_task: "создал задание",
  generated: "сгенерировал версию",
  created_project: "создал проект",
  invited_member: "пригласил участника",
  updated_project: "обновил проект",
};

// Правила Stage 6/7: пустым считаем null / '' / строку из пробелов после trim().
// Вынесено на уровень модуля, чтобы одна и та же логика использовалась и в счётчиках
// управленческого обзора, и в preset-фильтрах списков — числа всегда совпадают.
const isEmptyField = (v?: string | null) => !v || !v.trim();
const PRE_LAUNCH_STATUSES = ["preparation", "approval", "in_plan"];

type OverviewPreset = "stalled" | "launch_ready" | "without_initiative";
const PRESET_LABELS: Record<OverviewPreset, string> = {
  stalled: "Зависшие инициативы",
  launch_ready: "Готовы к запуску",
  without_initiative: "Гипотезы без инициатив",
};

type TabKey = "overview" | "copilot" | "hypotheses" | "artifacts" | "tasks" | "docs" | "team" | "process" | "pains" | "benchmarks" | "ai" | "initiatives" | "solutions";
const VALID_TABS: TabKey[] = ["overview", "copilot", "hypotheses", "artifacts", "tasks", "docs", "team", "process", "pains", "benchmarks", "ai", "initiatives", "solutions"];
const VALID_PRESETS: OverviewPreset[] = ["stalled", "launch_ready", "without_initiative"];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const urlPreset = searchParams.get("preset");

  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTabState] = useState<TabKey>(
    (urlTab && (VALID_TABS as string[]).includes(urlTab) ? urlTab : "overview") as TabKey
  );
  const [preset, setPresetState] = useState<OverviewPreset | null>(
    urlPreset && (VALID_PRESETS as string[]).includes(urlPreset) ? (urlPreset as OverviewPreset) : null
  );

  // Preset применяется только вместе со сменой вкладки (Stage 7).
  // Обычный переход по вкладкам без preset — сбрасывает активный фильтр.
  const setTab = (next: TabKey, nextPreset: OverviewPreset | null = null) => {
    setTabState(next);
    setPresetState(nextPreset);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    if (nextPreset) params.set("preset", nextPreset); else params.delete("preset");
    setSearchParams(params, { replace: false });
  };

  const clearPreset = () => {
    setPresetState(null);
    const params = new URLSearchParams(searchParams);
    params.delete("preset");
    setSearchParams(params, { replace: false });
  };

  // Workspace state
  type Hypothesis = { id: number; title: string; statement: string; assumptions: string; success_criteria: string; status: string; conclusion: string; priority: string; created_at: string; updated_at: string; process_id: number | null; process_title?: string | null; pain_point_id: number | null; pain_point_description?: string | null; solution_id: number | null; solution_title?: string | null };
  type Artifact = { id: number; title: string; artifact_type: string; summary: string; mode: string; created_at: string; content?: string };
  type WsContext = { goals_text: string; constraints_text: string; key_facts_text: string; stakeholders_text: string; updated_at?: string } | null;

  // Transformation Workbench types
  type ProcessStep = { id: number; step_order: number; title: string; role_name: string; description: string; system_name: string; is_manual: boolean; pain_point: string; control_point: string; automation_potential: string; ai_potential: string; duration_minutes: number | null };
  type LinkedPain = { id: number; description: string; impact_level: string; frequency: string };
  type Process = { id: number; title: string; description: string; owner_name: string; department: string; maturity_level: string; digital_maturity: string; ai_potential: string; step_count: number; steps: ProcessStep[]; linked_pains?: LinkedPain[] };
  type PainPoint = { id: number; pain_type: string; description: string; impact_level: string; frequency: string; root_cause: string; linked_process_id: number | null; linked_process_title?: string | null; linked_process_department?: string | null; linked_solution_id: number | null; linked_solution_title?: string | null; linked_solution_type?: string | null };
  type Benchmark = { id: number; title: string; source_name: string; source_url: string; industry: string; organization_name: string; benchmark_type: string; summary: string; observed_effect: string; applicability: string; confidence_level: string; notes: string; relevance_note: string };
  type AiOpportunity = { id: number; title: string; current_manual_operation: string; data_type: string; proposed_solution_type: string; use_case_type: string; expected_effect: string; risks: string; security_notes: string; human_in_loop: boolean; recommendation: string };
  type Initiative = { id: number; title: string; description: string; owner_name: string; priority: string; impact_score: number; effort_score: number; status: string; next_step: string; hypothesis_id: number | null; hypothesis_title?: string | null; pain_point_id: number | null; pain_point_description?: string | null; process_id: number | null; process_title?: string | null; solution_id: number | null; solution_title?: string | null };
  type Solution = { id: number; title: string; solution_type: string; covers_text: string; status: string; limitations: string; alternatives: string; notes: string; created_at: string; updated_at: string; linked_pains?: LinkedPain[] };

  // Transformation Workbench state
  const [processes, setProcesses] = useState<Process[]>([]);
  const [processesLoading, setProcessesLoading] = useState(true);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [painPointsLoading, setPainPointsLoading] = useState(true);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [aiOpportunities, setAiOpportunities] = useState<AiOpportunity[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [solutionsLoading, setSolutionsLoading] = useState(true);
  // Benchmark form
  const [showBenchmarkForm, setShowBenchmarkForm] = useState(false);
  const [benchmarkDraft, setBenchmarkDraft] = useState({ title: "", source_name: "", source_url: "", industry: "", summary: "", observed_effect: "", applicability: "", notes: "" });
  // AI opportunity form
  const [showAiForm, setShowAiForm] = useState(false);
  const [aiDraft, setAiDraft] = useState({ title: "", current_manual_operation: "", data_type: "mixed", proposed_solution_type: "none", expected_effect: "", risks: "", human_in_loop: true, recommendation: "assess" });
  const [aiAssessText, setAiAssessText] = useState("");
  const [aiAssessLoading, setAiAssessLoading] = useState(false);
  const [aiAssessResult, setAiAssessResult] = useState<Record<string, unknown> | null>(null);
  // Initiative form
  const [showInitiativeForm, setShowInitiativeForm] = useState(false);
  const [initiativeDraft, setInitiativeDraft] = useState<{ title: string; description: string; owner_name: string; priority: string; impact_score: number; effort_score: number; status: string; next_step: string; hypothesis_id: number | null; pain_point_id: number | null; process_id: number | null; solution_id: number | null }>({ title: "", description: "", owner_name: "", priority: "medium", impact_score: 3, effort_score: 3, status: "idea", next_step: "", hypothesis_id: null, pain_point_id: null, process_id: null, solution_id: null });
  const [initiativeSourceHyp, setInitiativeSourceHyp] = useState<{ title: string } | null>(null);
  const [wbLoading, setWbLoading] = useState(false);
  // Stage 9: контекстное дозаполнение инициативы (владелец / следующий шаг) из preset=stalled.
  // Переиспользует существующий workspaceApi.updateInitiative — без inline-редактирования карточки.
  const [fixInitiativeId, setFixInitiativeId] = useState<number | null>(null);
  const [fixInitiativeDraft, setFixInitiativeDraft] = useState({ owner_name: "", next_step: "" });
  const [fixInitiativeLoading, setFixInitiativeLoading] = useState(false);

  const loadProcesses = () => {
    setProcessesLoading(true);
    workspaceApi.getProcesses(projectId)
      .then((d: { processes: Process[] }) => setProcesses(d.processes || []))
      .catch(() => {})
      .finally(() => setProcessesLoading(false));
  };

  const loadPainPoints = () => {
    setPainPointsLoading(true);
    workspaceApi.getPainPoints(projectId)
      .then((d: { pain_points: PainPoint[] }) => setPainPoints(d.pain_points || []))
      .catch(() => {})
      .finally(() => setPainPointsLoading(false));
  };

  const loadWorkbench = () => {
    loadProcesses();
    loadPainPoints();
    workspaceApi.getBenchmarks(projectId).then((d: { benchmarks: Benchmark[] }) => setBenchmarks(d.benchmarks || [])).catch(() => {});
    workspaceApi.getAiOpportunities(projectId).then((d: { opportunities: AiOpportunity[] }) => setAiOpportunities(d.opportunities || [])).catch(() => {});
    workspaceApi.getInitiatives(projectId).then((d: { initiatives: Initiative[] }) => setInitiatives(d.initiatives || [])).catch(() => {});
  };



  // ── AI Operator ───────────────────────────────────────────────
  type AiAnalysis = {
    summary: string; readiness_score: number; key_insight: string;
    top_pains: string[]; ai_verdict: string; ai_verdict_reason: string;
    quick_wins: string[]; gaps: string[]; next_action: string; risks: string[];
  };
  type AiStatusRaw = {
    ok: boolean; ai_status: string; ai_stage: string | null;
    content_version: number; ai_analyzed_version: number; ai_is_stale: boolean;
    ai_last_result_json: AiAnalysis | null; ai_last_error: string | null;
    has_pending_files?: boolean; pending_files_count?: number;
    empty?: boolean;
  };
  const AI_STAGE_LABELS: Record<string, string> = {
    queued:              "Ставлю анализ в очередь...",
    collecting_context:  "Читаю процессы и контекст кейса...",
    analyzing_processes: "Сопоставляю боли, гипотезы и артефакты...",
    building_summary:    "Формирую выводы и рекомендации...",
    finalizing:          "Собираю итоговый результат...",
  };
  const POLL_ACTIVE_MS  = 5000;
  const POLL_HIDDEN_MS  = 15000;
  const POLL_MAX_MS     = 3 * 60 * 1000;

  const [aiData,     setAiData]     = useState<AiStatusRaw | null>(null);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [pollTimeout, setPollTimeout] = useState(false);

  const timerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartedAt    = useRef<number | null>(null);
  const inFlight         = useRef(false);
  const staleRestarted   = useRef(false);

  const isActive = (s?: string | null) => s === "queued" || s === "running";

  const stopPolling = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    pollStartedAt.current = null;
  };

  const scheduleNext = (tick: () => void) => {
    const delay = document.hidden ? POLL_HIDDEN_MS : POLL_ACTIVE_MS;
    timerRef.current = setTimeout(tick, delay);
  };

  const [wsContext, setWsContext] = useState<WsContext>(null);
  const [wsContextEdit, setWsContextEdit] = useState(false);
  const [wsContextDraft, setWsContextDraft] = useState({ goals_text: "", constraints_text: "", key_facts_text: "", stakeholders_text: "" });
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);
  const [copilotMsg, setCopilotMsg] = useState("");
  const [copilotMode, setCopilotMode] = useState("analyst");
  const [copilotSave, setCopilotSave] = useState(false);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotHistory, setCopilotHistory] = useState<{ q: string; a: string; artifact_id?: number }[]>([]);
  const [hypForm, setHypForm] = useState(false);
  const [hypDraft, setHypDraft] = useState<{ title: string; statement: string; assumptions: string; success_criteria: string; priority: string; process_id: number | null; pain_point_id: number | null; solution_id: number | null }>({ title: "", statement: "", assumptions: "", success_criteria: "", priority: "medium", process_id: null, pain_point_id: null, solution_id: null });
  const [hypSourcePain, setHypSourcePain] = useState<{ description: string } | null>(null);
  const [openHyp, setOpenHyp] = useState<Hypothesis | null>(null);
  const copilotEndRef = useRef<HTMLDivElement>(null);
  const [evidenceSending, setEvidenceSending] = useState<number | null>(null);
  const [evidenceSent, setEvidenceSent] = useState<Set<number>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [uploadCategory, setUploadCategory] = useState("notes");
  const [menuDocId, setMenuDocId] = useState<number | null>(null);
  const [renamingDoc, setRenamingDoc] = useState<{ id: number; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);


  // ── Post-action hints ──────────────────────────────────────────────────────
  type PostActionKind =
    | "document_created" | "process_created" | "process_step_created"
    | "pain_created" | "hypothesis_created" | "initiative_created"
    | "benchmark_created" | "assessment_saved";

  const POST_ACTION_CONFIG: Record<PostActionKind, { icon: string; title: string; desc: string; ctaLabel: string; ctaTab: string }> = {
    document_created:     { icon: "CheckCircle", title: "Документ загружен",    desc: "Извлеките процессы или задайте вопрос AI.",          ctaLabel: "Открыть AI Copilot",   ctaTab: "copilot" },
    process_created:      { icon: "CheckCircle", title: "Процесс создан",       desc: "Добавьте шаги, чтобы увидеть узкие места.",         ctaLabel: "Добавить шаг",         ctaTab: "process" },
    process_step_created: { icon: "CheckCircle", title: "Шаг добавлен",         desc: "Можно добавить ещё шаг или перейти к болям.",       ctaLabel: "Зафиксировать боли",   ctaTab: "pains" },
    pain_created:         { icon: "CheckCircle", title: "Боль зафиксирована",   desc: "Сформулируйте гипотезу улучшения.",                  ctaLabel: "Создать гипотезу",     ctaTab: "hypotheses" },
    hypothesis_created:   { icon: "CheckCircle", title: "Гипотеза создана",     desc: "Следующий шаг — превратить её в инициативу.",        ctaLabel: "Создать инициативу",   ctaTab: "initiatives" },
    initiative_created:   { icon: "CheckCircle", title: "Инициатива создана",   desc: "Назначьте владельца или запустите AI-оценку.",       ctaLabel: "Открыть AI-оценку",    ctaTab: "ai" },
    benchmark_created:    { icon: "CheckCircle", title: "Бенчмарк добавлен",    desc: "Сопоставьте его с гипотезой или зафиксируйте вывод.",ctaLabel: "Перейти к гипотезам",  ctaTab: "hypotheses" },
    assessment_saved:     { icon: "CheckCircle", title: "Оценка сохранена",     desc: "Выберите инициативу для реализации quick win.",      ctaLabel: "Перейти к инициативам",ctaTab: "initiatives" },
  };

  const [postActionHint, setPostActionHint] = useState<PostActionKind | null>(null);

  const load = () => {
    projectsApi.get(projectId).then((d) => setProject(d)).catch(() => {});
    documentsApi.list(projectId).then((d) => setDocs(d.documents || [])).catch(() => {});
    tasksApi.list(projectId).then((d) => setTasks(d.tasks || [])).catch(() => {});
    workspaceApi.getContext(projectId).then((d: { context: WsContext }) => {
      setWsContext(d.context);
      if (d.context) setWsContextDraft({ goals_text: d.context.goals_text, constraints_text: d.context.constraints_text, key_facts_text: d.context.key_facts_text, stakeholders_text: d.context.stakeholders_text });
    }).catch(() => {});
    workspaceApi.getHypotheses(projectId).then((d: { hypotheses: Hypothesis[] }) => setHypotheses(d.hypotheses || [])).catch(() => {});
    workspaceApi.getArtifacts(projectId).then((d: { artifacts: Artifact[] }) => setArtifacts(d.artifacts || [])).catch(() => {});
    setSolutionsLoading(true);
    workspaceApi.getSolutions(projectId)
      .then((d: { solutions: Solution[] }) => setSolutions(d.solutions || []))
      .catch(() => {})
      .finally(() => setSolutionsLoading(false));
  };

  const loadSolutions = () => {
    setSolutionsLoading(true);
    workspaceApi.getSolutions(projectId)
      .then((d: { solutions: Solution[] }) => setSolutions(d.solutions || []))
      .catch(() => {})
      .finally(() => setSolutionsLoading(false));
  };

  const pollOnce = async () => {
    if (inFlight.current) return;
    if (pollStartedAt.current && Date.now() - pollStartedAt.current > POLL_MAX_MS) {
      setPollTimeout(true); stopPolling(); return;
    }
    inFlight.current = true;
    try {
      const next = await workspaceApi.aiStatus(projectId) as AiStatusRaw;
      setAiData(next); setPollTimeout(false);
      const terminal = next.ai_status === "ready" || next.ai_status === "failed";
      if (terminal) {
        if (next.has_pending_files) {
          // Файлы ещё обрабатываются — продолжаем поллить, AI не запускаем
          scheduleNext(pollOnce);
        } else {
          stopPolling();
          if (next.ai_status === "ready" && next.ai_is_stale && !staleRestarted.current) {
            staleRestarted.current = true;
            const queued = await workspaceApi.aiAnalyze(projectId) as AiStatusRaw;
            setAiData(queued);
            if (isActive(queued.ai_status)) { pollStartedAt.current = Date.now(); scheduleNext(pollOnce); }
          }
        }
      } else if (isActive(next.ai_status)) {
        scheduleNext(pollOnce);
      } else if (next.has_pending_files) {
        // idle но файлы ещё в обработке — поллим
        scheduleNext(pollOnce);
      } else {
        stopPolling();
      }
    } catch { stopPolling(); }
    finally { inFlight.current = false; }
  };

  const startPolling = () => {
    if (timerRef.current) return;
    pollStartedAt.current = Date.now();
    scheduleNext(pollOnce);
  };

  const runAiAnalysis = async () => {
    setAiLoading(true);
    staleRestarted.current = false;
    try {
      const queued = await workspaceApi.aiAnalyze(projectId) as AiStatusRaw;
      setAiData(queued);
      if (isActive(queued.ai_status)) startPolling();
    } catch { /* silent */ }
    finally { setAiLoading(false); }
  };

  useEffect(() => {
    load(); loadWorkbench(); analytics.workspaceOpened(projectId, "overview");
    // Получаем статус при открытии
    setAiLoading(true);
    workspaceApi.aiStatus(projectId)
      .then((s: AiStatusRaw) => {
        setAiData(s);
        const hasPending = s.has_pending_files;
        if (isActive(s.ai_status)) {
          // Уже запущен — просто поллим
          startPolling();
        } else if (hasPending) {
          // Файлы ещё обрабатываются — не запускаем AI, поллим статус файлов
          startPolling();
        } else if (s.ai_is_stale && s.ai_status !== "failed") {
          // Устарел — автозапуск
          runAiAnalysis();
        } else if (!s.ai_last_result_json && s.content_version > 0) {
          // Нет результата и кейс не пустой — автозапуск
          runAiAnalysis();
        }
      })
      .catch(() => { /* тихий фейл */ })
      .finally(() => setAiLoading(false));

    const onVisibility = () => { if (aiData && isActive(aiData.ai_status)) { stopPolling(); startPolling(); } };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stopPolling(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [projectId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "docx", "pptx"].includes(ext)) {
      setUploadError("Поддерживаются только PDF, DOCX, PPTX");
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setUploadError("");
    try {
      await uploadDocumentChunked(projectId, file, uploadCategory, setUploadProgress);
      setPostActionHint("document_created");
      load();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: "image" | "audio") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const imageExts = ["jpg", "jpeg", "png", "webp", "heic"];
    const audioExts = ["ogg", "oga", "opus", "mp3", "wav", "m4a"];
    if (mediaType === "image" && !imageExts.includes(ext)) {
      setUploadError("Поддерживаются: JPG, PNG, WEBP, HEIC");
      return;
    }
    if (mediaType === "audio" && !audioExts.includes(ext)) {
      setUploadError("Поддерживаются: OGG, OPUS, MP3, WAV, M4A (для лучшего качества — OGG, до 1 МБ)");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const b64 = await fileToBase64(file);
      await mediaApi.upload(projectId, file.name, b64, mediaType, uploadCategory);
      load();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Ошибка загрузки медиа");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleOpenDoc = async (docId: number) => {
    setMenuDocId(null);
    try {
      const d = await documentsApi.getUrl(docId);
      // Декодируем base64 → blob (защищённое скачивание через бэкенд)
      const byteChars = atob(d.file_data);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: d.mime || "application/octet-stream" });
      const blobUrl = URL.createObjectURL(blob);

      const ft = (d.file_type || "").toLowerCase();
      const inlineTypes = ["pdf", "jpg", "jpeg", "png", "webp"];
      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
      const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

      // iOS Safari блокирует window.open(blob:) — на iOS всегда скачиваем
      // На десктопе и Android — открываем PDF/картинки во вкладке
      if (inlineTypes.includes(ft) && !isIOS && !isSafari) {
        const w = window.open(blobUrl, "_blank");
        if (!w) {
          // Попап заблокирован — fallback в скачивание
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = d.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } else {
        // Скачиваем как файл (iOS/Safari/Office)
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = d.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Не удалось открыть");
    }
  };

  const handleRename = async () => {
    if (!renamingDoc || !renameValue.trim()) return;
    try {
      await documentsApi.rename(renamingDoc.id, renameValue.trim());
      setRenamingDoc(null);
      setRenameValue("");
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await documentsApi.delete(confirmDelete.id);
      setConfirmDelete(null);
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const handleCopilot = async () => {
    if (!copilotMsg.trim() || copilotLoading) return;
    const q = copilotMsg;
    setCopilotMsg("");
    setCopilotLoading(true);
    try {
      const res = await workspaceApi.copilot({ project_id: projectId, message: q, mode: copilotMode, save_as_artifact: copilotSave, artifact_type: "analysis" }) as { answer: string; artifact_id?: number };
      setCopilotHistory(prev => [...prev, { q, a: res.answer, artifact_id: res.artifact_id }]);
      analytics.workspaceCopilotUsed(projectId, copilotMode, copilotSave);
      if (res.artifact_id) {
        analytics.workspaceArtifactCreated(projectId, "analysis", copilotMode);
        workspaceApi.getArtifacts(projectId).then((d: { artifacts: Artifact[] }) => setArtifacts(d.artifacts || [])).catch(() => {});
      }
      setTimeout(() => copilotEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "";
      const isNoFunds = msg.includes("средств") || msg.includes("402");
      setCopilotHistory(prev => [...prev, {
        q,
        a: isNoFunds
          ? "❌ Недостаточно средств на кошельке. Пополни баланс в разделе «Кошелёк» и попробуй снова."
          : "Не удалось получить ответ. Попробуй ещё раз.",
      }]);
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleSaveContext = async () => {
    await workspaceApi.updateContext(projectId, wsContextDraft);
    analytics.workspaceContextUpdated(projectId, wsContextDraft);
    setWsContextEdit(false);
    workspaceApi.getContext(projectId).then((d: { context: WsContext }) => setWsContext(d.context)).catch(() => {});
  };

  const handleCreateHypothesis = async () => {
    if (!hypDraft.title.trim()) return;
    await workspaceApi.createHypothesis({ project_id: projectId, ...hypDraft });
    analytics.workspaceHypothesisCreated(projectId, hypDraft.priority);
    setHypForm(false);
    setHypDraft({ title: "", statement: "", assumptions: "", success_criteria: "", priority: "medium", process_id: null, pain_point_id: null, solution_id: null });
    setHypSourcePain(null);
    setPostActionHint("hypothesis_created");
    workspaceApi.getHypotheses(projectId).then((d: { hypotheses: Hypothesis[] }) => setHypotheses(d.hypotheses || [])).catch(() => {});
  };

  const handleCreateHypothesisFromPain = (pain: PainPoint) => {
    setHypDraft({
      title: pain.description.slice(0, 120),
      statement: pain.root_cause ? `Причина: ${pain.root_cause}` : "",
      assumptions: "",
      success_criteria: "",
      priority: pain.impact_level === "critical" || pain.impact_level === "high" ? "high" : "medium",
      process_id: pain.linked_process_id,
      pain_point_id: pain.id,
      solution_id: pain.linked_solution_id,
    });
    setHypSourcePain({ description: pain.description });
    setHypForm(true);
    setTab("hypotheses");
  };

  const handleCreateInitiativeFromHypothesis = (hyp: Hypothesis) => {
    setInitiativeDraft({
      title: hyp.title,
      description: hyp.statement || "",
      owner_name: "",
      priority: hyp.priority === "high" ? "high" : hyp.priority === "low" ? "low" : "medium",
      impact_score: 3,
      effort_score: 3,
      status: "idea",
      next_step: hyp.success_criteria || "",
      hypothesis_id: hyp.id,
      pain_point_id: hyp.pain_point_id,
      process_id: hyp.process_id,
      solution_id: hyp.solution_id,
    });
    setInitiativeSourceHyp({ title: hyp.title });
    setShowInitiativeForm(true);
    setTab("initiatives");
  };

  const handleHypStatus = async (id: number, status: string) => {
    await workspaceApi.updateHypothesis({ id, status });
    analytics.workspaceHypothesisUpdated(projectId, id, status);
    workspaceApi.getHypotheses(projectId).then((d: { hypotheses: Hypothesis[] }) => setHypotheses(d.hypotheses || [])).catch(() => {});
  };

  // Stage 9: открыть мини-форму дозаполнения инициативы из preset=stalled.
  const openFixInitiative = (init: Initiative) => {
    setFixInitiativeId(init.id);
    setFixInitiativeDraft({ owner_name: init.owner_name || "", next_step: init.next_step || "" });
  };

  const handleFixInitiativeSave = async () => {
    if (!fixInitiativeId) return;
    setFixInitiativeLoading(true);
    await workspaceApi.updateInitiative({ id: fixInitiativeId, owner_name: fixInitiativeDraft.owner_name, next_step: fixInitiativeDraft.next_step });
    setFixInitiativeId(null);
    workspaceApi.getInitiatives(projectId).then((d: { initiatives: Initiative[] }) => setInitiatives(d.initiatives || [])).catch(() => {});
    setFixInitiativeLoading(false);
  };

  const handleOpenArtifact = async (id: number) => {
    const res = await workspaceApi.getArtifact(id) as { artifact: Artifact };
    setOpenArtifact(res.artifact);
    analytics.workspaceArtifactOpened(projectId, id);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const d = await projectsApi.invite(projectId, inviteEmail) as { name?: string; pending?: boolean; message?: string };
      if (d.pending) {
        setInviteMsg(`⏳ ${d.message || "Приглашение отправлено — участник получит доступ после регистрации"}`);
      } else {
        setInviteMsg(`✓ ${d.name} добавлен в проект`);
        load();
      }
      setInviteEmail("");
    } catch (err: unknown) {
      setInviteMsg(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  };

  if (!project) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-64" />
            <div className="h-4 bg-muted rounded w-96" />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Link to="/cabinet/projects" className="flex items-center gap-1 hover:text-foreground transition-colors">
            <Icon name="Briefcase" size={13} />
            <span className="hidden sm:inline">Рабочий кабинет</span>
          </Link>
          <Icon name="ChevronRight" size={13} />
          <span className="text-foreground font-medium truncate max-w-[200px] sm:max-w-none">{project.title}</span>
        </div>

        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Кейс трансформации</p>
            <h1 className="text-lg sm:text-2xl font-bold leading-tight truncate">{project.title}</h1>
            {project.description && (
              <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 sm:mt-1 line-clamp-2 sm:max-w-2xl">{project.description}</p>
            )}
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <Link
              to={`/cabinet/project/${projectId}/audit`}
              className="flex items-center justify-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 p-2 sm:px-4 sm:py-2 rounded-lg text-sm font-medium transition-colors"
              title="Аудит"
            >
              <Icon name="ShieldCheck" size={16} />
              <span className="hidden sm:inline">Аудит</span>
            </Link>
            <Link
              to={`/cabinet/project/${projectId}/search`}
              className="flex items-center justify-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 p-2 sm:px-4 sm:py-2 rounded-lg text-sm font-medium transition-colors"
              title="Поиск"
            >
              <Icon name="Search" size={16} />
              <span className="hidden sm:inline">Поиск</span>
            </Link>
            <Link
              to={`/cabinet/project/${projectId}/new-task`}
              className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white p-2 sm:px-4 sm:py-2 rounded-lg text-sm font-medium transition-colors"
              title="Новое задание"
            >
              <Icon name="Plus" size={16} />
              <span className="hidden sm:inline">Новое задание</span>
            </Link>
          </div>
        </div>

        <HelpPanel
          title="Как работать с кабинетом"
          summary="Рабочий кабинет кейса трансформации. Загрузите документы, опишите процессы, зафиксируйте боли — AI Оператор сам прочитает всё и выдаст структурированный анализ с инициативами."
          steps={[
            { num: 1, title: "Загрузите материалы", description: "Вкладка «Файлы» — PDF, DOCX, фото с доски или аудио. AI извлечёт текст и будет использовать его в анализе." },
            { num: 2, title: "Опишите процессы и боли", description: "Вкладки «Процессы» и «Боли» — добавьте as-is шаги, роли, системы и узкие места. Можно через AI-экстракцию из текста." },
            { num: 3, title: "Сформулируйте гипотезы", description: "Вкладка «Гипотезы» — предположения об улучшениях. Оцените приоритет и статус проверки." },
            { num: 4, title: "Запустите AI Оператора", description: "Вкладка «Обзор» — AI прочитает весь кейс и выдаст: суть, инсайт, вердикт, quick wins, пробелы и следующее действие." },
            { num: 5, title: "Создайте инициативы", description: "Вкладка «Инициативы» — оформите решения с эффектом, усилием, владельцем и статусом. Система сама подскажет следующий шаг." },
          ]}
          sections={[
            {
              title: "Основные вкладки",
              icon: "Layers",
              subsections: [
                { title: "🏠 Обзор", content: "AI Оператор, счётчики кейса, активные гипотезы. Главная точка входа." },
                { title: "📄 Файлы", content: "Загрузите PDF, DOCX, фото (OCR) или аудио. AI читает извлечённый текст при анализе." },
                { title: "⚙️ Процессы", content: "Карта процессов as-is: шаги, роли, системы, ручной труд, AI-потенциал." },
                { title: "🔥 Боли", content: "Узкие места: дублирование, задержки, разрывы. Есть AI-экстракция из текста." },
                { title: "💡 Гипотезы", content: "Идеи улучшений со статусом: открыта → проверяется → подтверждена." },
                { title: "🚀 Инициативы", content: "Решения с эффектом, усилием, владельцем и статусом (идея → пилот → реализация)." },
                { title: "🤖 AI Copilot", content: "Чат с AI, знающим контекст кейса. Ответы можно сохранять как артефакты." },
              ],
            },
            {
              title: "Дополнительные вкладки",
              icon: "MoreHorizontal",
              subsections: [
                { title: "🧠 AI-оценка", content: "Нужен ли AI для операции и какой тип: GenAI / ML / RPA / BI / Rule engine." },
                { title: "📌 Бенчмарки", content: "Внешние практики с оценкой применимости к вашему кейсу." },
                { title: "📦 Артефакты", content: "Сохранённые ответы Copilot. Включите «Сохранять как артефакт» в чате." },
                { title: "📋 Задания", content: "AI-задания: доклад, презентация, аудит PPTX, поиск по документам." },
                { title: "👥 Команда", content: "Участники кейса. Пригласите коллег по email для совместной работы." },
              ],
            },
          ]}
          tips={[
            { kind: "tip", text: "Чем больше данных в кейсе — тем точнее анализ AI Оператора. Начните с документов или описания процессов." },
            { kind: "tip", text: "AI Copilot знает весь контекст кейса — файлы, гипотезы, процессы. Спрашивайте прямо, без копирования текстов." },
            { kind: "warning", text: "AI Оператор запускается автоматически при добавлении данных. После изменений кейс помечается устаревшим и анализ обновляется." },
            { kind: "example", text: "Хороший кейс: 1–2 документа + процесс (5+ шагов) + 3–5 болей + 2 гипотезы + 1 бенчмарк = точный AI-анализ." },
          ]}
        />

        {/* Вкладки — flex-wrap, без скролла */}
        <div className="mb-4 sm:mb-6 border-b border-slate-200">
          <div className="flex flex-wrap gap-x-0 gap-y-0">
            {((() => {
              const isPolygon = project?.workspace_mode === "polygon";
              return isPolygon ? [
                { key: "overview",    label: "🏠 Обзор полигона" },
                { key: "process",     label: `⚙️ Функции и процессы${processes.length ? ` (${processes.length})` : ""}` },
                { key: "solutions",   label: `🗃️ Решения и системы${solutions.length ? ` (${solutions.length})` : ""}` },
                { key: "pains",       label: `🔧 Проблемы${painPoints.length ? ` (${painPoints.length})` : ""}` },
                { key: "ai",          label: `💡 Автоматизация и ИИ${aiOpportunities.length ? ` (${aiOpportunities.length})` : ""}` },
                { key: "hypotheses",  label: `🔬 Гипотезы и идеи${hypotheses.length ? ` (${hypotheses.length})` : ""}` },
                { key: "benchmarks",  label: `📌 Альтернативы${benchmarks.length ? ` (${benchmarks.length})` : ""}` },
                { key: "initiatives", label: `🚀 Инициативы${initiatives.length ? ` (${initiatives.length})` : ""}` },
                { key: "copilot",     label: "🤖 AI Copilot" },
                { key: "artifacts",   label: `📦 Артефакты${artifacts.length ? ` (${artifacts.length})` : ""}` },
                { key: "docs",        label: `📄 Файлы (${docs.length})` },
              ] : [
                { key: "overview",    label: "🏠 Обзор" },
                { key: "copilot",     label: "🤖 AI Copilot" },
                { key: "process",     label: `⚙️ Процессы${processes.length ? ` (${processes.length})` : ""}` },
                { key: "pains",       label: `🔥 Боли${painPoints.length ? ` (${painPoints.length})` : ""}` },
                { key: "hypotheses",  label: `💡 Гипотезы${hypotheses.length ? ` (${hypotheses.length})` : ""}` },
                { key: "benchmarks",  label: `📌 Бенчмарки${benchmarks.length ? ` (${benchmarks.length})` : ""}` },
                { key: "ai",          label: `🧠 AI-оценка${aiOpportunities.length ? ` (${aiOpportunities.length})` : ""}` },
                { key: "initiatives", label: `🚀 Инициативы${initiatives.length ? ` (${initiatives.length})` : ""}` },
                { key: "artifacts",   label: `📦 Артефакты${artifacts.length ? ` (${artifacts.length})` : ""}` },
                { key: "tasks",       label: `📋 Задания (${tasks.length})` },
                { key: "docs",        label: `📄 Файлы (${docs.length})` },
                { key: "team",        label: "👥 Команда" },
              ];
            })()).map((t) => (
              <button
                key={t.key}
                data-tab={t.key}
                onClick={() => setTab(t.key as TabKey)}
                className={`whitespace-nowrap px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-px ${
                  tab === t.key
                    ? "text-slate-900 border-slate-800"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Post-action banner — показывается поверх любой вкладки ── */}
        {postActionHint && (() => {
          const h = POST_ACTION_CONFIG[postActionHint];
          // Для «Гипотеза создана» — CTA сразу открывает создание инициативы
          // из самой новой гипотезы без инициативы (детерминированное правило).
          const handleCta = () => {
            if (postActionHint === "hypothesis_created") {
              const target = [...hypotheses]
                .filter(hh => !initiatives.some(i => i.hypothesis_id === hh.id))
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
              if (target) {
                handleCreateInitiativeFromHypothesis(target);
                setPostActionHint(null);
                return;
              }
            }
            setTab(h.ctaTab as Parameters<typeof setTab>[0]);
            setPostActionHint(null);
          };
          return (
            <div className="mb-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 flex items-start gap-2.5">
              <Icon name="CheckCircle" size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-900 leading-snug">{h.title}</p>
                <p className="text-xs text-emerald-700 mt-0.5 leading-snug">{h.desc}</p>
                <button
                  onClick={handleCta}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {h.ctaLabel} →
                </button>
              </div>
              <button
                onClick={() => setPostActionHint(null)}
                className="flex-shrink-0 text-emerald-500 hover:text-emerald-700 p-1 rounded-lg hover:bg-emerald-100 transition-colors -mt-0.5"
                aria-label="Скрыть"
              >
                <Icon name="X" size={14} />
              </button>
            </div>
          );
        })()}

        {/* ── Обзор ── */}
        {tab === "overview" && (
          <div className="space-y-5">
            {/* Карточки-счётчики */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {(project?.workspace_mode === "polygon" ? [
                { label: "Функций/процессов", count: processes.length, icon: "Workflow", color: "text-blue-600 bg-blue-50" },
                { label: "Решений/систем", count: solutions.length, icon: "Server", color: "text-slate-600 bg-slate-100" },
                { label: "Гипотез и идей", count: hypotheses.length, icon: "Lightbulb", color: "text-amber-600 bg-amber-50" },
                { label: "Инициатив", count: initiatives.length, icon: "Rocket", color: "text-violet-600 bg-violet-50" },
              ] : [
                { label: "Гипотез", count: hypotheses.length, icon: "Lightbulb", color: "text-amber-600 bg-amber-50" },
                { label: "Болей", count: painPoints.length, icon: "Flame", color: "text-red-600 bg-red-50" },
                { label: "Инициатив", count: initiatives.length, icon: "Rocket", color: "text-violet-600 bg-violet-50" },
                { label: "Файлов", count: docs.length, icon: "FileText", color: "text-blue-600 bg-blue-50" },
              ]).map(c => (
                <div key={c.label} className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${c.color}`}>
                    <Icon name={c.icon} size={16} />
                  </div>
                  <div>
                    <p className="text-lg sm:text-xl font-bold text-slate-900">{c.count}</p>
                    <p className="text-[10px] sm:text-xs text-slate-500">{c.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Управленческий обзор (только для полигона) ── */}
            {project?.workspace_mode === "polygon" && (() => {
              const overviewLoading = processesLoading || painPointsLoading || solutionsLoading;
              const painsWithoutSolution = painPoints.filter(p => !p.linked_solution_id);
              const painsWithoutHypothesis = painPoints.filter(p => !hypotheses.some(h => h.pain_point_id === p.id));
              const candidates = painPoints.filter(p => (p.linked_process_id || p.linked_solution_id) && !hypotheses.some(h => h.pain_point_id === p.id));
              const hypothesesWithoutInitiative = hypotheses.filter(h => !initiatives.some(i => i.hypothesis_id === h.id));
              const topProcesses = [...processes]
                .map(pr => ({ ...pr, painCount: pr.linked_pains?.length || 0 }))
                .filter(pr => pr.painCount > 0)
                .sort((a, b) => b.painCount - a.painCount)
                .slice(0, 5);

              // Топ-проблемы, дошедшие до инициатив: группировка по pain_point_id,
              // сортировка по максимальному impact_score среди связанных инициатив.
              const painsWithInitiatives = painPoints
                .map(p => {
                  const linkedInitiatives = initiatives.filter(i => i.pain_point_id === p.id);
                  return { ...p, initiativeCount: linkedInitiatives.length, maxImpact: linkedInitiatives.reduce((m, i) => Math.max(m, i.impact_score), 0) };
                })
                .filter(p => p.initiativeCount > 0)
                .sort((a, b) => b.maxImpact - a.maxImpact)
                .slice(0, 5);

              // Разбивка инициатив по статусам — берём реальные статусы, которые встречаются в данных.
              const STATUS_LABELS: Record<string, string> = { idea: "Идея", preparation: "Подготовка", approval: "Согласование", in_plan: "В плане", pilot: "Пилот", implementation: "Реализация", done: "Завершена" };
              const statusCounts = initiatives.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {} as Record<string, number>);
              const statusBreakdown = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);

              // Правила Stage 6: пустым считаем null / '' / строку из пробелов после trim().
              const stuckInitiatives = initiatives.filter(i => i.status !== "idea" && i.status !== "done" && (isEmptyField(i.owner_name) || isEmptyField(i.next_step)));
              const readyToLaunch = initiatives.filter(i => PRE_LAUNCH_STATUSES.includes(i.status) && !isEmptyField(i.owner_name) && !isEmptyField(i.next_step));

              const WIDGETS: { key: string; icon: string; title: string; color: string; count: number; emptyText: string; tab: TabKey; preset?: OverviewPreset }[] = [
                { key: "no_solution",   icon: "ServerOff",    title: "Проблемы без решения",  color: "text-red-600 bg-red-50",    count: painsWithoutSolution.length,   emptyText: "Все проблемы привязаны к решению", tab: "pains" },
                { key: "no_hypothesis", icon: "LightbulbOff", title: "Проблемы без гипотезы", color: "text-amber-600 bg-amber-50", count: painsWithoutHypothesis.length, emptyText: "На все проблемы есть гипотезы",     tab: "pains" },
                { key: "candidates",    icon: "Target",       title: "Кандидаты в проработку", color: "text-violet-600 bg-violet-50", count: candidates.length,          emptyText: "Нет готовых кандидатов",           tab: "pains" },
                { key: "hyp_no_init",   icon: "RocketOff",    title: "Гипотезы без инициатив", color: "text-blue-600 bg-blue-50",  count: hypothesesWithoutInitiative.length, emptyText: "На все гипотезы есть инициативы", tab: "hypotheses", preset: "without_initiative" },
                { key: "ready_launch",  icon: "Rocket",       title: "Готовы к запуску",       color: "text-emerald-600 bg-emerald-50", count: readyToLaunch.length,      emptyText: "Нет проработанных инициатив",     tab: "initiatives", preset: "launch_ready" },
                { key: "stuck",         icon: "AlertTriangle", title: "Зависшие инициативы",   color: "text-orange-600 bg-orange-50", count: stuckInitiatives.length,   emptyText: "Зависших инициатив нет",          tab: "initiatives", preset: "stalled" },
              ];

              return (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Управленческий обзор</p>

                  {overviewLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                      {[0, 1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 h-20 animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                      {WIDGETS.map(w => (
                        <button
                          key={w.key}
                          onClick={() => setTab(w.tab, w.preset || null)}
                          className="text-left bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 hover:border-slate-300 hover:shadow-sm transition-all"
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${w.color}`}>
                              <Icon name={w.icon} size={14} fallback="AlertCircle" />
                            </div>
                            <p className="text-xs font-medium text-slate-600 flex-1">{w.title}</p>
                          </div>
                          {w.count > 0 ? (
                            <p className="text-2xl font-bold text-slate-900">{w.count}</p>
                          ) : (
                            <p className="text-xs text-emerald-600 font-medium">✓ {w.emptyText}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Топ-процессы по числу проблем */}
                  {!overviewLoading && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Топ-процессы по числу проблем</p>
                      {topProcesses.length === 0 ? (
                        <p className="text-xs text-slate-400">Проблемы пока не привязаны ни к одному процессу</p>
                      ) : (
                        <div className="space-y-1.5">
                          {topProcesses.map(pr => (
                            <button
                              key={pr.id}
                              onClick={() => setTab("process")}
                              className="w-full flex items-center justify-between gap-2 p-2 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-left"
                            >
                              <span className="text-xs text-slate-700 font-medium truncate flex-1 min-w-0">{pr.title}</span>
                              <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex-shrink-0">{pr.painCount}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Инициативы по статусам + топ-проблемы, дошедшие до инициатив */}
                  {!overviewLoading && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Инициативы по статусам</p>
                        {statusBreakdown.length === 0 ? (
                          <p className="text-xs text-slate-400">Инициатив пока нет</p>
                        ) : (
                          <div className="space-y-1.5">
                            {statusBreakdown.map(([status, count]) => (
                              <button
                                key={status}
                                onClick={() => setTab("initiatives")}
                                className="w-full flex items-center justify-between gap-2 p-2 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-left"
                              >
                                <span className="text-xs text-slate-700 font-medium truncate flex-1 min-w-0">{STATUS_LABELS[status] || status}</span>
                                <span className="text-[10px] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex-shrink-0">{count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Топ-проблемы, дошедшие до инициатив</p>
                        {painsWithInitiatives.length === 0 ? (
                          <p className="text-xs text-slate-400">Пока ни одна проблема не дошла до инициативы</p>
                        ) : (
                          <div className="space-y-1.5">
                            {painsWithInitiatives.map(p => (
                              <button
                                key={p.id}
                                onClick={() => setTab("initiatives")}
                                className="w-full flex items-center justify-between gap-2 p-2 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-left"
                              >
                                <span className="text-xs text-slate-700 font-medium truncate flex-1 min-w-0">{p.description}</span>
                                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex-shrink-0">эффект {p.maxImpact}/5</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Динамическая подсказка следующего шага — скрывается если показан post-action hint ── */}
            {!postActionHint && (() => {
              type Step = { icon: string; text: string; tab: string; cta: string; color: string; onCta?: () => void };
              // Правило для CTA «Создать инициативу»: берём самую новую гипотезу без инициативы.
              const hypWithoutInitiative = [...hypotheses]
                .filter(hh => !initiatives.some(i => i.hypothesis_id === hh.id))
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
              const step: Step | null =
                docs.length === 0 && processes.length === 0 && painPoints.length === 0
                  ? { icon: "Upload", text: "Загрузите документ или опишите первый процесс — это даст AI нужный контекст.", tab: "docs", cta: "Загрузить документ", color: "border-blue-200 bg-blue-50 text-blue-800" }
                  : processes.length === 0
                  ? { icon: "Workflow", text: "Опишите процесс as-is — шаги, роли, системы. Это основа для AI-анализа.", tab: "process", cta: "Добавить процесс", color: "border-slate-200 bg-slate-50 text-slate-700" }
                  : painPoints.length === 0
                  ? { icon: "Flame", text: "Зафиксируйте боли в процессе — ручной труд, дублирование, задержки.", tab: "pains", cta: "Добавить боль", color: "border-orange-200 bg-orange-50 text-orange-800" }
                  : hypotheses.length === 0
                  ? { icon: "Lightbulb", text: "Сформулируйте гипотезу улучшения на основе зафиксированных болей.", tab: "hypotheses", cta: "Создать гипотезу", color: "border-amber-200 bg-amber-50 text-amber-800" }
                  : hypWithoutInitiative
                  ? { icon: "Rocket", text: "Превратите гипотезу в инициативу — с владельцем, эффектом и статусом.", tab: "initiatives", cta: "Создать инициативу", color: "border-violet-200 bg-violet-50 text-violet-800", onCta: () => handleCreateInitiativeFromHypothesis(hypWithoutInitiative) }
                  : null;
              if (!step) return null;
              return (
                <div className={`border rounded-xl px-3 py-2.5 flex items-center gap-2.5 ${step.color}`}>
                  <Icon name={step.icon} size={15} className="flex-shrink-0 opacity-70" />
                  <p className="text-xs leading-snug flex-1">{step.text}</p>
                  <button
                    onClick={() => step.onCta ? step.onCta() : setTab(step.tab as Parameters<typeof setTab>[0])}
                    className="text-xs font-semibold whitespace-nowrap underline underline-offset-2 flex-shrink-0 opacity-80 hover:opacity-100"
                  >
                    {step.cta} →
                  </button>
                </div>
              );
            })()}

            {/* ── AI Operator ── */}
            {(() => {
              const status  = aiData?.ai_status ?? "idle";
              const stage   = aiData?.ai_stage ?? null;
              const result  = aiData?.ai_last_result_json ?? null;
              const isStale = aiData?.ai_is_stale ?? false;
              const isRunning = isActive(status);
              const stageLabel = (stage && AI_STAGE_LABELS[stage]) || "ИИ анализирует кейс...";

              return (
                <div className="bg-gradient-to-br from-slate-900 to-violet-950 rounded-2xl p-4 text-white">
                  {/* Header — двухстрочный на мобайле */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-xl bg-violet-500/30 flex items-center justify-center flex-shrink-0">
                        <Icon name="BrainCircuit" size={15} className="text-violet-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm">AI Оператор</span>
                          {!isRunning && status === "ready" && !isStale && (
                            <span className="text-[10px] text-green-400">готово</span>
                          )}
                          {!isRunning && isStale && result && (
                            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">обновились данные</span>
                          )}
                        </div>
                        {isRunning && (
                          <span className="flex items-center gap-1 text-[10px] text-violet-300 mt-0.5">
                            <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse flex-shrink-0" />
                            {stageLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      disabled={isRunning || aiLoading}
                      onClick={runAiAnalysis}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:opacity-40 rounded-lg text-xs font-semibold transition-colors flex-shrink-0"
                    >
                      {isRunning
                        ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /></>
                        : <><Icon name="Sparkles" size={12} /> {result ? "Обновить" : "Анализ"}</>}
                    </button>
                  </div>

                  {/* Plashki — компактные */}
                  {aiData?.has_pending_files && !isRunning && (
                    <div className="mb-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2 flex items-start gap-2">
                      <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-300 leading-snug">
                        Обрабатываю {aiData.pending_files_count === 1 ? "документ" : `${aiData.pending_files_count} документа`} — AI запустится автоматически
                      </p>
                    </div>
                  )}
                  {pollTimeout && (
                    <div className="mb-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 flex items-start gap-2">
                      <Icon name="Clock" size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-300 leading-snug">Анализ занимает больше времени. Можно подождать или запустить повторно.</p>
                    </div>
                  )}
                  {isStale && result && !isRunning && (
                    <div className="mb-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 flex items-start gap-2">
                      <Icon name="RefreshCw" size={13} className="text-amber-400 flex-shrink-0 animate-spin mt-0.5" />
                      <p className="text-xs text-amber-300 leading-snug">Новые данные в кейсе — запускаю обновлённый анализ</p>
                    </div>
                  )}

                  {/* Состояние 1: пустой кейс */}
                  {status === "idle" && !result && !aiLoading && (
                    <div className="text-center py-5">
                      <Icon name="PackageOpen" size={28} className="text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-400 leading-snug">Добавьте описание, процесс или боли — AI начнёт анализ автоматически</p>
                    </div>
                  )}

                  {/* Состояние 2: skeleton */}
                  {isRunning && !result && (
                    <div className="space-y-2.5 animate-pulse">
                      <div className="bg-white/5 rounded-xl h-16" />
                      <div className="bg-white/5 rounded-xl h-10" />
                      <div className="bg-white/5 rounded-xl h-10" />
                      <div className="bg-white/5 rounded-xl h-20" />
                      <p className="text-xs text-slate-500 text-center">{stageLabel}</p>
                    </div>
                  )}

                  {/* Состояние 3: ошибка */}
                  {status === "failed" && !result && (
                    <div className="text-center py-4">
                      <Icon name="AlertCircle" size={24} className="text-red-400 mx-auto mb-2" />
                      {aiData?.ai_last_error && <p className="text-xs text-slate-500 mb-2 leading-snug">{aiData.ai_last_error}</p>}
                      <p className="text-sm text-slate-400 mb-3">Не удалось завершить анализ</p>
                      <button onClick={runAiAnalysis} className="text-xs px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-white font-semibold">Повторить</button>
                    </div>
                  )}

                  {/* Состояние 4–5: результат */}
                  {result && (
                    <div className="space-y-2.5">
                      {/* Summary + score — вертикально на мобайле */}
                      <div className="bg-white/5 rounded-xl p-3">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Суть кейса</p>
                          <div className="flex items-baseline gap-0.5 flex-shrink-0">
                            <span className="text-xl font-bold text-white">{result.readiness_score}</span>
                            <span className="text-xs text-slate-400">/10</span>
                            <span className="text-[9px] text-slate-500 ml-1">готовность</span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-200 leading-relaxed">{result.summary}</p>
                      </div>

                      {/* Ключевой инсайт */}
                      {result.key_insight && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                          <p className="text-xs text-amber-400 font-semibold mb-1">💡 Ключевой инсайт</p>
                          <p className="text-xs sm:text-sm text-amber-100 leading-snug">{result.key_insight}</p>
                        </div>
                      )}

                      {/* Вердикт */}
                      <div className={`rounded-xl p-3 ${result.ai_verdict === "AI рекомендован" ? "bg-green-500/10 border border-green-500/20" : result.ai_verdict?.includes("Сначала") ? "bg-orange-500/10 border border-orange-500/20" : "bg-blue-500/10 border border-blue-500/20"}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon name={result.ai_verdict === "AI рекомендован" ? "CheckCircle" : "Info"} size={13} className={`flex-shrink-0 ${result.ai_verdict === "AI рекомендован" ? "text-green-400" : "text-blue-400"}`} />
                          <p className="text-xs font-bold text-white">{result.ai_verdict}</p>
                        </div>
                        {result.ai_verdict_reason && <p className="text-xs text-slate-300 leading-snug">{result.ai_verdict_reason}</p>}
                      </div>

                      {/* Quick wins + Пробелы — вертикально на мобайле */}
                      {(result.quick_wins?.length > 0 || result.gaps?.length > 0) && (
                        <div className="space-y-2">
                          {result.quick_wins?.length > 0 && (
                            <div className="bg-white/5 rounded-xl p-3">
                              <p className="text-[10px] text-green-400 font-bold uppercase tracking-wide mb-2">✓ Quick wins</p>
                              <ul className="space-y-1.5">
                                {result.quick_wins.map((w: string, i: number) => (
                                  <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5 leading-snug">
                                    <span className="text-green-400 flex-shrink-0 mt-0.5">•</span>{w}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {result.gaps?.length > 0 && (
                            <div className="bg-white/5 rounded-xl p-3">
                              <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wide mb-2">⚠ Пробелы</p>
                              <ul className="space-y-1.5">
                                {result.gaps.map((g: string, i: number) => (
                                  <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5 leading-snug">
                                    <span className="text-orange-400 flex-shrink-0 mt-0.5">•</span>{g}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Следующее действие */}
                      {result.next_action && (
                        <div className="bg-violet-600/30 border border-violet-500/30 rounded-xl px-3 py-3">
                          <p className="text-[10px] text-violet-300 font-bold uppercase tracking-wide mb-1">→ Следующее действие</p>
                          <p className="text-sm text-white font-medium leading-snug">{result.next_action}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Контекст пространства */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0">
                    <Icon name="Map" size={14} className="text-white" />
                  </div>
                  <span className="font-semibold text-slate-900 text-sm sm:text-base">Контекст пространства</span>
                </div>
                <button
                  onClick={() => setWsContextEdit(!wsContextEdit)}
                  className="text-xs text-violet-600 hover:text-violet-800 font-medium flex-shrink-0 px-2 py-1 rounded-lg hover:bg-violet-50 transition-colors"
                >
                  {wsContextEdit ? "Отмена" : "Редактировать"}
                </button>
              </div>

              {wsContextEdit ? (
                <div className="space-y-2.5">
                  {[
                    { key: "goals_text",       label: "Цели и задачи",      placeholder: "Чего хотим достичь в этом проекте?" },
                    { key: "constraints_text", label: "Ограничения",         placeholder: "Что нельзя, какие ресурсы, сроки..." },
                    { key: "key_facts_text",   label: "Ключевые факты",      placeholder: "Важные вещи, которые AI должен знать..." },
                    { key: "stakeholders_text",label: "Стейкхолдеры",        placeholder: "Кто вовлечён, кто принимает решения..." },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{f.label}</label>
                      <textarea
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                        rows={2}
                        placeholder={f.placeholder}
                        value={wsContextDraft[f.key as keyof typeof wsContextDraft]}
                        onChange={e => setWsContextDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <button
                    onClick={handleSaveContext}
                    className="w-full py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 active:bg-slate-900 transition-colors"
                  >
                    Сохранить контекст
                  </button>
                </div>
              ) : wsContext && (wsContext.goals_text || wsContext.key_facts_text || wsContext.constraints_text) ? (
                <div className="space-y-3">
                  {wsContext.goals_text && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Цели</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{wsContext.goals_text}</p>
                    </div>
                  )}
                  {wsContext.constraints_text && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Ограничения</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{wsContext.constraints_text}</p>
                    </div>
                  )}
                  {wsContext.key_facts_text && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Ключевые факты</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{wsContext.key_facts_text}</p>
                    </div>
                  )}
                  {wsContext.stakeholders_text && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Стейкхолдеры</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{wsContext.stakeholders_text}</p>
                    </div>
                  )}
                </div>
              ) : (
                /* Empty state — объясняет зачем контекст и что нажать */
                <div className="py-5 text-center">
                  <Icon name="Map" size={24} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-600 font-medium mb-1">Контекст не заполнен</p>
                  <p className="text-xs text-slate-400 mb-3 leading-snug">
                    AI использует контекст в каждом ответе — цели, ограничения, ключевые факты
                  </p>
                  <button
                    onClick={() => setWsContextEdit(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 border border-violet-200 rounded-lg px-3 py-2 hover:bg-violet-50 active:bg-violet-100 transition-colors"
                  >
                    <Icon name="Plus" size={12} /> Добавить контекст
                  </button>
                </div>
              )}
            </div>

            {/* Открытые гипотезы */}
            {hypotheses.filter(h => h.status === "open" || h.status === "testing").length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="Lightbulb" size={15} className="text-amber-600 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-800">Активные гипотезы</span>
                </div>
                <div className="space-y-2">
                  {hypotheses.filter(h => h.status === "open" || h.status === "testing").slice(0, 3).map(h => (
                    <div key={h.id} onClick={() => { setOpenHyp(h); setTab("hypotheses"); }}
                      className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-amber-100 cursor-pointer hover:border-amber-300 active:bg-amber-50 transition-colors">
                      {/* min-w-0 чтобы truncate работал */}
                      <span className="text-sm text-slate-700 font-medium leading-snug flex-1 min-w-0 truncate">{h.title}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${h.status === "testing" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                        {h.status === "testing" ? "проверяется" : "открыта"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Последние артефакты */}
            {artifacts.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="Package" size={15} className="text-violet-600" />
                  <span className="text-sm font-semibold text-slate-800">Последние артефакты</span>
                </div>
                <div className="space-y-2">
                  {artifacts.slice(0, 3).map(a => (
                    <div key={a.id} onClick={() => handleOpenArtifact(a.id)} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{a.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{a.summary?.slice(0, 80)}...</p>
                      </div>
                      <Icon name="ChevronRight" size={13} className="text-slate-400 flex-shrink-0 ml-2" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── AI Copilot ── */}
        {tab === "copilot" && (
          <div className="space-y-3">
            {/* Режим AI — горизонтальный скролл на мобайле */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Режим AI</p>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
                {[
                  { key: "analyst",    label: "🔍 Аналитик" },
                  { key: "strategist", label: "🎯 Стратег" },
                  { key: "pm",         label: "📋 PM" },
                  { key: "researcher", label: "🔬 Исследователь" },
                ].map(m => (
                  <button key={m.key} onClick={() => setCopilotMode(m.key)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${copilotMode === m.key ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 mt-2.5 cursor-pointer">
                <input type="checkbox" id="ws-save" checked={copilotSave} onChange={e => setCopilotSave(e.target.checked)} className="w-4 h-4 rounded flex-shrink-0" />
                <span className="text-xs text-slate-600">Сохранять ответы как артефакты</span>
              </label>
            </div>

            {/* История */}
            <div className="space-y-3 min-h-[160px]">
              {copilotHistory.length === 0 && (
                <div className="bg-gradient-to-br from-slate-50 to-violet-50 border border-slate-200 rounded-2xl p-5 text-center space-y-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto">
                    <Icon name="Sparkles" size={20} className="text-violet-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">AI Copilot знает контекст проекта</p>
                    <p className="text-xs text-slate-500 mt-1">Читает файлы, гипотезы и контекст — вставлять в промпт вручную не нужно</p>
                  </div>
                  {/* Быстрые подсказки — горизонтальный скролл */}
                  <div className="flex gap-2 overflow-x-auto pb-1 justify-start sm:justify-center" style={{ scrollbarWidth: "none" }}>
                    {["Проанализируй гипотезы", "Summary по файлам", "Предложи шаги"].map(s => (
                      <button key={s} onClick={() => setCopilotMsg(s)}
                        className="flex-shrink-0 text-xs px-3 py-1.5 bg-white border border-violet-200 text-violet-700 rounded-full hover:bg-violet-50 transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {copilotHistory.map((h, i) => {
                const isLast = i === copilotHistory.length - 1;
                const nextHints: Record<string, string[]> = {
                  analyst:    ["Слабые места", "Сравни с практиками", "Executive summary"],
                  strategist: ["Оформи гипотезу", "Метрики успеха", "Roadmap на 3 мес."],
                  pm:         ["Задачи с дедлайнами", "Риски", "Кто отвечает?"],
                  researcher: ["Контраргументы", "Источники", "Сравни с рынком"],
                };
                const hints = nextHints[copilotMode] ?? ["Углуби анализ", "Следующие шаги", "Сохрани артефакт"];
                return (
                  <div key={i} className="space-y-2">
                    {/* Вопрос пользователя */}
                    <div className="flex justify-end">
                      <div className="bg-slate-800 text-white rounded-2xl rounded-tr-sm px-3 py-2.5 max-w-[85%] text-sm break-words leading-snug">{h.q}</div>
                    </div>
                    {/* Ответ AI */}
                    <div className="flex gap-2">
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon name="Sparkles" size={12} className="text-violet-600" />
                      </div>
                      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-3 py-2.5 flex-1 min-w-0">
                        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap break-words">{h.a}</p>
                        {h.artifact_id && (
                          <button onClick={() => handleOpenArtifact(h.artifact_id!)} className="mt-2 flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800 font-medium">
                            <Icon name="Package" size={11} />
                            Сохранён как артефакт
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Быстрые действия после последнего ответа */}
                    {isLast && !copilotLoading && (
                      <div className="flex gap-1.5 pl-8 sm:pl-9 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
                        {hints.map(hint => (
                          <button key={hint} onClick={() => setCopilotMsg(hint)}
                            className="flex-shrink-0 text-[11px] px-2.5 py-1 bg-violet-50 border border-violet-100 text-violet-600 rounded-full hover:bg-violet-100 transition-colors">
                            {hint}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Индикатор загрузки */}
              {copilotLoading && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <Icon name="Sparkles" size={12} className="text-violet-600" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2.5 flex items-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-slate-500">AI анализирует...</span>
                  </div>
                </div>
              )}
              <div ref={copilotEndRef} />
            </div>

            {/* Composer — sticky на мобайле */}
            <div className="sticky bottom-0 pb-safe">
              <div className="flex gap-2 bg-white border border-slate-200 rounded-2xl p-2.5 shadow-sm">
                <textarea
                  className="flex-1 text-sm resize-none focus:outline-none min-h-[44px] max-h-[120px] text-slate-800 placeholder:text-slate-400 py-1.5 px-1"
                  placeholder="Что нужно проанализировать или подготовить?"
                  value={copilotMsg}
                  onChange={e => setCopilotMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleCopilot(); } }}
                />
                <button
                  onClick={handleCopilot}
                  disabled={!copilotMsg.trim() || copilotLoading}
                  className="self-end flex items-center justify-center w-10 h-10 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 disabled:opacity-40 text-white rounded-xl transition-colors flex-shrink-0"
                >
                  <Icon name="Send" size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Гипотезы ── */}
        {tab === "hypotheses" && (() => {
          // Stage 7: preset "гипотезы без инициатив" — то же правило, что и в виджете обзора.
          const visibleHypotheses = preset === "without_initiative"
            ? hypotheses.filter(h => !initiatives.some(i => i.hypothesis_id === h.id))
            : hypotheses;
          return (
          <div className="space-y-3">
            {/* Заголовок */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Гипотезы и эксперименты</p>
              <button onClick={() => setHypForm(true)} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 transition-colors flex-shrink-0">
                <Icon name="Plus" size={12} /> Добавить
              </button>
            </div>

            {/* Активный preset-чип */}
            {preset === "without_initiative" && (
              <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 w-fit">
                <Icon name="Filter" size={12} className="text-slate-500" />
                <span className="text-xs font-medium text-slate-700">{PRESET_LABELS.without_initiative}</span>
                <button onClick={clearPreset} className="text-slate-400 hover:text-slate-700" aria-label="Сбросить фильтр">
                  <Icon name="X" size={12} />
                </button>
              </div>
            )}

            {/* Форма новой гипотезы */}
            {hypForm && (
              <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-2.5">
                <p className="text-sm font-semibold text-slate-800">Новая гипотеза</p>
                {hypSourcePain && (
                  <div className="bg-violet-50 border border-violet-100 rounded-lg p-2 flex items-start gap-2">
                    <Icon name="Flame" size={13} className="text-violet-600 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-wide">Создано из проблемы</p>
                      <p className="text-xs text-slate-700 line-clamp-2">{hypSourcePain.description}</p>
                    </div>
                  </div>
                )}
                {[
                  { key: "title",            label: "Формулировка *",   placeholder: "Если мы сделаем X, то Y вырастет на Z%", required: true },
                  { key: "statement",        label: "Детальное описание", placeholder: "Почему мы так думаем?" },
                  { key: "assumptions",      label: "Предпосылки",       placeholder: "Что должно быть верным?" },
                  { key: "success_criteria", label: "Критерии успеха",   placeholder: "Как поймём, что подтвердилась?" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{f.label}</label>
                    <input
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder={f.placeholder}
                      value={hypDraft[f.key as keyof typeof hypDraft]}
                      onChange={e => setHypDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Приоритет</label>
                  <select className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white" value={hypDraft.priority} onChange={e => setHypDraft(prev => ({ ...prev, priority: e.target.value }))}>
                    <option value="high">🔴 Высокий</option>
                    <option value="medium">🟡 Средний</option>
                    <option value="low">🟢 Низкий</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setHypForm(false); setHypSourcePain(null); }} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Отмена</button>
                  <button onClick={handleCreateHypothesis} disabled={!hypDraft.title.trim()} className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 disabled:opacity-50">Создать</button>
                </div>
              </div>
            )}

            {/* Пустое состояние — гипотез вообще нет */}
            {hypotheses.length === 0 && !hypForm ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Icon name="Lightbulb" size={28} className="text-amber-400 mx-auto mb-2" />
                <p className="font-semibold text-slate-700 mb-1">Нет гипотез</p>
                <p className="text-xs text-slate-400 mb-3">Добавь гипотезы для проверки — AI поможет проанализировать</p>
                <button onClick={() => setHypForm(true)} className="text-xs text-violet-600 font-medium border border-violet-200 rounded-lg px-3 py-2 hover:bg-violet-50">
                  + Добавить первую гипотезу
                </button>
              </div>
            ) : visibleHypotheses.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Icon name="Filter" size={28} className="text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">
                  {preset === "without_initiative" ? "Нет гипотез без инициатив" : "По этому фильтру ничего не найдено"}
                </p>
                <button onClick={clearPreset} className="mt-3 text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50">
                  Показать все гипотезы
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { status: "open",      label: "Открытые",     color: "border-amber-200 bg-amber-50" },
                  { status: "testing",   label: "Проверяются",  color: "border-blue-200 bg-blue-50" },
                  { status: "confirmed", label: "Подтверждены", color: "border-emerald-200 bg-emerald-50" },
                  { status: "rejected",  label: "Отклонены",    color: "border-slate-200 bg-slate-50" },
                ].map(group => {
                  const grouped = visibleHypotheses.filter(h => h.status === group.status);
                  if (!grouped.length) return null;
                  return (
                    <div key={group.status}>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{group.label} ({grouped.length})</p>
                      <div className="space-y-2">
                        {grouped.map(h => (
                          <div key={h.id} className={`rounded-2xl border p-3 sm:p-4 space-y-2 ${group.color}`}>
                            {/* Строка 1: заголовок + бейдж приоритета */}
                            <div className="flex items-start gap-2">
                              <p className="text-sm font-semibold text-slate-800 leading-snug flex-1 min-w-0">{h.title}</p>
                              {/* Stage 8: объяснение, почему гипотеза попала в отфильтрованный список */}
                              {preset === "without_initiative" && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 bg-blue-100 text-blue-700 flex items-center gap-1">
                                  <Icon name="RocketOff" size={10} /> Без инициативы
                                </span>
                              )}
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${h.priority === "high" ? "bg-red-100 text-red-700" : h.priority === "low" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                                {h.priority === "high" ? "HIGH" : h.priority === "low" ? "LOW" : "MED"}
                              </span>
                            </div>
                            {/* Строка 2: детальное описание */}
                            {h.statement && <p className="text-xs text-slate-600 leading-snug line-clamp-3">{h.statement}</p>}
                            {/* Строка 3: критерий и вывод */}
                            {h.success_criteria && (
                              <p className="text-[11px] text-slate-500 leading-snug">
                                <span className="font-semibold">Критерий:</span> {h.success_criteria}
                              </p>
                            )}
                            {h.conclusion && (
                              <p className="text-[11px] text-emerald-700 font-medium leading-snug">
                                <span className="font-semibold">Вывод:</span> {h.conclusion}
                              </p>
                            )}
                            {/* Происхождение — из какой проблемы/процесса/решения создана */}
                            {(h.pain_point_id || h.process_id || h.solution_id) && (
                              <div className="flex flex-wrap gap-1.5">
                                {h.pain_point_id && (
                                  <span className="text-[10px] bg-white/70 text-red-600 border border-red-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Icon name="Flame" size={10} /> из проблемы{h.pain_point_description ? `: ${h.pain_point_description.slice(0, 40)}${h.pain_point_description.length > 40 ? "…" : ""}` : ""}
                                  </span>
                                )}
                                {h.process_id && (
                                  <span className="text-[10px] bg-white/70 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Icon name="Workflow" size={10} /> {h.process_title || "процесс"}
                                  </span>
                                )}
                                {h.solution_id && (
                                  <span className="text-[10px] bg-white/70 text-violet-600 border border-violet-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Icon name="Server" size={10} /> {h.solution_title || "решение"}
                                  </span>
                                )}
                              </div>
                            )}
                            {/* Строка 4: статусные кнопки — flex-wrap с нормальным py */}
                            <div className="flex gap-1.5 pt-0.5 flex-wrap">
                              {h.status !== "open"      && <button onClick={() => handleHypStatus(h.id, "open")}      className="text-[10px] px-2.5 py-1 bg-white border border-slate-200 rounded-full hover:bg-slate-50 text-slate-600 active:bg-slate-100">открыта</button>}
                              {h.status !== "testing"   && <button onClick={() => handleHypStatus(h.id, "testing")}   className="text-[10px] px-2.5 py-1 bg-white border border-blue-200 rounded-full hover:bg-blue-50 text-blue-600 active:bg-blue-100">проверяется</button>}
                              {h.status !== "confirmed" && <button onClick={() => handleHypStatus(h.id, "confirmed")} className="text-[10px] px-2.5 py-1 bg-white border border-emerald-200 rounded-full hover:bg-emerald-50 text-emerald-600 active:bg-emerald-100">подтверждена</button>}
                              {h.status !== "rejected"  && <button onClick={() => handleHypStatus(h.id, "rejected")}  className="text-[10px] px-2.5 py-1 bg-white border border-red-200 rounded-full hover:bg-red-50 text-red-600 active:bg-red-100">отклонена</button>}
                              <button
                                onClick={() => { setCopilotMsg(`Проанализируй гипотезу: "${h.title}". ${h.statement}`); setTab("copilot"); }}
                                className="text-[10px] px-2.5 py-1 bg-violet-600 text-white rounded-full hover:bg-violet-700 active:bg-violet-800"
                              >
                                🤖 спросить AI
                              </button>
                              {!initiatives.some(i => i.hypothesis_id === h.id) && (
                                <button
                                  onClick={() => handleCreateInitiativeFromHypothesis(h)}
                                  className={`font-semibold rounded-full flex items-center gap-1 ${
                                    preset === "without_initiative"
                                      ? "text-xs px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
                                      : "text-[10px] px-2.5 py-1 bg-slate-800 text-white hover:bg-slate-700 active:bg-slate-900"
                                  }`}
                                >
                                  <Icon name="Rocket" size={preset === "without_initiative" ? 12 : 10} /> Создать инициативу
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          );
        })()}

        {/* ── Артефакты ── */}
        {tab === "artifacts" && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Артефакты — результаты AI-работы в кейсе</p>

            {/* Empty state */}
            {artifacts.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Icon name="Package" size={28} className="text-violet-400 mx-auto mb-2" />
                <p className="font-semibold text-slate-700 mb-1 text-sm">Артефактов пока нет</p>
                <p className="text-xs text-slate-400 mb-3 leading-snug">Включи «Сохранять как артефакт» в AI Copilot — ответы будут сохраняться здесь</p>
                <button
                  onClick={() => setTab("copilot")}
                  className="inline-flex items-center gap-1.5 text-xs text-violet-600 font-semibold border border-violet-200 rounded-lg px-3 py-2 hover:bg-violet-50"
                >
                  <Icon name="Sparkles" size={12} /> Открыть AI Copilot
                </button>
              </div>
            ) : (
              /* Вертикальный стек на мобайле, 2 колонки на sm+ */
              <div className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
                {artifacts.map(a => (
                  <div
                    key={a.id}
                    onClick={() => handleOpenArtifact(a.id)}
                    className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 cursor-pointer hover:border-violet-300 active:bg-violet-50 hover:shadow-sm transition-all"
                  >
                    {/* Строка 1: заголовок + тип */}
                    <div className="flex items-start gap-2 mb-1.5">
                      <p className="text-sm font-semibold text-slate-800 leading-snug flex-1 min-w-0 line-clamp-2">{a.title}</p>
                      <span className="text-[9px] font-bold bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">{a.artifact_type}</span>
                    </div>
                    {/* Строка 2: summary */}
                    <p className="text-xs text-slate-500 leading-snug line-clamp-2 mb-2">{a.summary}</p>
                    {/* Строка 3: мета */}
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <Icon name="Sparkles" size={9} className="text-violet-400" />
                      <span>{a.mode}</span>
                      <span>·</span>
                      <span>{new Date(a.created_at).toLocaleDateString("ru-RU")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Модал артефакта */}
        {openArtifact && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOpenArtifact(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div>
                  <p className="font-semibold text-slate-900">{openArtifact.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{openArtifact.artifact_type} · {openArtifact.mode}</p>
                </div>
                <button onClick={() => setOpenArtifact(null)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100"><Icon name="X" size={16} /></button>
              </div>
              <div className="overflow-y-auto flex-1 p-5">
                <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{openArtifact.content}</p>
              </div>
              {/* Evidence Bridge CTA */}
              <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center gap-3 flex-wrap">
                {evidenceSent.has(openArtifact.id) ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-emerald-700 flex-1">
                      <Icon name="CheckCircle2" size={15} className="text-emerald-500 flex-shrink-0" />
                      <span>Черновик готов — AI заполнил описание</span>
                    </div>
                    <Link
                      to="/cabinet/profile"
                      onClick={() => setOpenArtifact(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 transition-colors flex-shrink-0"
                    >
                      <Icon name="ArrowRight" size={12} />
                      Открыть в Passport
                    </Link>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-500 leading-snug">Добавь результат как evidence в Professional Passport — AI подготовит черновик</p>
                    </div>
                    <button
                      disabled={evidenceSending === openArtifact.id}
                      onClick={async () => {
                        analytics.evidenceBridgeClicked(projectId, openArtifact.id);
                        setEvidenceSending(openArtifact.id);
                        try {
                          const res = await passportApi.evidenceCreateFromArtifact(openArtifact.id, projectId) as { ok?: boolean; draft?: { id: number }; already_exists?: boolean };
                          analytics.evidenceDraftCreated(projectId, openArtifact.id, !!res.already_exists);
                          setEvidenceSent(prev => new Set(prev).add(openArtifact.id));
                        } catch {
                          // silent — не пугаем пользователя, кнопка вернётся доступной
                        } finally {
                          setEvidenceSending(null);
                        }
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors flex-shrink-0"
                    >
                      {evidenceSending === openArtifact.id
                        ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> AI готовит черновик...</>
                        : <><Icon name="UserCircle" size={13} /> Добавить в Passport</>
                      }
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "tasks" && (
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <div className="space-y-3">
                {/* Empty state */}
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-7 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-3">
                    <Icon name="Sparkles" size={22} className="text-orange-400" />
                  </div>
                  <p className="font-semibold text-foreground text-base mb-1">Заданий пока нет</p>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-4 leading-snug">
                    Создайте первое задание — AI прочитает материалы и подготовит результат
                  </p>
                  <Link
                    to={`/cabinet/project/${projectId}/new-task`}
                    className="inline-flex items-center gap-2 bg-slate-800 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-700 active:bg-slate-900 transition-colors"
                  >
                    <Icon name="Plus" size={15} />
                    Создать первое задание
                  </Link>
                </div>

                {/* Быстрые сценарии — вертикально на мобайле */}
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Что можно сделать</p>
                <div className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
                  {[
                    { emoji: "✨", title: "Создать презентацию",        desc: "AI соберёт PPTX из ваших документов по теме",            color: "border-orange-200 bg-orange-50/50 active:bg-orange-100", link: `/cabinet/project/${projectId}/new-task` },
                    { emoji: "🛡", title: "Проверить презентацию",      desc: "Загрузите PPTX — AI найдёт ошибки и даст правки",        color: "border-blue-200 bg-blue-50/50 active:bg-blue-100",       link: `/cabinet/project/${projectId}/audit` },
                    { emoji: "📝", title: "Подготовить доклад или анализ", desc: "AI напишет текст или составит план",                  color: "border-green-200 bg-green-50/50 active:bg-green-100",    link: `/cabinet/project/${projectId}/new-task` },
                    { emoji: "🔍", title: "Найти в материалах",         desc: "Умный поиск по всем загруженным документам",             color: "border-slate-200 bg-slate-50/50 active:bg-slate-100",    link: `/cabinet/project/${projectId}/search` },
                  ].map((s) => (
                    <Link key={s.title} to={s.link}
                      className={`flex items-center gap-3 border rounded-xl p-3 transition-all ${s.color}`}>
                      <span className="text-xl flex-shrink-0">{s.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{s.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{s.desc}</p>
                      </div>
                      <Icon name="ChevronRight" size={14} className="text-slate-400 flex-shrink-0" />
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Quick actions — горизонтальный скролл на мобайле */}
                <div className="flex gap-2 overflow-x-auto pb-3 border-b border-slate-100" style={{ scrollbarWidth: "none" }}>
                  {[
                    { emoji: "✨", label: "Новое задание",      link: `/cabinet/project/${projectId}/new-task`, cls: "bg-orange-50 border-orange-200 text-orange-700" },
                    { emoji: "🛡", label: "Аудит PPTX",         link: `/cabinet/project/${projectId}/audit`,    cls: "bg-blue-50 border-blue-200 text-blue-700" },
                    { emoji: "🔍", label: "Поиск",              link: `/cabinet/project/${projectId}/search`,   cls: "bg-slate-50 border-slate-200 text-slate-700" },
                  ].map((a) => (
                    <Link key={a.label} to={a.link}
                      className={`inline-flex items-center gap-1.5 border text-xs font-medium px-3 py-1.5 rounded-lg flex-shrink-0 ${a.cls}`}>
                      <span>{a.emoji}</span>{a.label}
                    </Link>
                  ))}
                </div>

                {/* Карточки заданий */}
                {tasks.map((t) => (
                  <Link
                    key={t.id}
                    to={`/cabinet/project/${projectId}/task/${t.id}`}
                    className="flex items-start gap-3 border rounded-xl p-3 bg-card hover:border-orange-300 active:bg-orange-50/30 hover:shadow-sm transition-all group"
                  >
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon name="Sparkles" size={16} className="text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Строка 1: название */}
                      <p className="text-sm font-medium text-slate-900 group-hover:text-orange-600 transition-colors leading-snug truncate">{t.title}</p>
                      {/* Строка 2: тип + тема */}
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {TASK_TYPE_LABELS[t.task_type] || t.task_type}
                        {t.topic && ` · ${t.topic}`}
                      </p>
                      {/* Строка 3: статус + автор */}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          t.versions > 0
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-500"
                        }`}>
                          {t.versions > 0 ? `${t.versions} версий` : "Не запущено"}
                        </span>
                        {t.created_by && <span className="text-[10px] text-muted-foreground truncate">{t.created_by}</span>}
                      </div>
                    </div>
                    <Icon name="ChevronRight" size={15} className="text-slate-300 flex-shrink-0 mt-1" />
                  </Link>
                ))}
              </>
            )}
          </div>
        )}

        {tab === "docs" && (
          <div className="space-y-3">
            {/* Зона загрузки */}
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 sm:p-6">
              <div className="flex flex-col items-center text-center mb-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-2.5">
                  <Icon name="Upload" size={20} className="text-slate-600" />
                </div>
                <p className="font-medium text-sm sm:text-base mb-0.5">Загрузить материал</p>
                <p className="text-xs sm:text-sm text-muted-foreground">PDF, DOCX, PPTX — до 100 МБ</p>
              </div>

              {/* Тип материала — полная ширина */}
              <div className="mb-3">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Тип материала</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Кнопки загрузки — вертикально на мобайле */}
              <div className="flex flex-col sm:flex-row gap-2">
                <input ref={fileRef} type="file" accept=".pdf,.docx,.pptx" onChange={handleUpload} className="hidden" id="file-upload" />
                <label
                  htmlFor="file-upload"
                  className={`flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors flex-1 ${uploading ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <Icon name="Upload" size={14} />
                  {uploading ? "Загружаю..." : "Загрузить документ"}
                </label>

                <div className="flex gap-2">
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => handleMediaUpload(e, "image")} className="hidden" id="photo-upload" />
                  <label
                    htmlFor="photo-upload"
                    className={`flex items-center justify-center gap-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors flex-1 sm:flex-none ${uploading ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <Icon name="Camera" size={14} />
                    Фото
                  </label>

                  <input type="file" accept="audio/*" onChange={(e) => handleMediaUpload(e, "audio")} className="hidden" id="audio-upload" />
                  <label
                    htmlFor="audio-upload"
                    className={`flex items-center justify-center gap-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors flex-1 sm:flex-none ${uploading ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <Icon name="Mic" size={14} />
                    Аудио
                  </label>
                </div>
              </div>

              <p className="text-[10px] sm:text-xs text-slate-400 mt-2.5 text-center leading-snug">
                Фото — распознаётся текст с доски / тетради. Аудио (OGG до 1 МБ) — расшифровывается лекция.
              </p>

              {/* Прогресс загрузки */}
              {uploading && uploadProgress > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Загружаю...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5">
                    <div className="bg-slate-800 h-1.5 rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
              {uploadError && <p className="text-red-500 text-xs mt-2 text-center">{uploadError}</p>}
            </div>

            {/* Список документов */}
            {docs.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-6">
                <Icon name="FileText" size={24} className="mx-auto mb-2 text-slate-300" />
                Материалов пока нет
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => {
                  const cat = CATEGORIES.find((c) => c.value === doc.category) || CATEGORIES[CATEGORIES.length - 1];
                  const mediaIcon = doc.media_type === "image" ? "Camera" : doc.media_type === "audio" ? "Mic" : cat.icon;
                  const mediaLabel = doc.media_type === "image" ? "Фото" : doc.media_type === "audio" ? "Аудио" : cat.label;

                  // Статус документа
                  const STATUS_CFG: Record<string, { label: string; color: string }> = {
                    ready:       { label: "Готов",        color: "bg-emerald-100 text-emerald-700" },
                    processing:  { label: "Обработка...", color: "bg-blue-100 text-blue-700" },
                    ocr_running: { label: "OCR...",        color: "bg-blue-100 text-blue-700" },
                    queued:      { label: "В очереди",    color: "bg-slate-100 text-slate-500" },
                    uploaded:    { label: "Загружен",     color: "bg-slate-100 text-slate-500" },
                    failed:      { label: "Ошибка",       color: "bg-red-100 text-red-700" },
                    archived:    { label: "Архив",        color: "bg-slate-100 text-slate-400" },
                  };
                  const statusCfg = STATUS_CFG[doc.status] || { label: doc.status, color: "bg-slate-100 text-slate-500" };
                  const isProcessing = ["processing", "ocr_running", "queued", "uploaded"].includes(doc.status);

                  return (
                    <div key={doc.id} className={`relative border rounded-xl p-3 bg-card ${doc.status === "archived" ? "opacity-60" : "border-slate-200"}`}>
                      {/* Строка 1: иконка + имя + меню */}
                      <div className="flex items-start gap-2.5">
                        <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${cat.color}`}>
                          <Icon name={mediaIcon} size={15} fallback="FileText" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug truncate pr-1">{doc.name}</p>
                          {/* Строка 2: мета — тип · размер · страницы */}
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                            <span className="text-[10px] text-slate-500 font-medium">{mediaLabel}</span>
                            <span className="text-[10px] text-slate-400">·</span>
                            <span className="text-[10px] text-slate-500">{doc.file_type.toUpperCase()}</span>
                            <span className="text-[10px] text-slate-400">·</span>
                            <span className="text-[10px] text-slate-500">{formatSize(doc.file_size)}</span>
                            {doc.page_count ? (
                              <>
                                <span className="text-[10px] text-slate-400">·</span>
                                <span className="text-[10px] text-slate-500">{doc.page_count} стр.</span>
                              </>
                            ) : null}
                          </div>
                          {/* Строка 3: статус + анимация если идёт обработка */}
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusCfg.color}`}>
                              {statusCfg.label}
                            </span>
                            {isProcessing && (
                              <div className="w-2.5 h-2.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                            )}
                          </div>
                        </div>
                        {/* Меню действий — всегда справа */}
                        <button
                          onClick={() => setMenuDocId(menuDocId === doc.id ? null : doc.id)}
                          className="p-2 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-slate-500 flex-shrink-0 -mr-1 -mt-0.5"
                          title="Действия"
                        >
                          <Icon name="MoreVertical" size={16} />
                        </button>
                      </div>

                      {/* Строка 4: кнопки действий — под именем файла */}
                      {doc.status !== "archived" && (
                        <div className="flex gap-1.5 mt-2.5 ml-10 sm:ml-11">
                          <button
                            onClick={() => handleOpenDoc(doc.id)}
                            className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
                          >
                            <Icon name="Eye" size={13} />
                            Открыть
                          </button>
                          <Link
                            to={`/cabinet/project/${projectId}/document/${doc.id}`}
                            className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
                          >
                            <Icon name="MessageCircle" size={13} />
                            Спросить AI
                          </Link>
                        </div>
                      )}

                      {/* Dropdown меню */}
                      {menuDocId === doc.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuDocId(null)} />
                          <div className="absolute right-2 top-10 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-48">
                            <button
                              onClick={() => { setMenuDocId(null); setRenamingDoc({ id: doc.id, name: doc.name }); setRenameValue(doc.name); }}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 text-left"
                            >
                              <Icon name="Pencil" size={14} />
                              Переименовать
                            </button>
                            <button
                              onClick={() => { setMenuDocId(null); handleOpenDoc(doc.id); }}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 text-left"
                            >
                              <Icon name="Download" size={14} />
                              Скачать оригинал
                            </button>
                            <div className="border-t border-slate-100 my-1" />
                            <button
                              onClick={() => { setMenuDocId(null); setConfirmDelete({ id: doc.id, name: doc.name }); }}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 text-left"
                            >
                              <Icon name="Trash2" size={14} />
                              Удалить
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "team" && (
          <div className="space-y-4">
            {/* Список участников */}
            {project.members.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-7 text-center">
                <Icon name="Users" size={26} className="text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700 text-sm mb-1">Участников пока нет</p>
                <p className="text-xs text-slate-400 mb-3 leading-snug">
                  Добавьте участников, чтобы назначать владельцев инициатив и задач
                </p>
                {project.my_role === "owner" && (
                  <button
                    onClick={() => setShowInvite(true)}
                    className="text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50"
                  >
                    + Пригласить участника
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {project.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 border rounded-xl p-3 bg-card">
                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <Icon name="User" size={14} className="text-orange-600" />
                    </div>
                    {/* Текстовый блок — обязательно min-w-0 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      m.role === "owner"
                        ? "bg-orange-100 text-orange-600"
                        : "bg-slate-100 text-slate-500"
                    }`}>
                      {m.role === "owner" ? "Владелец" : "Участник"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Форма приглашения */}
            {project.my_role === "owner" && project.members.length > 0 && (
              <div>
                {!showInvite ? (
                  <button
                    onClick={() => setShowInvite(true)}
                    className="flex items-center gap-2 border rounded-xl p-3 w-full text-sm text-muted-foreground hover:text-foreground hover:border-orange-300 active:bg-orange-50 transition-colors"
                  >
                    <Icon name="UserPlus" size={15} />
                    Пригласить участника по email
                  </button>
                ) : (
                  <form onSubmit={handleInvite} className="border rounded-xl p-3 space-y-2.5">
                    <p className="text-sm font-semibold text-slate-800">Пригласить по email</p>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                    {inviteMsg && (
                      <p className={`text-xs ${inviteMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
                        {inviteMsg}
                      </p>
                    )}
                    <div className="flex gap-2 pt-0.5">
                      <button type="button" onClick={() => { setShowInvite(false); setInviteMsg(""); }}
                        className="flex-1 border rounded-lg py-2.5 text-sm hover:bg-slate-50 transition-colors">
                        Отмена
                      </button>
                      <button type="submit"
                        className="flex-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
                        Пригласить
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* История активности */}
            {project.activity.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">История активности</p>
                <div className="space-y-2">
                  {project.activity.slice(0, 10).map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                      <p className="text-xs text-slate-700 flex-1 min-w-0 leading-snug">
                        <span className="font-medium">{a.user_name}</span>{" "}
                        <span className="text-muted-foreground">{ACTION_LABELS[a.action] || a.action}</span>
                        {a.details && <span className="text-muted-foreground"> «{a.details}»</span>}
                      </p>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0 mt-0.5">
                        {new Date(a.created_at).toLocaleDateString("ru-RU")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Процессы ── */}
        {tab === "process" && (
          <ProcessesTab
            projectId={projectId}
            processes={processes}
            loading={processesLoading}
            onReload={loadProcesses}
          />
        )}

        {/* ── Боли ── */}
        {tab === "pains" && (
          <PainsTab
            projectId={projectId}
            painPoints={painPoints}
            processes={processes}
            solutions={solutions}
            loading={painPointsLoading}
            onReload={loadPainPoints}
            onCreateHypothesis={handleCreateHypothesisFromPain}
          />
        )}

        {/* ── Бенчмарки ── */}
        {tab === "benchmarks" && (
          <div className="space-y-3">
            {/* Заголовок */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm text-slate-500 leading-snug">Внешние практики и референсы — что работает у других</p>
              <button onClick={() => setShowBenchmarkForm(true)} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 flex-shrink-0">
                <Icon name="Plus" size={13} /> Добавить
              </button>
            </div>

            {/* Форма нового бенчмарка */}
            {showBenchmarkForm && (
              <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-2.5">
                <p className="text-sm font-semibold text-slate-800">Новый бенчмарк</p>
                <input
                  placeholder="Название практики / кейса *"
                  value={benchmarkDraft.title}
                  onChange={e => setBenchmarkDraft(d => ({ ...d, title: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                {/* Источник и ссылка — вертикально на мобайле */}
                <input
                  placeholder="Источник (компания / ресурс)"
                  value={benchmarkDraft.source_name}
                  onChange={e => setBenchmarkDraft(d => ({ ...d, source_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                />
                <input
                  placeholder="Ссылка (URL)"
                  value={benchmarkDraft.source_url}
                  onChange={e => setBenchmarkDraft(d => ({ ...d, source_url: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                />
                <input
                  placeholder="Отрасль"
                  value={benchmarkDraft.industry}
                  onChange={e => setBenchmarkDraft(d => ({ ...d, industry: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                />
                <textarea placeholder="Что было сделано — суть практики" rows={2} value={benchmarkDraft.summary} onChange={e => setBenchmarkDraft(d => ({ ...d, summary: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none" />
                <textarea placeholder="Наблюдаемый эффект / результат" rows={2} value={benchmarkDraft.observed_effect} onChange={e => setBenchmarkDraft(d => ({ ...d, observed_effect: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none" />
                <textarea placeholder="Применимость к нам — что можно взять" rows={2} value={benchmarkDraft.applicability} onChange={e => setBenchmarkDraft(d => ({ ...d, applicability: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none" />
                <textarea placeholder="Заметки / ограничения" rows={2} value={benchmarkDraft.notes} onChange={e => setBenchmarkDraft(d => ({ ...d, notes: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none" />
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowBenchmarkForm(false)} className="flex-1 border border-slate-200 rounded-lg py-2.5 text-sm hover:bg-slate-50">Отмена</button>
                  <button disabled={!benchmarkDraft.title.trim() || wbLoading} onClick={async () => {
                    setWbLoading(true);
                    await workspaceApi.createBenchmark({ project_id: projectId, ...benchmarkDraft });
                    setBenchmarkDraft({ title: "", source_name: "", source_url: "", industry: "", summary: "", observed_effect: "", applicability: "", notes: "" });
                    setShowBenchmarkForm(false);
                    setPostActionHint("benchmark_created");
                    workspaceApi.getBenchmarks(projectId).then((d: { benchmarks: Benchmark[] }) => setBenchmarks(d.benchmarks || [])).catch(() => {});
                    setWbLoading(false);
                  }} className="flex-1 bg-slate-800 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
                    {wbLoading ? "Сохраняю..." : "Сохранить"}
                  </button>
                </div>
              </div>
            )}

            {/* Empty state с next-step подсказкой */}
            {benchmarks.length === 0 && !showBenchmarkForm && (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Icon name="BookMarked" size={28} className="text-slate-300 mx-auto mb-2" />
                <p className="text-slate-600 font-semibold text-sm mb-1">Бенчмарков пока нет</p>
                <p className="text-xs text-slate-400 mb-3 leading-snug">Добавьте практики из других компаний или исследований — AI сможет сопоставить их с вашими гипотезами</p>
                <button onClick={() => setShowBenchmarkForm(true)} className="text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50">
                  + Добавить первый бенчмарк
                </button>
              </div>
            )}

            {/* Карточки бенчмарков */}
            <div className="space-y-2.5">
              {benchmarks.map(b => (
                <div key={b.id} className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4">
                  {/* Строка 1: название + бейджи */}
                  <p className="font-semibold text-slate-900 text-sm leading-snug mb-1.5">{b.title}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {b.confidence_level && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                        {b.confidence_level === "high" ? "высокая доказательность" : b.confidence_level === "medium" ? "средняя" : "низкая"}
                      </span>
                    )}
                    {b.source_name && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        📎 <span className="truncate max-w-[140px]">{b.source_name}</span>
                        {b.industry && <span className="text-slate-300">· {b.industry}</span>}
                      </span>
                    )}
                    {b.source_url && (
                      <a href={b.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-violet-600 hover:text-violet-800 flex items-center gap-0.5">
                        <Icon name="ExternalLink" size={11} /> Источник
                      </a>
                    )}
                  </div>
                  {/* Строка 2: что сделано / эффект */}
                  {b.summary && (
                    <p className="text-xs text-slate-600 mb-1 leading-snug">
                      <span className="font-medium">Что сделано:</span> <span className="line-clamp-2">{b.summary}</span>
                    </p>
                  )}
                  {b.observed_effect && (
                    <p className="text-xs text-slate-600 mb-1 leading-snug">
                      <span className="font-medium">Эффект:</span> {b.observed_effect}
                    </p>
                  )}
                  {/* Строка 3: применимость — выделена зелёным */}
                  {b.applicability && (
                    <div className="mt-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                      <p className="text-xs text-green-800 leading-snug">
                        <span className="font-semibold">Применимость:</span> {b.applicability}
                      </p>
                    </div>
                  )}
                  {b.notes && <p className="text-xs text-slate-400 mt-2 italic leading-snug line-clamp-2">{b.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── AI-оценка ── */}
        {tab === "ai" && (
          <div className="space-y-3">
            {/* AI-ассессмент */}
            <div className="bg-gradient-to-br from-violet-50 to-slate-50 border border-violet-100 rounded-2xl p-3 sm:p-4 space-y-2.5">
              <p className="text-sm font-semibold text-violet-900">🧠 Быстрая оценка применимости AI</p>
              <p className="text-xs text-violet-600 leading-snug">Опишите процесс — AI скажет нужен ли ИИ, какой тип и какие риски</p>
              <textarea
                placeholder="Что происходит сейчас, кто участвует, какие данные, где ручной труд..."
                rows={3}
                value={aiAssessText}
                onChange={e => setAiAssessText(e.target.value)}
                className="w-full border border-violet-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
              />
              <button
                disabled={!aiAssessText.trim() || aiAssessLoading}
                onClick={async () => {
                  setAiAssessLoading(true);
                  setAiAssessResult(null);
                  try {
                    const res = await workspaceApi.aiAssess(projectId, aiAssessText) as { assessment: Record<string, unknown> };
                    setAiAssessResult(res.assessment);
                  } finally { setAiAssessLoading(false); }
                }}
                className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {aiAssessLoading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Анализирую...</>
                  : <><Icon name="Sparkles" size={14} /> Оценить</>}
              </button>

              {/* Результат ассессмента */}
              {aiAssessResult && (
                <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5">
                  {/* Вердикт */}
                  <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl ${(aiAssessResult.ai_recommended as boolean) ? "bg-green-50 border border-green-200" : "bg-slate-50 border border-slate-200"}`}>
                    <Icon name={aiAssessResult.ai_recommended ? "CheckCircle" : "XCircle"} size={16} className={`flex-shrink-0 mt-0.5 ${aiAssessResult.ai_recommended ? "text-green-600" : "text-slate-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-snug">{aiAssessResult.recommendation_label as string}</p>
                      {aiAssessResult.solution_label && (
                        <p className="text-xs text-slate-500 mt-0.5">→ {aiAssessResult.solution_label as string}</p>
                      )}
                    </div>
                  </div>

                  {/* Операции */}
                  {Array.isArray(aiAssessResult.key_operations) && (aiAssessResult.key_operations as string[]).length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Операции для автоматизации</p>
                      <ul className="space-y-1">
                        {(aiAssessResult.key_operations as string[]).map((op, i) => (
                          <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5 leading-snug">
                            <span className="text-violet-500 flex-shrink-0 mt-0.5">•</span>{op}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Quick wins */}
                  {Array.isArray(aiAssessResult.quick_wins) && (aiAssessResult.quick_wins as string[]).length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Quick wins</p>
                      <ul className="space-y-1">
                        {(aiAssessResult.quick_wins as string[]).map((w, i) => (
                          <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5 leading-snug">
                            <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>{w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Риски */}
                  {Array.isArray(aiAssessResult.risks) && (aiAssessResult.risks as string[]).length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Риски</p>
                      <ul className="space-y-1">
                        {(aiAssessResult.risks as string[]).map((r, i) => (
                          <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5 leading-snug">
                            <span className="text-orange-500 flex-shrink-0 mt-0.5">⚠</span>{r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Следующий шаг */}
                  {aiAssessResult.next_step && (
                    <div className="bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-wide mb-0.5">Следующий шаг</p>
                      <p className="text-xs text-violet-800 leading-snug">{aiAssessResult.next_step as string}</p>
                    </div>
                  )}

                  {/* CTA — на всю ширину */}
                  <button
                    onClick={async () => {
                      const r = aiAssessResult;
                      await workspaceApi.createAiOpportunity({
                        project_id: projectId,
                        title: aiAssessText.slice(0, 80),
                        current_manual_operation: aiAssessText,
                        proposed_solution_type: (r.solution_type as string) || "none",
                        recommendation: (r.recommendation_label as string) || "assess",
                        risks: Array.isArray(r.risks) ? (r.risks as string[]).join("; ") : "",
                        human_in_loop: Boolean(r.human_in_loop),
                      });
                      workspaceApi.getAiOpportunities(projectId).then((d: { opportunities: AiOpportunity[] }) => setAiOpportunities(d.opportunities || [])).catch(() => {});
                      setAiAssessResult(null);
                      setAiAssessText("");
                      setPostActionHint("assessment_saved");
                    }}
                    className="flex items-center justify-center gap-1.5 w-full py-2.5 text-sm text-violet-700 border border-violet-200 rounded-xl hover:bg-violet-50 font-semibold transition-colors"
                  >
                    <Icon name="Save" size={13} /> Сохранить как AI-возможность
                  </button>
                </div>
              )}
            </div>

            {/* Заголовок списка */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">AI-возможности ({aiOpportunities.length})</p>
              <button onClick={() => setShowAiForm(true)} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 flex-shrink-0">
                <Icon name="Plus" size={13} /> Добавить
              </button>
            </div>

            {/* Форма ручного добавления */}
            {showAiForm && (
              <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-2.5">
                <input
                  placeholder="Название (что автоматизируем) *"
                  value={aiDraft.title}
                  onChange={e => setAiDraft(d => ({ ...d, title: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <textarea
                  placeholder="Текущая ручная операция"
                  rows={2}
                  value={aiDraft.current_manual_operation}
                  onChange={e => setAiDraft(d => ({ ...d, current_manual_operation: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none"
                />
                {/* Select'ы — вертикально */}
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Тип решения</label>
                  <select value={aiDraft.proposed_solution_type} onChange={e => setAiDraft(d => ({ ...d, proposed_solution_type: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white">
                    <option value="none">Не определён</option>
                    <option value="genai">GenAI</option>
                    <option value="ml">ML / классический AI</option>
                    <option value="rpa">RPA / боты</option>
                    <option value="rule_engine">Rule engine</option>
                    <option value="workflow">Workflow автоматизация</option>
                    <option value="bi">BI / аналитика</option>
                    <option value="idp">IDP / распознавание</option>
                    <option value="hybrid">Гибрид</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Рекомендация</label>
                  <select value={aiDraft.recommendation} onChange={e => setAiDraft(d => ({ ...d, recommendation: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white">
                    <option value="recommended">AI рекомендован</option>
                    <option value="possible">AI возможен</option>
                    <option value="assess">Требует оценки</option>
                    <option value="no_ai">AI не нужен</option>
                    <option value="automate_first">Сначала автоматизация</option>
                  </select>
                </div>
                <textarea placeholder="Ожидаемый эффект" rows={2} value={aiDraft.expected_effect} onChange={e => setAiDraft(d => ({ ...d, expected_effect: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none" />
                <textarea placeholder="Риски" rows={2} value={aiDraft.risks} onChange={e => setAiDraft(d => ({ ...d, risks: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none" />
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={aiDraft.human_in_loop} onChange={e => setAiDraft(d => ({ ...d, human_in_loop: e.target.checked }))} className="w-4 h-4 flex-shrink-0" />
                  Human-in-the-loop (требует проверки человеком)
                </label>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowAiForm(false)} className="flex-1 border border-slate-200 rounded-lg py-2.5 text-sm hover:bg-slate-50">Отмена</button>
                  <button disabled={!aiDraft.title.trim() || wbLoading} onClick={async () => {
                    setWbLoading(true);
                    await workspaceApi.createAiOpportunity({ project_id: projectId, ...aiDraft });
                    setAiDraft({ title: "", current_manual_operation: "", data_type: "mixed", proposed_solution_type: "none", expected_effect: "", risks: "", human_in_loop: true, recommendation: "assess" });
                    setShowAiForm(false);
                    workspaceApi.getAiOpportunities(projectId).then((d: { opportunities: AiOpportunity[] }) => setAiOpportunities(d.opportunities || [])).catch(() => {});
                    setWbLoading(false);
                  }} className="flex-1 bg-slate-800 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
                    {wbLoading ? "Сохраняю..." : "Сохранить"}
                  </button>
                </div>
              </div>
            )}

            {/* Пустое состояние */}
            {aiOpportunities.length === 0 && !showAiForm && (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Icon name="Cpu" size={28} className="text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">Нет сохранённых AI-возможностей</p>
                <p className="text-xs text-slate-400 mt-1">Используйте ассессмент выше или добавьте вручную</p>
              </div>
            )}

            {/* Карточки AI-возможностей */}
            <div className="space-y-2.5">
              {aiOpportunities.map(opp => {
                const REC_CFG: Record<string, { bg: string; border: string; text: string; badge: string }> = {
                  recommended:    { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-800",  badge: "bg-green-100 text-green-700" },
                  possible:       { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-800",   badge: "bg-blue-100 text-blue-700" },
                  no_ai:          { bg: "bg-slate-50",  border: "border-slate-200",  text: "text-slate-700",  badge: "bg-slate-100 text-slate-600" },
                  automate_first: { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-800",  badge: "bg-amber-100 text-amber-700" },
                  assess:         { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-800",  badge: "bg-amber-100 text-amber-700" },
                };
                const cfg = REC_CFG[opp.recommendation] || REC_CFG.assess;
                const SOL_LABELS: Record<string, string> = { genai: "GenAI", ml: "ML", rpa: "RPA", rule_engine: "Rule engine", workflow: "Workflow", bi: "BI/аналитика", idp: "IDP", hybrid: "Гибрид", none: "Тип не задан" };
                return (
                  <div key={opp.id} className={`border rounded-2xl p-3 sm:p-4 ${cfg.bg} ${cfg.border}`}>
                    {/* Строка 1: название */}
                    <p className={`font-semibold text-sm leading-snug mb-2 ${cfg.text}`}>{opp.title}</p>
                    {/* Строка 2: бейджи */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                        {SOL_LABELS[opp.proposed_solution_type] || opp.proposed_solution_type}
                      </span>
                      {opp.human_in_loop && (
                        <span className="text-[10px] bg-white/70 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">👤 human-in-loop</span>
                      )}
                    </div>
                    {/* Строка 3: детали */}
                    {opp.current_manual_operation && (
                      <p className={`text-xs mb-1 leading-snug ${cfg.text} opacity-80`}>
                        <span className="font-medium">Сейчас:</span> <span className="line-clamp-2">{opp.current_manual_operation}</span>
                      </p>
                    )}
                    {opp.expected_effect && (
                      <p className={`text-xs mb-1 leading-snug ${cfg.text} opacity-80`}>
                        <span className="font-medium">Эффект:</span> {opp.expected_effect}
                      </p>
                    )}
                    {opp.risks && (
                      <p className={`text-xs leading-snug ${cfg.text} opacity-70`}>
                        <span className="font-medium">Риски:</span> <span className="line-clamp-2">{opp.risks}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Инициативы ── */}
        {tab === "initiatives" && (() => {
          // Stage 7: preset-фильтр из виджетов управленческого обзора.
          // Правила идентичны тем, что считают счётчики на вкладке "Обзор полигона" —
          // числа в чипе и в виджете всегда совпадают.
          const visibleInitiatives = preset === "stalled"
            ? initiatives.filter(i => i.status !== "idea" && i.status !== "done" && (isEmptyField(i.owner_name) || isEmptyField(i.next_step)))
            : preset === "launch_ready"
            ? initiatives.filter(i => PRE_LAUNCH_STATUSES.includes(i.status) && !isEmptyField(i.owner_name) && !isEmptyField(i.next_step))
            : initiatives;
          return (
          <div className="space-y-3">
            {/* Заголовок */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm text-slate-500 leading-snug">Решения готовые к реализации — с приоритетом и ответственным</p>
              <button onClick={() => setShowInitiativeForm(true)} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 flex-shrink-0">
                <Icon name="Plus" size={13} /> Добавить
              </button>
            </div>

            {/* Активный preset-чип */}
            {(preset === "stalled" || preset === "launch_ready") && (
              <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 w-fit">
                <Icon name="Filter" size={12} className="text-slate-500" />
                <span className="text-xs font-medium text-slate-700">{PRESET_LABELS[preset]}</span>
                <button onClick={clearPreset} className="text-slate-400 hover:text-slate-700" aria-label="Сбросить фильтр">
                  <Icon name="X" size={12} />
                </button>
              </div>
            )}

            {/* Форма новой инициативы */}
            {showInitiativeForm && (
              <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-2.5">
                <p className="text-sm font-semibold text-slate-800">Новая инициатива</p>
                {initiativeSourceHyp && (
                  <div className="bg-violet-50 border border-violet-100 rounded-lg p-2 flex items-start gap-2">
                    <Icon name="Lightbulb" size={13} className="text-violet-600 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-wide">Создано из гипотезы</p>
                      <p className="text-xs text-slate-700 line-clamp-2">{initiativeSourceHyp.title}</p>
                    </div>
                  </div>
                )}
                <input
                  placeholder="Название инициативы *"
                  value={initiativeDraft.title}
                  onChange={e => setInitiativeDraft(d => ({ ...d, title: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <textarea
                  placeholder="Описание — что планируем сделать"
                  rows={2}
                  value={initiativeDraft.description}
                  onChange={e => setInitiativeDraft(d => ({ ...d, description: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none"
                />
                {/* Владелец — полная ширина */}
                <input
                  placeholder="Владелец"
                  value={initiativeDraft.owner_name}
                  onChange={e => setInitiativeDraft(d => ({ ...d, owner_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                />
                {/* Приоритет — полная ширина */}
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Приоритет</label>
                  <select value={initiativeDraft.priority} onChange={e => setInitiativeDraft(d => ({ ...d, priority: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white">
                    <option value="critical">Критический</option>
                    <option value="high">Высокий</option>
                    <option value="medium">Средний</option>
                    <option value="low">Низкий</option>
                  </select>
                </div>
                {/* Эффект и усилие — вертикально с ползунками */}
                <div className="space-y-2">
                  <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-slate-500">📈 Эффект</p>
                      <span className="text-sm font-bold text-slate-700">{initiativeDraft.impact_score}/5</span>
                    </div>
                    <input type="range" min={1} max={5} value={initiativeDraft.impact_score} onChange={e => setInitiativeDraft(d => ({ ...d, impact_score: Number(e.target.value) }))} className="w-full accent-slate-700" />
                  </div>
                  <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-slate-500">💪 Усилие</p>
                      <span className="text-sm font-bold text-slate-700">{initiativeDraft.effort_score}/5</span>
                    </div>
                    <input type="range" min={1} max={5} value={initiativeDraft.effort_score} onChange={e => setInitiativeDraft(d => ({ ...d, effort_score: Number(e.target.value) }))} className="w-full accent-slate-700" />
                  </div>
                </div>
                {/* Статус */}
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Статус</label>
                  <select value={initiativeDraft.status} onChange={e => setInitiativeDraft(d => ({ ...d, status: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white">
                    <option value="idea">Идея</option>
                    <option value="preparation">Подготовка</option>
                    <option value="approval">Согласование</option>
                    <option value="in_plan">В плане</option>
                    <option value="pilot">Пилот</option>
                    <option value="implementation">Реализация</option>
                    <option value="done">Завершена</option>
                  </select>
                </div>
                <input
                  placeholder="Следующий шаг"
                  value={initiativeDraft.next_step}
                  onChange={e => setInitiativeDraft(d => ({ ...d, next_step: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                />
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setShowInitiativeForm(false); setInitiativeSourceHyp(null); }} className="flex-1 border border-slate-200 rounded-lg py-2.5 text-sm hover:bg-slate-50">Отмена</button>
                  <button disabled={!initiativeDraft.title.trim() || wbLoading} onClick={async () => {
                    setWbLoading(true);
                    await workspaceApi.createInitiative({ project_id: projectId, ...initiativeDraft });
                    setInitiativeDraft({ title: "", description: "", owner_name: "", priority: "medium", impact_score: 3, effort_score: 3, status: "idea", next_step: "", hypothesis_id: null, pain_point_id: null, process_id: null, solution_id: null });
                    setInitiativeSourceHyp(null);
                    setShowInitiativeForm(false);
                    setPostActionHint("initiative_created");
                    workspaceApi.getInitiatives(projectId).then((d: { initiatives: Initiative[] }) => setInitiatives(d.initiatives || [])).catch(() => {});
                    setWbLoading(false);
                  }} className="flex-1 bg-slate-800 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
                    {wbLoading ? "Сохраняю..." : "Сохранить"}
                  </button>
                </div>
              </div>
            )}

            {/* Пустое состояние — нет инициатив вообще */}
            {initiatives.length === 0 && !showInitiativeForm && (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Icon name="Rocket" size={28} className="text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">Инициатив пока нет</p>
                <p className="text-xs text-slate-400 mt-1">Создайте инициативу — с эффектом, усилием и статусом</p>
                <button onClick={() => setShowInitiativeForm(true)} className="mt-3 text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50">
                  + Добавить первую инициативу
                </button>
              </div>
            )}

            {/* Пустое состояние — preset ничего не нашёл (Stage 8: текст зависит от preset) */}
            {initiatives.length > 0 && visibleInitiatives.length === 0 && (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Icon name="Filter" size={28} className="text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">
                  {preset === "stalled" ? "Нет зависших инициатив" : preset === "launch_ready" ? "Нет инициатив, готовых к запуску" : "По этому фильтру ничего не найдено"}
                </p>
                <button onClick={clearPreset} className="mt-3 text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50">
                  Показать все инициативы
                </button>
              </div>
            )}

            {/* Список инициатив */}
            <div className="space-y-2.5">
              {visibleInitiatives.map(init => {
                const STATUS_MAP: Record<string, { label: string; color: string }> = {
                  idea:           { label: "Идея",        color: "bg-slate-100 text-slate-600" },
                  preparation:    { label: "Подготовка",  color: "bg-amber-100 text-amber-700" },
                  approval:       { label: "Согласование",color: "bg-blue-100 text-blue-700" },
                  in_plan:        { label: "В плане",     color: "bg-indigo-100 text-indigo-700" },
                  pilot:          { label: "Пилот",       color: "bg-violet-100 text-violet-700" },
                  implementation: { label: "Реализация",  color: "bg-green-100 text-green-700" },
                  done:           { label: "Завершена",   color: "bg-emerald-100 text-emerald-700" },
                };
                const PRIORITY_MAP: Record<string, { label: string; color: string; border: string }> = {
                  critical: { label: "Критический", color: "bg-red-100 text-red-700",    border: "border-red-200" },
                  high:     { label: "Высокий",     color: "bg-orange-100 text-orange-700", border: "border-orange-200" },
                  medium:   { label: "Средний",     color: "bg-slate-100 text-slate-600",   border: "border-slate-200" },
                  low:      { label: "Низкий",      color: "bg-slate-100 text-slate-500",   border: "border-slate-200" },
                };
                const s = STATUS_MAP[init.status] || { label: init.status, color: "bg-slate-100 text-slate-600" };
                const pr = PRIORITY_MAP[init.priority] || PRIORITY_MAP.medium;
                return (
                  <div key={init.id} className={`bg-white border rounded-2xl p-3 sm:p-4 ${pr.border}`}>
                    {/* Строка 1: название */}
                    <p className="font-semibold text-slate-900 text-sm leading-snug mb-2">{init.title}</p>
                    {/* Строка 2: бейджи — flex-wrap */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pr.color}`}>{pr.label}</span>
                      {init.owner_name && <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">👤 {init.owner_name}</span>}
                      {/* Stage 8: объяснение, почему карточка попала в отфильтрованный список */}
                      {preset === "stalled" && isEmptyField(init.owner_name) && (
                        <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Icon name="UserX" size={10} /> Нет владельца
                        </span>
                      )}
                      {preset === "stalled" && isEmptyField(init.next_step) && (
                        <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Icon name="SignpostOff" size={10} fallback="AlertCircle" /> Нет следующего шага
                        </span>
                      )}
                      {preset === "launch_ready" && (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Icon name="Rocket" size={10} /> Готово к запуску
                        </span>
                      )}
                    </div>
                    {/* Строка 3: описание */}
                    {init.description && <p className="text-xs text-slate-600 mb-2 line-clamp-2">{init.description}</p>}
                    {/* Строка 4: метрики эффект/усилие */}
                    <div className="flex gap-3 text-xs text-slate-500 mb-1">
                      <span>📈 Эффект: <b className="text-slate-700">{init.impact_score}/5</b></span>
                      <span>💪 Усилие: <b className="text-slate-700">{init.effort_score}/5</b></span>
                    </div>
                    {/* Следующий шаг */}
                    {init.next_step && (
                      <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        <p className="text-xs text-amber-800 leading-snug">
                          <span className="font-semibold">→ Следующий шаг:</span> {init.next_step}
                        </p>
                      </div>
                    )}
                    {/* Происхождение — из какой гипотезы/проблемы/процесса/решения создана */}
                    {(init.hypothesis_id || init.pain_point_id || init.process_id || init.solution_id) && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {init.hypothesis_id && (
                          <span className="text-[10px] bg-violet-50 text-violet-700 border border-violet-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Icon name="Lightbulb" size={10} /> из гипотезы{init.hypothesis_title ? `: ${init.hypothesis_title.slice(0, 40)}${init.hypothesis_title.length > 40 ? "…" : ""}` : ""}
                          </span>
                        )}
                        {init.pain_point_id && (
                          <span className="text-[10px] bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Icon name="Flame" size={10} /> из проблемы{init.pain_point_description ? `: ${init.pain_point_description.slice(0, 40)}${init.pain_point_description.length > 40 ? "…" : ""}` : ""}
                          </span>
                        )}
                        {init.process_id && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Icon name="Workflow" size={10} /> {init.process_title || "процесс"}
                          </span>
                        )}
                        {init.solution_id && (
                          <span className="text-[10px] bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Icon name="Server" size={10} /> {init.solution_title || "решение"}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Stage 9: контекстное действие для preset=stalled — ведёт в существующую форму дозаполнения */}
                    {preset === "stalled" && (isEmptyField(init.owner_name) || isEmptyField(init.next_step)) && (
                      <button
                        onClick={() => openFixInitiative(init)}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 active:bg-orange-800"
                      >
                        <Icon name="Wrench" size={12} />
                        {isEmptyField(init.owner_name) && isEmptyField(init.next_step)
                          ? "Заполнить владельца и следующий шаг"
                          : isEmptyField(init.owner_name)
                          ? "Указать владельца"
                          : "Указать следующий шаг"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          );
        })()}

        {/* ── Решения и системы (полигон) ── */}
        {tab === "solutions" && (
          <SolutionsTab
            projectId={projectId}
            solutions={solutions}
            loading={solutionsLoading}
            onReload={loadSolutions}
          />
        )}

      </div>

      {/* Stage 9: модалка дозаполнения инициативы (владелец / следующий шаг) из preset=stalled */}
      {fixInitiativeId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold mb-4 text-slate-800">Дозаполнить инициативу</h2>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Владелец</label>
            <input
              autoFocus
              placeholder="Кто отвечает за инициативу"
              value={fixInitiativeDraft.owner_name}
              onChange={e => setFixInitiativeDraft(d => ({ ...d, owner_name: e.target.value }))}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 mb-4"
            />
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Следующий шаг</label>
            <input
              placeholder="Что нужно сделать дальше"
              value={fixInitiativeDraft.next_step}
              onChange={e => setFixInitiativeDraft(d => ({ ...d, next_step: e.target.value }))}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setFixInitiativeId(null)} className="flex-1 border border-slate-300 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50">
                Отмена
              </button>
              <button onClick={handleFixInitiativeSave} disabled={fixInitiativeLoading} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">
                {fixInitiativeLoading ? "Сохраняю..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка переименования */}
      {renamingDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold mb-4 text-slate-800">Переименовать материал</h2>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => { setRenamingDoc(null); setRenameValue(""); }} className="flex-1 border border-slate-300 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50">
                Отмена
              </button>
              <button onClick={handleRename} disabled={!renameValue.trim()} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка удаления */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="AlertTriangle" size={24} className="text-red-600" />
            </div>
            <h2 className="text-lg font-semibold mb-2 text-center text-slate-800">Удалить материал?</h2>
            <p className="text-sm text-slate-600 mb-1 text-center">«{confirmDelete.name}»</p>
            <p className="text-xs text-slate-500 mb-5 text-center">Будут удалены: файл, извлечённый текст, фрагменты для поиска и история чата по нему. Это действие необратимо.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-slate-300 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50">
                Отмена
              </button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2.5 text-sm font-medium">
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}