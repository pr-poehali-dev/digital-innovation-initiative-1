import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { projectsApi, documentsApi, uploadDocumentChunked, mediaApi, tasksApi, workspaceApi, fileToBase64 } from "@/lib/api";
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

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  const [project, setProject] = useState<Project | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState<"overview" | "copilot" | "hypotheses" | "artifacts" | "tasks" | "docs" | "team" | "process" | "pains" | "benchmarks" | "ai" | "initiatives">("overview");

  // Workspace state
  type Hypothesis = { id: number; title: string; statement: string; assumptions: string; success_criteria: string; status: string; conclusion: string; priority: string; created_at: string; updated_at: string };
  type Artifact = { id: number; title: string; artifact_type: string; summary: string; mode: string; created_at: string; content?: string };
  type WsContext = { goals_text: string; constraints_text: string; key_facts_text: string; stakeholders_text: string; updated_at?: string } | null;

  // Transformation Workbench types
  type ProcessStep = { id: number; step_order: number; title: string; role_name: string; description: string; system_name: string; is_manual: boolean; pain_point: string; control_point: string; automation_potential: string; ai_potential: string; duration_minutes: number | null };
  type Process = { id: number; title: string; description: string; owner_name: string; department: string; maturity_level: string; digital_maturity: string; ai_potential: string; step_count: number; steps: ProcessStep[] };
  type PainPoint = { id: number; pain_type: string; description: string; impact_level: string; frequency: string; root_cause: string };
  type Benchmark = { id: number; title: string; source_name: string; source_url: string; industry: string; organization_name: string; benchmark_type: string; summary: string; observed_effect: string; applicability: string; confidence_level: string; notes: string; relevance_note: string };
  type AiOpportunity = { id: number; title: string; current_manual_operation: string; data_type: string; proposed_solution_type: string; use_case_type: string; expected_effect: string; risks: string; security_notes: string; human_in_loop: boolean; recommendation: string };
  type Initiative = { id: number; title: string; description: string; owner_name: string; priority: string; impact_score: number; effort_score: number; status: string; next_step: string };

  // Transformation Workbench state
  const [processes, setProcesses] = useState<Process[]>([]);
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [aiOpportunities, setAiOpportunities] = useState<AiOpportunity[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  // Process forms
  const [showProcessForm, setShowProcessForm] = useState(false);
  const [processDraft, setProcessDraft] = useState({ title: "", description: "", owner_name: "", department: "" });
  const [expandedProcess, setExpandedProcess] = useState<number | null>(null);
  const [stepDraft, setStepDraft] = useState<Record<number, { title: string; role_name: string; system_name: string; is_manual: boolean; pain_point: string; ai_potential: string }>>({});
  const [showStepForm, setShowStepForm] = useState<number | null>(null);
  // Pain form
  const [showPainForm, setShowPainForm] = useState(false);
  const [painDraft, setPainDraft] = useState({ description: "", pain_type: "manual_work", impact_level: "medium", frequency: "", root_cause: "" });
  const [aiExtractLoading, setAiExtractLoading] = useState(false);
  const [aiExtractText, setAiExtractText] = useState("");
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
  const [initiativeDraft, setInitiativeDraft] = useState({ title: "", description: "", owner_name: "", priority: "medium", impact_score: 3, effort_score: 3, status: "idea", next_step: "" });
  const [wbLoading, setWbLoading] = useState(false);

  const loadWorkbench = () => {
    workspaceApi.getProcesses(projectId).then((d: { processes: Process[] }) => setProcesses(d.processes || [])).catch(() => {});
    workspaceApi.getPainPoints(projectId).then((d: { pain_points: PainPoint[] }) => setPainPoints(d.pain_points || [])).catch(() => {});
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
  const [hypDraft, setHypDraft] = useState({ title: "", statement: "", assumptions: "", success_criteria: "", priority: "medium" });
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
    } catch {
      setCopilotHistory(prev => [...prev, { q, a: "Не удалось получить ответ. Попробуй ещё раз." }]);
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
    setHypDraft({ title: "", statement: "", assumptions: "", success_criteria: "", priority: "medium" });
    workspaceApi.getHypotheses(projectId).then((d: { hypotheses: Hypothesis[] }) => setHypotheses(d.hypotheses || [])).catch(() => {});
  };

  const handleHypStatus = async (id: number, status: string) => {
    await workspaceApi.updateHypothesis({ id, status });
    analytics.workspaceHypothesisUpdated(projectId, id, status);
    workspaceApi.getHypotheses(projectId).then((d: { hypotheses: Hypothesis[] }) => setHypotheses(d.hypotheses || [])).catch(() => {});
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
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link to="/cabinet/projects" className="flex items-center gap-1 hover:text-foreground transition-colors">
            <Icon name="Briefcase" size={13} />
            Рабочий кабинет
          </Link>
          <Icon name="ChevronRight" size={13} />
          <span className="text-foreground font-medium truncate">{project.title}</span>
        </div>

        <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Кейс трансформации</p>
            <h1 className="text-2xl font-bold leading-tight">{project.title}</h1>
            {project.description && (
              <p className="text-muted-foreground text-sm mt-1 max-w-2xl">{project.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Link
              to={`/cabinet/project/${projectId}/audit`}
              className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Icon name="ShieldCheck" size={16} />
              Аудит
            </Link>
            <Link
              to={`/cabinet/project/${projectId}/search`}
              className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Icon name="Search" size={16} />
              Поиск
            </Link>
            <Link
              to={`/cabinet/project/${projectId}/new-task`}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Icon name="Plus" size={16} />
              Новое задание
            </Link>
          </div>
        </div>

        <HelpPanel
          title="Как работать с кабинетом"
          summary="Это рабочий кабинет кейса трансформации. Опишите процесс, зафиксируйте боли, оцените AI-потенциал — и получите готовую инициативу."
          steps={[
            { num: 1, title: "Опишите процесс", description: "Вкладка «Процессы» — добавьте шаги as-is: кто делает, в какой системе, где боли и ручной труд." },
            { num: 2, title: "Зафиксируйте боли", description: "Вкладка «Боли» — добавьте вручную или используйте AI-экстракцию из любого текста описания." },
            { num: 3, title: "Оцените AI-потенциал", description: "Вкладка «AI-оценка» — опишите операцию, AI скажет нужен ли ИИ и какого типа решение." },
            { num: 4, title: "Запустите AI Оператора", description: "На вкладке «Обзор» нажмите «Запустить анализ» — AI сам прочитает весь кейс и выдаст структурированный разбор." },
          ]}
          sections={[
            {
              title: "Что значат вкладки",
              icon: "Layers",
              subsections: [
                { title: "⚙️ Процессы", content: "Описание as-is и to-be: шаги, роли, системы, ручные операции, AI-потенциал каждого шага." },
                { title: "🔥 Боли", content: "Ручной труд, дублирование, задержки, контрольные разрывы — с типом, влиянием и корневой причиной." },
                { title: "📌 Бенчмарки", content: "Внешние практики и референсы с оценкой применимости к вашему кейсу." },
                { title: "🧠 AI-оценка", content: "Где нужен GenAI, ML, RPA, rule engine или BI — структурированный вердикт с рисками и quick wins." },
                { title: "🚀 Инициативы", content: "Решения готовые к реализации: с эффектом, усилием, владельцем и статусом продвижения." },
              ],
            },
          ]}
          tips={[
            { kind: "tip", text: "Сначала заполните Процессы и Боли — тогда AI Оператор даст конкретный, а не общий анализ." },
            { kind: "warning", text: "AI-оценка без описания процессов будет поверхностной. Чем больше данных — тем точнее вывод." },
            { kind: "example", text: "Хороший кейс: as-is процесс (5+ шагов) + 4–6 болей + 2–3 гипотезы + 1 бенчмарк." },
          ]}
        />

        <div className="flex gap-0.5 mb-6 border-b overflow-x-auto">
          {([
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
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-slate-800 text-slate-900"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Обзор ── */}
        {tab === "overview" && (
          <div className="space-y-5">
            {/* Карточки-счётчики */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Гипотез", count: hypotheses.length, active: hypotheses.filter(h => h.status === "open" || h.status === "testing").length, icon: "Lightbulb", color: "text-amber-600 bg-amber-50" },
                { label: "Болей", count: painPoints.length, active: painPoints.filter(p => p.impact_level === "critical" || p.impact_level === "high").length, icon: "Flame", color: "text-red-600 bg-red-50" },
                { label: "Инициатив", count: initiatives.length, active: initiatives.filter(i => i.status === "pilot" || i.status === "implementation").length, icon: "Rocket", color: "text-violet-600 bg-violet-50" },
                { label: "Файлов", count: docs.length, active: docs.filter(d => d.status === "ready").length, icon: "FileText", color: "text-blue-600 bg-blue-50" },
              ].map(c => (
                <div key={c.label} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.color}`}>
                    <Icon name={c.icon} size={18} />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-900">{c.count}</p>
                    <p className="text-xs text-slate-500">{c.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── AI Operator ── */}
            {(() => {
              const status  = aiData?.ai_status ?? "idle";
              const stage   = aiData?.ai_stage ?? null;
              const result  = aiData?.ai_last_result_json ?? null;
              const isStale = aiData?.ai_is_stale ?? false;
              const isRunning = isActive(status);
              const stageLabel = (stage && AI_STAGE_LABELS[stage]) || "ИИ анализирует кейс...";

              return (
                <div className="bg-gradient-to-br from-slate-900 to-violet-950 rounded-2xl p-5 text-white">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-violet-500/30 flex items-center justify-center">
                        <Icon name="BrainCircuit" size={15} className="text-violet-300" />
                      </div>
                      <span className="font-semibold text-sm">AI Оператор</span>
                      {isRunning && (
                        <span className="flex items-center gap-1 text-[10px] text-violet-300">
                          <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
                          {stageLabel}
                        </span>
                      )}
                      {!isRunning && status === "ready" && !isStale && (
                        <span className="text-[10px] text-green-400">готово</span>
                      )}
                      {!isRunning && isStale && result && (
                        <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">данные обновились</span>
                      )}
                    </div>
                    <button
                      disabled={isRunning || aiLoading}
                      onClick={runAiAnalysis}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg text-xs font-semibold transition-colors"
                    >
                      {isRunning
                        ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Анализирую...</>
                        : <><Icon name="Sparkles" size={12} /> {result ? "Обновить" : "Запустить анализ"}</>}
                    </button>
                  </div>

                  {/* Plashka: файлы ещё обрабатываются */}
                  {aiData?.has_pending_files && !isRunning && (
                    <div className="mb-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      <p className="text-xs text-blue-300">
                        Обрабатываю {aiData.pending_files_count === 1 ? "документ" : `${aiData.pending_files_count} документа`} — AI запустится автоматически после извлечения текста
                      </p>
                    </div>
                  )}

                  {/* Plashka: polling timeout */}
                  {pollTimeout && (
                    <div className="mb-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
                      <Icon name="Clock" size={13} className="text-amber-400 flex-shrink-0" />
                      <p className="text-xs text-amber-300">Анализ занимает больше времени обычного. Можно подождать или запустить повторно.</p>
                    </div>
                  )}

                  {/* Plashka: stale — данные обновились поверх результата */}
                  {isStale && result && !isRunning && (
                    <div className="mb-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
                      <Icon name="RefreshCw" size={13} className="text-amber-400 flex-shrink-0 animate-spin" />
                      <p className="text-xs text-amber-300">В кейсе появились новые данные — запускаю обновлённый анализ</p>
                    </div>
                  )}

                  {/* Состояние 1: пустой кейс (idle, нет результата, кейс пуст) */}
                  {status === "idle" && !result && !aiLoading && (
                    <div className="text-center py-5">
                      <Icon name="PackageOpen" size={28} className="text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">Добавьте описание, процесс или боли — AI начнёт анализ автоматически</p>
                    </div>
                  )}

                  {/* Состояние 2: идёт анализ — skeleton + подпись этапа */}
                  {isRunning && !result && (
                    <div className="space-y-3 animate-pulse">
                      <div className="flex gap-3">
                        <div className="flex-1 bg-white/5 rounded-xl h-20" />
                        <div className="w-20 bg-white/5 rounded-xl h-20" />
                      </div>
                      <div className="bg-white/5 rounded-xl h-12" />
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/5 rounded-xl h-24" />
                        <div className="bg-white/5 rounded-xl h-24" />
                      </div>
                      <p className="text-xs text-slate-500 text-center">{stageLabel}</p>
                    </div>
                  )}

                  {/* Состояние 3: ошибка без результата */}
                  {status === "failed" && !result && (
                    <div className="text-center py-4">
                      <Icon name="AlertCircle" size={24} className="text-red-400 mx-auto mb-2" />
                      {aiData?.ai_last_error && <p className="text-xs text-slate-500 mb-2">{aiData.ai_last_error}</p>}
                      <p className="text-sm text-slate-400 mb-3">Не удалось завершить анализ</p>
                      <button onClick={runAiAnalysis} className="text-xs text-violet-400 hover:text-violet-300 underline">Повторить</button>
                    </div>
                  )}

                  {/* Состояния 4 и 5: есть результат (ready / stale / running поверх старого) */}
                  {result && (
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <div className="flex-1 bg-white/5 rounded-xl p-3">
                          <p className="text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Суть кейса</p>
                          <p className="text-sm text-slate-200 leading-relaxed">{result.summary}</p>
                        </div>
                        <div className="flex-shrink-0 w-20 bg-white/5 rounded-xl p-3 flex flex-col items-center justify-center">
                          <p className="text-2xl font-bold text-white">{result.readiness_score}<span className="text-sm text-slate-400">/10</span></p>
                          <p className="text-[10px] text-slate-400 text-center mt-0.5">готовность</p>
                        </div>
                      </div>

                      {result.key_insight && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                          <p className="text-xs text-amber-400 font-semibold mb-1">💡 Ключевой инсайт</p>
                          <p className="text-sm text-amber-100">{result.key_insight}</p>
                        </div>
                      )}

                      <div className={`rounded-xl p-3 ${result.ai_verdict === "AI рекомендован" ? "bg-green-500/10 border border-green-500/20" : result.ai_verdict?.includes("Сначала") ? "bg-orange-500/10 border border-orange-500/20" : "bg-blue-500/10 border border-blue-500/20"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Icon name={result.ai_verdict === "AI рекомендован" ? "CheckCircle" : "Info"} size={13} className={result.ai_verdict === "AI рекомендован" ? "text-green-400" : "text-blue-400"} />
                          <p className="text-xs font-bold text-white">{result.ai_verdict}</p>
                        </div>
                        {result.ai_verdict_reason && <p className="text-xs text-slate-300">{result.ai_verdict_reason}</p>}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {result.quick_wins?.length > 0 && (
                          <div className="bg-white/5 rounded-xl p-3">
                            <p className="text-[10px] text-green-400 font-bold uppercase tracking-wide mb-2">✓ Quick wins</p>
                            <ul className="space-y-1">{result.quick_wins.map((w, i) => <li key={i} className="text-xs text-slate-300 flex gap-1.5"><span className="text-green-400 flex-shrink-0">•</span>{w}</li>)}</ul>
                          </div>
                        )}
                        {result.gaps?.length > 0 && (
                          <div className="bg-white/5 rounded-xl p-3">
                            <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wide mb-2">⚠ Пробелы</p>
                            <ul className="space-y-1">{result.gaps.map((g, i) => <li key={i} className="text-xs text-slate-300 flex gap-1.5"><span className="text-orange-400 flex-shrink-0">•</span>{g}</li>)}</ul>
                          </div>
                        )}
                      </div>

                      {result.next_action && (
                        <div className="bg-violet-600/30 border border-violet-500/30 rounded-xl px-4 py-3">
                          <p className="text-[10px] text-violet-300 font-bold uppercase tracking-wide mb-1">→ Следующее действие</p>
                          <p className="text-sm text-white font-medium">{result.next_action}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Контекст пространства */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-slate-800 flex items-center justify-center">
                    <Icon name="Map" size={14} className="text-white" />
                  </div>
                  <span className="font-semibold text-slate-900">Контекст пространства</span>
                </div>
                <button onClick={() => setWsContextEdit(!wsContextEdit)} className="text-xs text-violet-600 hover:text-violet-800 font-medium">
                  {wsContextEdit ? "Отмена" : "Редактировать"}
                </button>
              </div>
              {wsContextEdit ? (
                <div className="space-y-3">
                  {[
                    { key: "goals_text",        label: "Цели и задачи пространства",       placeholder: "Чего хотим достичь в этом проекте?" },
                    { key: "constraints_text",   label: "Ограничения",                      placeholder: "Что нельзя, какие ресурсы, сроки..." },
                    { key: "key_facts_text",     label: "Ключевые факты / контекст",        placeholder: "Важные вещи, которые AI должен знать..." },
                    { key: "stakeholders_text",  label: "Стейкхолдеры",                     placeholder: "Кто вовлечён, кто принимает решения..." },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{f.label}</label>
                      <textarea
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                        rows={2}
                        placeholder={f.placeholder}
                        value={wsContextDraft[f.key as keyof typeof wsContextDraft]}
                        onChange={e => setWsContextDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <button onClick={handleSaveContext} className="w-full py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors">
                    Сохранить контекст
                  </button>
                </div>
              ) : wsContext && (wsContext.goals_text || wsContext.key_facts_text || wsContext.constraints_text) ? (
                <div className="space-y-3">
                  {wsContext.goals_text && <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Цели</p><p className="text-sm text-slate-700 leading-relaxed">{wsContext.goals_text}</p></div>}
                  {wsContext.constraints_text && <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Ограничения</p><p className="text-sm text-slate-700 leading-relaxed">{wsContext.constraints_text}</p></div>}
                  {wsContext.key_facts_text && <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Ключевые факты</p><p className="text-sm text-slate-700 leading-relaxed">{wsContext.key_facts_text}</p></div>}
                  {wsContext.stakeholders_text && <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Стейкхолдеры</p><p className="text-sm text-slate-700 leading-relaxed">{wsContext.stakeholders_text}</p></div>}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm text-slate-400 mb-3">Добавь контекст — AI будет использовать его в каждом ответе</p>
                  <button onClick={() => setWsContextEdit(true)} className="text-sm text-violet-600 font-medium hover:text-violet-800">Добавить контекст</button>
                </div>
              )}
            </div>

            {/* Открытые гипотезы */}
            {hypotheses.filter(h => h.status === "open" || h.status === "testing").length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="Lightbulb" size={15} className="text-amber-600" />
                  <span className="text-sm font-semibold text-slate-800">Активные гипотезы</span>
                </div>
                <div className="space-y-2">
                  {hypotheses.filter(h => h.status === "open" || h.status === "testing").slice(0, 3).map(h => (
                    <div key={h.id} onClick={() => { setOpenHyp(h); setTab("hypotheses"); }} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-amber-100 cursor-pointer hover:border-amber-300 transition-colors">
                      <span className="text-sm text-slate-700 font-medium leading-snug">{h.title}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${h.status === "testing" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{h.status === "testing" ? "проверяется" : "открыта"}</span>
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
          <div className="space-y-4">
            {/* Режим */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">Режим AI</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "analyst",    label: "🔍 Аналитик",   desc: "анализ, gap, summary" },
                  { key: "strategist", label: "🎯 Стратег",    desc: "гипотезы, roadmap" },
                  { key: "pm",         label: "📋 PM",         desc: "задачи, план, критерии" },
                  { key: "researcher", label: "🔬 Исследователь", desc: "обзоры, сравнения" },
                ].map(m => (
                  <button key={m.key} onClick={() => setCopilotMode(m.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${copilotMode === m.key ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
                    {m.label}
                    <span className="text-[10px] opacity-60">{m.desc}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <input type="checkbox" id="ws-save" checked={copilotSave} onChange={e => setCopilotSave(e.target.checked)} className="w-4 h-4 rounded" />
                <label htmlFor="ws-save" className="text-xs text-slate-600 cursor-pointer">Сохранять ответы как артефакты</label>
              </div>
            </div>

            {/* История */}
            <div className="space-y-3 min-h-[200px]">
              {copilotHistory.length === 0 && (
                <div className="bg-gradient-to-br from-slate-50 to-violet-50 border border-slate-200 rounded-2xl p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto">
                    <Icon name="Sparkles" size={22} className="text-violet-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">AI Copilot знает контекст проекта</p>
                    <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Он читает твои файлы, гипотезы и контекст пространства — не нужно вставлять всё в промпт вручную</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    {["Проанализируй текущие гипотезы", "Сделай summary по файлам", "Предложи следующие шаги"].map(s => (
                      <button key={s} onClick={() => setCopilotMsg(s)} className="text-xs px-3 py-1.5 bg-white border border-violet-200 text-violet-700 rounded-full hover:bg-violet-50 transition-colors">{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {copilotHistory.map((h, i) => {
                const isLast = i === copilotHistory.length - 1;
                const nextHints: Record<string, string[]> = {
                  analyst:    ["Найди слабые места в анализе", "Сравни с лучшими практиками", "Сделай executive summary"],
                  strategist: ["Оформи как гипотезу", "Предложи метрики успеха", "Составь roadmap на 3 месяца"],
                  pm:         ["Разбей на задачи с дедлайнами", "Определи риски", "Кто отвечает за каждый шаг?"],
                  researcher: ["Найди контраргументы", "Какие источники подтверждают?", "Сравни с аналогами на рынке"],
                };
                const hints = nextHints[copilotMode] ?? ["Углуби анализ", "Предложи следующие шаги", "Сохрани как артефакт"];
                return (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-end">
                      <div className="bg-slate-800 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm">{h.q}</div>
                    </div>
                    <div className="flex gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon name="Sparkles" size={13} className="text-violet-600" />
                      </div>
                      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex-1">
                        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{h.a}</p>
                        {h.artifact_id && (
                          <button onClick={() => handleOpenArtifact(h.artifact_id!)} className="mt-2 flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800 font-medium">
                            <Icon name="Package" size={11} />
                            Сохранён как артефакт
                          </button>
                        )}
                      </div>
                    </div>
                    {isLast && !copilotLoading && (
                      <div className="flex flex-wrap gap-1.5 pl-9 pt-0.5">
                        {hints.map(hint => (
                          <button key={hint} onClick={() => setCopilotMsg(hint)}
                            className="text-[11px] px-2.5 py-1 bg-violet-50 border border-violet-100 text-violet-600 rounded-full hover:bg-violet-100 transition-colors">
                            {hint}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {copilotLoading && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <Icon name="Sparkles" size={13} className="text-violet-600" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-slate-500">AI анализирует проект...</span>
                  </div>
                </div>
              )}
              <div ref={copilotEndRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2 bg-white border border-slate-200 rounded-2xl p-3">
              <textarea
                className="flex-1 text-sm resize-none focus:outline-none min-h-[44px] max-h-[120px] text-slate-800"
                placeholder="Что нужно проанализировать, исследовать или подготовить?"
                value={copilotMsg}
                onChange={e => setCopilotMsg(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleCopilot(); } }}
              />
              <button onClick={handleCopilot} disabled={!copilotMsg.trim() || copilotLoading}
                className="self-end flex items-center justify-center w-10 h-10 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-xl transition-colors flex-shrink-0">
                <Icon name="Send" size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Гипотезы ── */}
        {tab === "hypotheses" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Гипотезы и эксперименты</p>
              <button onClick={() => setHypForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 transition-colors">
                <Icon name="Plus" size={12} />
                Новая гипотеза
              </button>
            </div>

            {hypForm && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">Новая гипотеза</p>
                {[
                  { key: "title", label: "Формулировка *", placeholder: "Если мы сделаем X, то Y увеличится на Z%", required: true },
                  { key: "statement", label: "Детальное описание", placeholder: "Почему мы так думаем?" },
                  { key: "assumptions", label: "Предпосылки", placeholder: "Что должно быть верным для этой гипотезы?" },
                  { key: "success_criteria", label: "Критерии успеха", placeholder: "Как поймём, что гипотеза подтвердилась?" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{f.label}</label>
                    <input className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder={f.placeholder}
                      value={hypDraft[f.key as keyof typeof hypDraft]}
                      onChange={e => setHypDraft(prev => ({ ...prev, [f.key]: e.target.value }))} />
                  </div>
                ))}
                <div className="flex gap-2">
                  <select className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm" value={hypDraft.priority} onChange={e => setHypDraft(prev => ({ ...prev, priority: e.target.value }))}>
                    <option value="high">🔴 Высокий приоритет</option>
                    <option value="medium">🟡 Средний</option>
                    <option value="low">🟢 Низкий</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setHypForm(false)} className="flex-1 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Отмена</button>
                  <button onClick={handleCreateHypothesis} disabled={!hypDraft.title.trim()} className="flex-1 py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 disabled:opacity-50">Создать</button>
                </div>
              </div>
            )}

            {hypotheses.length === 0 && !hypForm ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Icon name="Lightbulb" size={28} className="text-amber-400 mx-auto mb-3" />
                <p className="font-semibold text-slate-700 mb-1">Нет гипотез</p>
                <p className="text-sm text-slate-400 mb-4">Добавь гипотезы для проверки — AI поможет их проанализировать</p>
                <button onClick={() => setHypForm(true)} className="text-sm text-violet-600 font-medium hover:text-violet-800">Добавить первую гипотезу</button>
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { status: "open",      label: "Открытые",       color: "border-amber-200 bg-amber-50" },
                  { status: "testing",   label: "Проверяются",    color: "border-blue-200 bg-blue-50" },
                  { status: "confirmed", label: "Подтверждены",   color: "border-emerald-200 bg-emerald-50" },
                  { status: "rejected",  label: "Отклонены",      color: "border-slate-200 bg-slate-50" },
                ].map(group => {
                  const grouped = hypotheses.filter(h => h.status === group.status);
                  if (!grouped.length) return null;
                  return (
                    <div key={group.status}>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{group.label} ({grouped.length})</p>
                      <div className="space-y-2">
                        {grouped.map(h => (
                          <div key={h.id} className={`rounded-2xl border p-4 space-y-2 ${group.color}`}>
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-800 leading-snug flex-1">{h.title}</p>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${h.priority === "high" ? "bg-red-100 text-red-700" : h.priority === "low" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                                {h.priority === "high" ? "HIGH" : h.priority === "low" ? "LOW" : "MED"}
                              </span>
                            </div>
                            {h.statement && <p className="text-xs text-slate-600 leading-snug">{h.statement}</p>}
                            {h.success_criteria && <p className="text-[11px] text-slate-500"><span className="font-semibold">Критерий:</span> {h.success_criteria}</p>}
                            {h.conclusion && <p className="text-[11px] text-emerald-700 font-medium"><span className="font-semibold">Вывод:</span> {h.conclusion}</p>}
                            {/* Статусные кнопки */}
                            <div className="flex gap-1 pt-1 flex-wrap">
                              {h.status !== "open"      && <button onClick={() => handleHypStatus(h.id, "open")}      className="text-[10px] px-2 py-0.5 bg-white border border-slate-200 rounded-full hover:bg-slate-50 text-slate-600">→ открыта</button>}
                              {h.status !== "testing"   && <button onClick={() => handleHypStatus(h.id, "testing")}   className="text-[10px] px-2 py-0.5 bg-white border border-blue-200 rounded-full hover:bg-blue-50 text-blue-600">→ проверяется</button>}
                              {h.status !== "confirmed" && <button onClick={() => handleHypStatus(h.id, "confirmed")} className="text-[10px] px-2 py-0.5 bg-white border border-emerald-200 rounded-full hover:bg-emerald-50 text-emerald-600">→ подтверждена</button>}
                              {h.status !== "rejected"  && <button onClick={() => handleHypStatus(h.id, "rejected")}  className="text-[10px] px-2 py-0.5 bg-white border border-red-200 rounded-full hover:bg-red-50 text-red-600">→ отклонена</button>}
                              <button onClick={() => { setCopilotMsg(`Проанализируй гипотезу: "${h.title}". ${h.statement}`); setTab("copilot"); }}
                                className="text-[10px] px-2 py-0.5 bg-violet-600 text-white rounded-full hover:bg-violet-700">🤖 спросить AI</button>
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
        )}

        {/* ── Артефакты ── */}
        {tab === "artifacts" && (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Артефакты — результаты AI-работы в этом пространстве</p>
            {artifacts.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Icon name="Package" size={28} className="text-violet-400 mx-auto mb-3" />
                <p className="font-semibold text-slate-700 mb-1">Артефактов пока нет</p>
                <p className="text-sm text-slate-400 mb-4">Включи «Сохранять как артефакт» в AI Copilot — ответы будут сохраняться здесь</p>
                <button onClick={() => setTab("copilot")} className="text-sm text-violet-600 font-medium hover:text-violet-800">Открыть Copilot</button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {artifacts.map(a => (
                  <div key={a.id} onClick={() => handleOpenArtifact(a.id)}
                    className="bg-white border border-slate-200 rounded-2xl p-4 cursor-pointer hover:border-violet-300 hover:shadow-sm transition-all space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 leading-snug flex-1">{a.title}</p>
                      <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full flex-shrink-0">{a.artifact_type}</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-snug line-clamp-2">{a.summary}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <Icon name="Sparkles" size={9} />
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
              <div className="space-y-4">
                {/* Empty state — дружелюбный с карточками */}
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center mb-2">
                  <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
                    <Icon name="Sparkles" size={26} className="text-orange-400" />
                  </div>
                  <p className="font-semibold text-foreground text-lg mb-1">Заданий пока нет</p>
                  <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
                    Создайте первое задание — AI прочитает ваши материалы и подготовит результат
                  </p>
                  <Link
                    to={`/cabinet/project/${projectId}/new-task`}
                    className="inline-flex items-center gap-2 bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-700 transition-colors"
                  >
                    <Icon name="Plus" size={15} />
                    Создать первое задание
                  </Link>
                </div>

                {/* Карточки быстрых сценариев */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Что можно сделать</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    {
                      emoji: "✨", title: "Создать презентацию",
                      desc: "AI соберёт PPTX из ваших документов по теме",
                      color: "border-orange-200 bg-orange-50/50 hover:border-orange-300",
                      link: `/cabinet/project/${projectId}/new-task`,
                    },
                    {
                      emoji: "🛡", title: "Проверить готовую презентацию",
                      desc: "Загрузите PPTX — AI найдёт ошибки и даст правки",
                      color: "border-blue-200 bg-blue-50/50 hover:border-blue-300",
                      link: `/cabinet/project/${projectId}/audit`,
                    },
                    {
                      emoji: "📝", title: "Подготовить доклад или анализ",
                      desc: "AI напишет текст, ответит на вопрос или составит план",
                      color: "border-green-200 bg-green-50/50 hover:border-green-300",
                      link: `/cabinet/project/${projectId}/new-task`,
                    },
                    {
                      emoji: "🔍", title: "Найти в материалах",
                      desc: "Умный поиск по всем загруженным документам проекта",
                      color: "border-slate-200 bg-slate-50/50 hover:border-slate-300",
                      link: `/cabinet/project/${projectId}/search`,
                    },
                  ].map((s) => (
                    <Link key={s.title} to={s.link}
                      className={`flex items-start gap-3 border rounded-xl p-4 transition-all ${s.color}`}>
                      <span className="text-xl flex-shrink-0">{s.emoji}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{s.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{s.desc}</p>
                      </div>
                      <Icon name="ChevronRight" size={14} className="text-slate-400 ml-auto flex-shrink-0 mt-0.5" />
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <>
              {/* Quick action bar — когда уже есть задания */}
              <div className="flex flex-wrap gap-2 mb-1 pb-4 border-b border-slate-100">
                {[
                  { emoji: "✨", label: "Новое задание", link: `/cabinet/project/${projectId}/new-task`, cls: "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100" },
                  { emoji: "🛡", label: "Аудит PPTX", link: `/cabinet/project/${projectId}/audit`, cls: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100" },
                  { emoji: "🔍", label: "Поиск по материалам", link: `/cabinet/project/${projectId}/search`, cls: "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100" },
                ].map((a) => (
                  <Link key={a.label} to={a.link}
                    className={`inline-flex items-center gap-1.5 border text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${a.cls}`}>
                    <span>{a.emoji}</span>{a.label}
                  </Link>
                ))}
              </div>
              {tasks.map((t) => (
                <Link
                  key={t.id}
                  to={`/cabinet/project/${projectId}/task/${t.id}`}
                  className="flex items-center gap-4 border rounded-xl p-4 bg-card hover:border-orange-300 hover:shadow-sm transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center flex-shrink-0">
                    <Icon name="Sparkles" size={18} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium group-hover:text-orange-600 transition-colors">{t.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {TASK_TYPE_LABELS[t.task_type] || t.task_type}
                      {t.topic && ` · ${t.topic}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-xs px-2 py-1 rounded-full mb-1 inline-block ${
                      t.versions > 0
                        ? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {t.versions > 0 ? `${t.versions} версий` : "Не запущено"}
                    </div>
                    <p className="text-xs text-muted-foreground">{t.created_by}</p>
                  </div>
                </Link>
              ))}
              </>
            )}
          </div>
        )}

        {tab === "docs" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <Icon name="Upload" size={22} className="text-slate-600" />
              </div>
              <p className="font-medium mb-1">Загрузить материал</p>
              <p className="text-sm text-muted-foreground mb-4">PDF, DOCX или PPTX — до 100 МБ</p>

              <div className="max-w-xs mx-auto mb-4 text-left">
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Тип материала</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.pptx"
                  onChange={handleUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className={`inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <Icon name="Upload" size={14} />
                  {uploading ? "Загружаю..." : "Документ"}
                </label>

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleMediaUpload(e, "image")}
                  className="hidden"
                  id="photo-upload"
                />
                <label
                  htmlFor="photo-upload"
                  className={`inline-flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <Icon name="Camera" size={14} />
                  Фото (OCR)
                </label>

                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => handleMediaUpload(e, "audio")}
                  className="hidden"
                  id="audio-upload"
                />
                <label
                  htmlFor="audio-upload"
                  className={`inline-flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <Icon name="Mic" size={14} />
                  Аудио
                </label>
              </div>
              <p className="text-xs text-slate-500 mt-3">Фото — распознаётся текст с доски / тетради. Аудио (OGG до 1 МБ) — расшифровывается лекция.</p>
              {uploading && uploadProgress > 0 && (
                <div className="mt-3 max-w-xs mx-auto">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Загружаю...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5">
                    <div className="bg-slate-800 h-1.5 rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
              {uploadError && <p className="text-red-500 text-sm mt-2">{uploadError}</p>}
            </div>

            {docs.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">Материалов пока нет</p>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => {
                  const cat = CATEGORIES.find((c) => c.value === doc.category) || CATEGORIES[CATEGORIES.length - 1];
                  const mediaIcon = doc.media_type === "image" ? "Camera" : doc.media_type === "audio" ? "Mic" : cat.icon;
                  const mediaLabel = doc.media_type === "image" ? "Фото" : doc.media_type === "audio" ? "Аудио" : cat.label;
                  return (
                    <div key={doc.id} className="relative flex items-center gap-3 border border-slate-200 rounded-xl p-3.5 bg-card">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cat.color}`}>
                        <Icon name={mediaIcon} size={16} fallback="FileText" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">{mediaLabel}</span>
                          {" · "}{doc.file_type.toUpperCase()}
                          {" · "}{formatSize(doc.file_size)}
                          {doc.page_count ? ` · ${doc.page_count} стр.` : ""}
                          {" · "}{doc.uploaded_by}
                        </p>
                      </div>
                      <button
                        onClick={() => handleOpenDoc(doc.id)}
                        title="Открыть"
                        className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <Icon name="Eye" size={13} />
                        <span className="hidden sm:inline">Открыть</span>
                      </button>
                      <Link
                        to={`/cabinet/project/${projectId}/document/${doc.id}`}
                        className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
                        title="Чат с документом"
                      >
                        <Icon name="MessageCircle" size={13} />
                        <span className="hidden sm:inline">Спросить</span>
                      </Link>
                      <button
                        onClick={() => setMenuDocId(menuDocId === doc.id ? null : doc.id)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                        title="Действия"
                      >
                        <Icon name="MoreVertical" size={16} />
                      </button>
                      {menuDocId === doc.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuDocId(null)} />
                          <div className="absolute right-2 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-48">
                            <button
                              onClick={() => { setMenuDocId(null); setRenamingDoc({ id: doc.id, name: doc.name }); setRenameValue(doc.name); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                            >
                              <Icon name="Pencil" size={14} />
                              Переименовать
                            </button>
                            <button
                              onClick={() => { setMenuDocId(null); handleOpenDoc(doc.id); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                            >
                              <Icon name="Download" size={14} />
                              Скачать оригинал
                            </button>
                            <div className="border-t border-slate-100 my-1" />
                            <button
                              onClick={() => { setMenuDocId(null); setConfirmDelete({ id: doc.id, name: doc.name }); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
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
          <div className="space-y-6">
            <div className="space-y-2">
              {project.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 border rounded-xl p-3.5 bg-card">
                  <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center flex-shrink-0">
                    <Icon name="User" size={16} className="text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    m.role === "owner"
                      ? "bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {m.role === "owner" ? "Владелец" : "Участник"}
                  </span>
                </div>
              ))}
            </div>

            {project.my_role === "owner" && (
              <div>
                {!showInvite ? (
                  <button
                    onClick={() => setShowInvite(true)}
                    className="flex items-center gap-2 border rounded-xl p-3.5 w-full text-sm text-muted-foreground hover:text-foreground hover:border-orange-300 transition-colors"
                  >
                    <Icon name="UserPlus" size={16} />
                    Пригласить участника по email
                  </button>
                ) : (
                  <form onSubmit={handleInvite} className="border rounded-xl p-4 space-y-3">
                    <p className="text-sm font-medium">Пригласить по email</p>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white]"
                    />
                    {inviteMsg && (
                      <p className={`text-sm ${inviteMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
                        {inviteMsg}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setShowInvite(false); setInviteMsg(""); }}
                        className="flex-1 border rounded-lg py-2 text-sm hover:bg-muted transition-colors">
                        Отмена
                      </button>
                      <button type="submit"
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">
                        Пригласить
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {project.activity.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-3 text-muted-foreground">История активности</p>
                <div className="space-y-2">
                  {project.activity.slice(0, 10).map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                      <span>
                        <span className="font-medium">{a.user_name}</span>{" "}
                        <span className="text-muted-foreground">{ACTION_LABELS[a.action] || a.action}</span>
                        {a.details && <span className="text-muted-foreground"> «{a.details}»</span>}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Опишите процессы as-is: шаги, роли, системы, контроли</p>
              <button onClick={() => setShowProcessForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700">
                <Icon name="Plus" size={13} /> Добавить процесс
              </button>
            </div>
            {showProcessForm && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">Новый процесс</p>
                <input placeholder="Название процесса" value={processDraft.title} onChange={e => setProcessDraft(d => ({ ...d, title: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                <input placeholder="Подразделение-владелец" value={processDraft.department} onChange={e => setProcessDraft(d => ({ ...d, department: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                <textarea placeholder="Краткое описание / цель процесса" rows={2} value={processDraft.description} onChange={e => setProcessDraft(d => ({ ...d, description: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => setShowProcessForm(false)} className="flex-1 border border-slate-200 rounded-lg py-2 text-sm hover:bg-slate-50">Отмена</button>
                  <button disabled={!processDraft.title.trim() || wbLoading} onClick={async () => {
                    setWbLoading(true);
                    await workspaceApi.createProcess({ project_id: projectId, ...processDraft });
                    setProcessDraft({ title: "", description: "", owner_name: "", department: "" });
                    setShowProcessForm(false);
                    workspaceApi.getProcesses(projectId).then((d: { processes: Process[] }) => setProcesses(d.processes || [])).catch(() => {});
                    setWbLoading(false);
                  }} className="flex-1 bg-slate-800 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                    {wbLoading ? "Сохраняю..." : "Создать"}
                  </button>
                </div>
              </div>
            )}
            {processes.length === 0 && !showProcessForm && (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
                <Icon name="Workflow" size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm mb-1">Процессов пока нет</p>
                <p className="text-xs text-slate-400">Добавьте as-is описание процесса — шаги, роли, системы, боли</p>
              </div>
            )}
            {processes.map(proc => (
              <div key={proc.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50" onClick={() => setExpandedProcess(expandedProcess === proc.id ? null : proc.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 text-sm">{proc.title}</p>
                      {proc.department && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{proc.department}</span>}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${proc.ai_potential === 'high' ? 'bg-violet-100 text-violet-700' : proc.ai_potential === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                        AI: {proc.ai_potential === 'high' ? 'высокий' : proc.ai_potential === 'medium' ? 'средний' : proc.ai_potential === 'low' ? 'низкий' : 'не оценён'}
                      </span>
                    </div>
                    {proc.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{proc.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-xs text-slate-400">{proc.step_count} шагов</span>
                    <Icon name={expandedProcess === proc.id ? "ChevronUp" : "ChevronDown"} size={16} className="text-slate-400" />
                  </div>
                </div>
                {expandedProcess === proc.id && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
                    {proc.steps.map((step, idx) => (
                      <div key={step.id} className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">{idx + 1}</div>
                        <div className="flex-1 bg-slate-50 rounded-xl p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-slate-800">{step.title}</p>
                            <div className="flex gap-1 flex-shrink-0">
                              {step.is_manual && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold">ручной</span>}
                              {step.ai_potential !== 'none' && <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-semibold">AI: {step.ai_potential}</span>}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                            {step.role_name && <span className="text-xs text-slate-500">👤 {step.role_name}</span>}
                            {step.system_name && <span className="text-xs text-slate-500">🖥 {step.system_name}</span>}
                            {step.duration_minutes && <span className="text-xs text-slate-500">⏱ {step.duration_minutes} мин</span>}
                          </div>
                          {step.pain_point && <p className="text-xs text-red-600 mt-1">🔥 {step.pain_point}</p>}
                          {step.control_point && <p className="text-xs text-blue-600 mt-0.5">🔒 {step.control_point}</p>}
                        </div>
                      </div>
                    ))}
                    {showStepForm === proc.id ? (
                      <div className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-200">
                        <p className="text-xs font-semibold text-slate-700">Новый шаг</p>
                        <input placeholder="Название шага" value={stepDraft[proc.id]?.title || ""} onChange={e => setStepDraft(d => ({ ...d, [proc.id]: { ...d[proc.id], title: e.target.value } }))} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400" />
                        <div className="grid grid-cols-2 gap-2">
                          <input placeholder="Роль / исполнитель" value={stepDraft[proc.id]?.role_name || ""} onChange={e => setStepDraft(d => ({ ...d, [proc.id]: { ...d[proc.id], role_name: e.target.value } }))} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                          <input placeholder="Система / инструмент" value={stepDraft[proc.id]?.system_name || ""} onChange={e => setStepDraft(d => ({ ...d, [proc.id]: { ...d[proc.id], system_name: e.target.value } }))} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" />
                        </div>
                        <input placeholder="Боль / проблема на этом шаге" value={stepDraft[proc.id]?.pain_point || ""} onChange={e => setStepDraft(d => ({ ...d, [proc.id]: { ...d[proc.id], pain_point: e.target.value } }))} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none text-red-700 placeholder:text-red-300" />
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={stepDraft[proc.id]?.is_manual ?? true} onChange={e => setStepDraft(d => ({ ...d, [proc.id]: { ...d[proc.id], is_manual: e.target.checked } }))} />
                            Ручной
                          </label>
                          <select value={stepDraft[proc.id]?.ai_potential || "none"} onChange={e => setStepDraft(d => ({ ...d, [proc.id]: { ...d[proc.id], ai_potential: e.target.value } }))} className="border border-slate-200 rounded px-1.5 py-1 text-xs">
                            <option value="none">AI: нет</option>
                            <option value="low">AI: низкий</option>
                            <option value="medium">AI: средний</option>
                            <option value="high">AI: высокий</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setShowStepForm(null)} className="flex-1 border border-slate-200 rounded-lg py-1.5 text-xs hover:bg-slate-100">Отмена</button>
                          <button disabled={!stepDraft[proc.id]?.title?.trim() || wbLoading} onClick={async () => {
                            const s = stepDraft[proc.id] || {};
                            setWbLoading(true);
                            await workspaceApi.createProcessStep({ process_id: proc.id, project_id: projectId, ...s });
                            setShowStepForm(null);
                            workspaceApi.getProcesses(projectId).then((d: { processes: Process[] }) => setProcesses(d.processes || [])).catch(() => {});
                            setWbLoading(false);
                          }} className="flex-1 bg-slate-800 text-white rounded-lg py-1.5 text-xs font-semibold disabled:opacity-50">
                            {wbLoading ? "..." : "Добавить"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowStepForm(proc.id)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors pl-9">
                        <Icon name="Plus" size={12} /> Добавить шаг
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Боли ── */}
        {tab === "pains" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Фиксируйте ручной труд, дублирование, задержки, контрольные разрывы</p>
              <button onClick={() => setShowPainForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700">
                <Icon name="Plus" size={13} /> Добавить боль
              </button>
            </div>
            {/* AI-экстракция болей */}
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-violet-800 mb-2">🧠 Извлечь боли с помощью AI</p>
              <textarea placeholder="Опишите ситуацию или процесс — AI выделит боли и проблемы..." rows={3} value={aiExtractText} onChange={e => setAiExtractText(e.target.value)} className="w-full border border-violet-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none mb-2" />
              <button disabled={!aiExtractText.trim() || aiExtractLoading} onClick={async () => {
                setAiExtractLoading(true);
                try {
                  const res = await workspaceApi.aiExtractPains(projectId, aiExtractText) as { pains: PainPoint[] };
                  for (const p of res.pains || []) {
                    await workspaceApi.createPainPoint({ project_id: projectId, ...p });
                  }
                  setAiExtractText("");
                  workspaceApi.getPainPoints(projectId).then((d: { pain_points: PainPoint[] }) => setPainPoints(d.pain_points || [])).catch(() => {});
                } finally { setAiExtractLoading(false); }
              }} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-50">
                {aiExtractLoading ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Анализирую...</> : <><Icon name="Sparkles" size={12} /> Извлечь боли</>}
              </button>
            </div>
            {showPainForm && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">Новая боль / узкое место</p>
                <textarea placeholder="Опишите конкретную боль" rows={2} value={painDraft.description} onChange={e => setPainDraft(d => ({ ...d, description: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Тип</p>
                    <select value={painDraft.pain_type} onChange={e => setPainDraft(d => ({ ...d, pain_type: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                      <option value="manual_work">Ручной труд</option>
                      <option value="duplication">Дублирование</option>
                      <option value="delay">Задержки</option>
                      <option value="lack_of_visibility">Нет прозрачности</option>
                      <option value="control_gap">Контрольный разрыв</option>
                      <option value="data_quality">Качество данных</option>
                      <option value="error_rate">Ошибки</option>
                      <option value="compliance_burden">Регуляторная нагрузка</option>
                    </select>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Влияние</p>
                    <select value={painDraft.impact_level} onChange={e => setPainDraft(d => ({ ...d, impact_level: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                      <option value="critical">Критическое</option>
                      <option value="high">Высокое</option>
                      <option value="medium">Среднее</option>
                      <option value="low">Низкое</option>
                    </select>
                  </div>
                </div>
                <input placeholder="Частота (ежедневно, еженедельно...)" value={painDraft.frequency} onChange={e => setPainDraft(d => ({ ...d, frequency: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                <input placeholder="Корневая причина (опционально)" value={painDraft.root_cause} onChange={e => setPainDraft(d => ({ ...d, root_cause: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                <div className="flex gap-2">
                  <button onClick={() => setShowPainForm(false)} className="flex-1 border border-slate-200 rounded-lg py-2 text-sm hover:bg-slate-50">Отмена</button>
                  <button disabled={!painDraft.description.trim() || wbLoading} onClick={async () => {
                    setWbLoading(true);
                    await workspaceApi.createPainPoint({ project_id: projectId, ...painDraft });
                    setPainDraft({ description: "", pain_type: "manual_work", impact_level: "medium", frequency: "", root_cause: "" });
                    setShowPainForm(false);
                    workspaceApi.getPainPoints(projectId).then((d: { pain_points: PainPoint[] }) => setPainPoints(d.pain_points || [])).catch(() => {});
                    setWbLoading(false);
                  }} className="flex-1 bg-slate-800 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                    {wbLoading ? "Сохраняю..." : "Добавить"}
                  </button>
                </div>
              </div>
            )}
            {painPoints.length === 0 && !showPainForm && (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
                <Icon name="Flame" size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Болей пока нет</p>
                <p className="text-xs text-slate-400 mt-1">Добавьте вручную или используйте AI-экстракцию</p>
              </div>
            )}
            {painPoints.length > 0 && (
              <div className="space-y-2">
                {painPoints.map(p => {
                  const impactColor = p.impact_level === "critical" ? "bg-red-100 text-red-700 border-red-200" : p.impact_level === "high" ? "bg-orange-100 text-orange-700 border-orange-200" : p.impact_level === "medium" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200";
                  const PAIN_LABELS: Record<string, string> = { manual_work: "Ручной труд", duplication: "Дублирование", delay: "Задержки", lack_of_visibility: "Нет прозрачности", control_gap: "Контрольный разрыв", data_quality: "Качество данных", error_rate: "Ошибки", compliance_burden: "Регуляторная нагрузка" };
                  return (
                    <div key={p.id} className={`border rounded-xl p-3.5 ${impactColor}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium flex-1">{p.description}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/60 flex-shrink-0">{p.impact_level === "critical" ? "Критично" : p.impact_level === "high" ? "Высокое" : p.impact_level === "medium" ? "Среднее" : "Низкое"}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                        <span className="text-xs opacity-70">{PAIN_LABELS[p.pain_type] || p.pain_type}</span>
                        {p.frequency && <span className="text-xs opacity-70">📅 {p.frequency}</span>}
                        {p.root_cause && <span className="text-xs opacity-70">🔍 {p.root_cause}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Бенчмарки ── */}
        {tab === "benchmarks" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Внешние практики и референсы — что работает у других</p>
              <button onClick={() => setShowBenchmarkForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700">
                <Icon name="Plus" size={13} /> Добавить бенчмарк
              </button>
            </div>
            {showBenchmarkForm && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">Новый бенчмарк</p>
                <input placeholder="Название практики / кейса" value={benchmarkDraft.title} onChange={e => setBenchmarkDraft(d => ({ ...d, title: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Источник (компания / ресурс)" value={benchmarkDraft.source_name} onChange={e => setBenchmarkDraft(d => ({ ...d, source_name: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                  <input placeholder="Ссылка (URL)" value={benchmarkDraft.source_url} onChange={e => setBenchmarkDraft(d => ({ ...d, source_url: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                </div>
                <input placeholder="Отрасль" value={benchmarkDraft.industry} onChange={e => setBenchmarkDraft(d => ({ ...d, industry: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                <textarea placeholder="Что было сделано — суть практики" rows={2} value={benchmarkDraft.summary} onChange={e => setBenchmarkDraft(d => ({ ...d, summary: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                <textarea placeholder="Наблюдаемый эффект / результат" rows={2} value={benchmarkDraft.observed_effect} onChange={e => setBenchmarkDraft(d => ({ ...d, observed_effect: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                <textarea placeholder="Применимость к нам — что можно взять" rows={2} value={benchmarkDraft.applicability} onChange={e => setBenchmarkDraft(d => ({ ...d, applicability: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                <textarea placeholder="Заметки / ограничения" rows={2} value={benchmarkDraft.notes} onChange={e => setBenchmarkDraft(d => ({ ...d, notes: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => setShowBenchmarkForm(false)} className="flex-1 border border-slate-200 rounded-lg py-2 text-sm hover:bg-slate-50">Отмена</button>
                  <button disabled={!benchmarkDraft.title.trim() || wbLoading} onClick={async () => {
                    setWbLoading(true);
                    await workspaceApi.createBenchmark({ project_id: projectId, ...benchmarkDraft });
                    setBenchmarkDraft({ title: "", source_name: "", source_url: "", industry: "", summary: "", observed_effect: "", applicability: "", notes: "" });
                    setShowBenchmarkForm(false);
                    workspaceApi.getBenchmarks(projectId).then((d: { benchmarks: Benchmark[] }) => setBenchmarks(d.benchmarks || [])).catch(() => {});
                    setWbLoading(false);
                  }} className="flex-1 bg-slate-800 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                    {wbLoading ? "Сохраняю..." : "Сохранить"}
                  </button>
                </div>
              </div>
            )}
            {benchmarks.length === 0 && !showBenchmarkForm && (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
                <Icon name="BookMarked" size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Бенчмарков пока нет</p>
                <p className="text-xs text-slate-400 mt-1">Добавьте практики из других банков, компаний, исследований</p>
              </div>
            )}
            <div className="space-y-3">
              {benchmarks.map(b => (
                <div key={b.id} className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-semibold text-slate-900 text-sm">{b.title}</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {b.confidence_level && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{b.confidence_level === "high" ? "высокая доказательность" : b.confidence_level === "medium" ? "средняя" : "низкая"}</span>}
                      {b.source_url && <a href={b.source_url} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:text-violet-800"><Icon name="ExternalLink" size={13} /></a>}
                    </div>
                  </div>
                  {b.source_name && <p className="text-xs text-slate-400 mb-2">📎 {b.source_name}{b.industry ? ` · ${b.industry}` : ""}</p>}
                  {b.summary && <p className="text-xs text-slate-600 mb-1"><span className="font-medium">Что сделано:</span> {b.summary}</p>}
                  {b.observed_effect && <p className="text-xs text-slate-600 mb-1"><span className="font-medium">Эффект:</span> {b.observed_effect}</p>}
                  {b.applicability && <div className="mt-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2"><p className="text-xs text-green-800"><span className="font-semibold">Применимость:</span> {b.applicability}</p></div>}
                  {b.notes && <p className="text-xs text-slate-400 mt-2 italic">{b.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── AI-оценка ── */}
        {tab === "ai" && (
          <div className="space-y-4">
            {/* AI-ассессмент */}
            <div className="bg-gradient-to-br from-violet-50 to-slate-50 border border-violet-100 rounded-2xl p-4 space-y-3">
              <p className="text-sm font-semibold text-violet-900">🧠 Быстрая оценка применимости AI</p>
              <p className="text-xs text-violet-700">Опишите процесс или операцию — AI скажет нужен ли ИИ, какой тип и какие риски</p>
              <textarea placeholder="Опишите процесс: что происходит сейчас, кто участвует, какие данные, где ручной труд..." rows={4} value={aiAssessText} onChange={e => setAiAssessText(e.target.value)} className="w-full border border-violet-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none" />
              <button disabled={!aiAssessText.trim() || aiAssessLoading} onClick={async () => {
                setAiAssessLoading(true);
                setAiAssessResult(null);
                try {
                  const res = await workspaceApi.aiAssess(projectId, aiAssessText) as { assessment: Record<string, unknown> };
                  setAiAssessResult(res.assessment);
                } finally { setAiAssessLoading(false); }
              }} className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                {aiAssessLoading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Анализирую...</> : <><Icon name="Sparkles" size={14} /> Оценить</>}
              </button>
              {aiAssessResult && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${(aiAssessResult.ai_recommended as boolean) ? "bg-green-50 border border-green-200" : "bg-slate-50 border border-slate-200"}`}>
                    <Icon name={aiAssessResult.ai_recommended ? "CheckCircle" : "XCircle"} size={16} className={aiAssessResult.ai_recommended ? "text-green-600" : "text-slate-400"} />
                    <span className="font-semibold text-sm">{aiAssessResult.recommendation_label as string}</span>
                    {aiAssessResult.solution_label && <span className="text-xs text-slate-500 ml-auto">→ {aiAssessResult.solution_label as string}</span>}
                  </div>
                  {Array.isArray(aiAssessResult.key_operations) && (aiAssessResult.key_operations as string[]).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">Операции для автоматизации:</p>
                      <ul className="space-y-1">{(aiAssessResult.key_operations as string[]).map((op, i) => <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5"><span className="text-violet-500 flex-shrink-0">•</span>{op}</li>)}</ul>
                    </div>
                  )}
                  {Array.isArray(aiAssessResult.risks) && (aiAssessResult.risks as string[]).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">Риски:</p>
                      <ul className="space-y-1">{(aiAssessResult.risks as string[]).map((r, i) => <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5"><span className="text-orange-500 flex-shrink-0">⚠</span>{r}</li>)}</ul>
                    </div>
                  )}
                  {Array.isArray(aiAssessResult.quick_wins) && (aiAssessResult.quick_wins as string[]).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">Quick wins прямо сейчас:</p>
                      <ul className="space-y-1">{(aiAssessResult.quick_wins as string[]).map((w, i) => <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5"><span className="text-green-500 flex-shrink-0">✓</span>{w}</li>)}</ul>
                    </div>
                  )}
                  {aiAssessResult.next_step && <div className="bg-violet-50 rounded-lg px-3 py-2"><p className="text-xs font-semibold text-violet-800">Следующий шаг:</p><p className="text-xs text-violet-700 mt-0.5">{aiAssessResult.next_step as string}</p></div>}
                  <button onClick={async () => {
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
                  }} className="flex items-center gap-1.5 text-xs text-violet-700 hover:text-violet-900 font-semibold">
                    <Icon name="Save" size={12} /> Сохранить как AI-возможность
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Сохранённые AI-возможности ({aiOpportunities.length})</p>
              <button onClick={() => setShowAiForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50">
                <Icon name="Plus" size={13} /> Добавить вручную
              </button>
            </div>
            {showAiForm && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <input placeholder="Название (что автоматизируем)" value={aiDraft.title} onChange={e => setAiDraft(d => ({ ...d, title: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                <textarea placeholder="Текущая ручная операция" rows={2} value={aiDraft.current_manual_operation} onChange={e => setAiDraft(d => ({ ...d, current_manual_operation: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                <div className="grid grid-cols-2 gap-3">
                  <select value={aiDraft.proposed_solution_type} onChange={e => setAiDraft(d => ({ ...d, proposed_solution_type: e.target.value }))} className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none">
                    <option value="none">Тип решения</option>
                    <option value="genai">GenAI</option>
                    <option value="ml">ML / классический AI</option>
                    <option value="rpa">RPA / боты</option>
                    <option value="rule_engine">Rule engine</option>
                    <option value="workflow">Workflow автоматизация</option>
                    <option value="bi">BI / аналитика</option>
                    <option value="idp">IDP / распознавание</option>
                    <option value="hybrid">Гибрид</option>
                  </select>
                  <select value={aiDraft.recommendation} onChange={e => setAiDraft(d => ({ ...d, recommendation: e.target.value }))} className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none">
                    <option value="recommended">AI рекомендован</option>
                    <option value="possible">AI возможен</option>
                    <option value="assess">Требует оценки</option>
                    <option value="no_ai">AI не нужен</option>
                    <option value="automate_first">Сначала автоматизация</option>
                  </select>
                </div>
                <textarea placeholder="Ожидаемый эффект" rows={2} value={aiDraft.expected_effect} onChange={e => setAiDraft(d => ({ ...d, expected_effect: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                <textarea placeholder="Риски" rows={2} value={aiDraft.risks} onChange={e => setAiDraft(d => ({ ...d, risks: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={aiDraft.human_in_loop} onChange={e => setAiDraft(d => ({ ...d, human_in_loop: e.target.checked }))} />
                  Требует проверки человеком (human-in-the-loop)
                </label>
                <div className="flex gap-2">
                  <button onClick={() => setShowAiForm(false)} className="flex-1 border border-slate-200 rounded-lg py-2 text-sm hover:bg-slate-50">Отмена</button>
                  <button disabled={!aiDraft.title.trim() || wbLoading} onClick={async () => {
                    setWbLoading(true);
                    await workspaceApi.createAiOpportunity({ project_id: projectId, ...aiDraft });
                    setAiDraft({ title: "", current_manual_operation: "", data_type: "mixed", proposed_solution_type: "none", expected_effect: "", risks: "", human_in_loop: true, recommendation: "assess" });
                    setShowAiForm(false);
                    workspaceApi.getAiOpportunities(projectId).then((d: { opportunities: AiOpportunity[] }) => setAiOpportunities(d.opportunities || [])).catch(() => {});
                    setWbLoading(false);
                  }} className="flex-1 bg-slate-800 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                    {wbLoading ? "Сохраняю..." : "Сохранить"}
                  </button>
                </div>
              </div>
            )}
            {aiOpportunities.length === 0 && !showAiForm && (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Icon name="Cpu" size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Нет сохранённых AI-возможностей</p>
                <p className="text-xs text-slate-400 mt-1">Используйте ассессмент выше или добавьте вручную</p>
              </div>
            )}
            <div className="space-y-3">
              {aiOpportunities.map(opp => {
                const recColor = opp.recommendation === "recommended" ? "bg-green-50 border-green-200 text-green-800" : opp.recommendation === "possible" ? "bg-blue-50 border-blue-200 text-blue-800" : opp.recommendation === "no_ai" ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-amber-50 border-amber-200 text-amber-800";
                const SOL_LABELS: Record<string, string> = { genai: "GenAI", ml: "ML", rpa: "RPA", rule_engine: "Rule engine", workflow: "Workflow", bi: "BI/аналитика", idp: "IDP", hybrid: "Гибрид", none: "Не определён" };
                return (
                  <div key={opp.id} className={`border rounded-2xl p-4 ${recColor}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-semibold text-sm">{opp.title}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/60 flex-shrink-0">{SOL_LABELS[opp.proposed_solution_type] || opp.proposed_solution_type}</span>
                    </div>
                    {opp.current_manual_operation && <p className="text-xs opacity-80 mb-1"><span className="font-medium">Сейчас:</span> {opp.current_manual_operation}</p>}
                    {opp.expected_effect && <p className="text-xs opacity-80 mb-1"><span className="font-medium">Эффект:</span> {opp.expected_effect}</p>}
                    {opp.risks && <p className="text-xs opacity-70 mb-1"><span className="font-medium">Риски:</span> {opp.risks}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      {opp.human_in_loop && <span className="text-[10px] bg-white/60 px-1.5 py-0.5 rounded font-medium">👤 human-in-loop</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Инициативы ── */}
        {tab === "initiatives" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Решения готовые к реализации — с приоритетом и ответственным</p>
              <button onClick={() => setShowInitiativeForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700">
                <Icon name="Plus" size={13} /> Добавить инициативу
              </button>
            </div>
            {showInitiativeForm && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800">Новая инициатива</p>
                <input placeholder="Название инициативы" value={initiativeDraft.title} onChange={e => setInitiativeDraft(d => ({ ...d, title: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                <textarea placeholder="Описание — что планируем сделать" rows={2} value={initiativeDraft.description} onChange={e => setInitiativeDraft(d => ({ ...d, description: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Владелец" value={initiativeDraft.owner_name} onChange={e => setInitiativeDraft(d => ({ ...d, owner_name: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                  <select value={initiativeDraft.priority} onChange={e => setInitiativeDraft(d => ({ ...d, priority: e.target.value }))} className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none">
                    <option value="critical">Критический</option>
                    <option value="high">Высокий</option>
                    <option value="medium">Средний</option>
                    <option value="low">Низкий</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Эффект (1–5)</p>
                    <input type="range" min={1} max={5} value={initiativeDraft.impact_score} onChange={e => setInitiativeDraft(d => ({ ...d, impact_score: Number(e.target.value) }))} className="w-full" />
                    <p className="text-xs text-center font-bold text-slate-700">{initiativeDraft.impact_score}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Усилие (1–5)</p>
                    <input type="range" min={1} max={5} value={initiativeDraft.effort_score} onChange={e => setInitiativeDraft(d => ({ ...d, effort_score: Number(e.target.value) }))} className="w-full" />
                    <p className="text-xs text-center font-bold text-slate-700">{initiativeDraft.effort_score}</p>
                  </div>
                </div>
                <select value={initiativeDraft.status} onChange={e => setInitiativeDraft(d => ({ ...d, status: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none">
                  <option value="idea">Идея</option>
                  <option value="preparation">Подготовка</option>
                  <option value="approval">Согласование</option>
                  <option value="in_plan">В плане</option>
                  <option value="pilot">Пилот</option>
                  <option value="implementation">Реализация</option>
                  <option value="done">Завершена</option>
                </select>
                <input placeholder="Следующий шаг" value={initiativeDraft.next_step} onChange={e => setInitiativeDraft(d => ({ ...d, next_step: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                <div className="flex gap-2">
                  <button onClick={() => setShowInitiativeForm(false)} className="flex-1 border border-slate-200 rounded-lg py-2 text-sm hover:bg-slate-50">Отмена</button>
                  <button disabled={!initiativeDraft.title.trim() || wbLoading} onClick={async () => {
                    setWbLoading(true);
                    await workspaceApi.createInitiative({ project_id: projectId, ...initiativeDraft });
                    setInitiativeDraft({ title: "", description: "", owner_name: "", priority: "medium", impact_score: 3, effort_score: 3, status: "idea", next_step: "" });
                    setShowInitiativeForm(false);
                    workspaceApi.getInitiatives(projectId).then((d: { initiatives: Initiative[] }) => setInitiatives(d.initiatives || [])).catch(() => {});
                    setWbLoading(false);
                  }} className="flex-1 bg-slate-800 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                    {wbLoading ? "Сохраняю..." : "Сохранить"}
                  </button>
                </div>
              </div>
            )}
            {initiatives.length === 0 && !showInitiativeForm && (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
                <Icon name="Rocket" size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Инициатив пока нет</p>
                <p className="text-xs text-slate-400 mt-1">Создайте инициативу из кейса — с эффектом, усилием и статусом</p>
              </div>
            )}
            <div className="space-y-3">
              {initiatives.map(init => {
                const STATUS_MAP: Record<string, { label: string; color: string }> = {
                  idea: { label: "Идея", color: "bg-slate-100 text-slate-600" },
                  preparation: { label: "Подготовка", color: "bg-amber-100 text-amber-700" },
                  approval: { label: "Согласование", color: "bg-blue-100 text-blue-700" },
                  in_plan: { label: "В плане", color: "bg-indigo-100 text-indigo-700" },
                  pilot: { label: "Пилот", color: "bg-violet-100 text-violet-700" },
                  implementation: { label: "Реализация", color: "bg-green-100 text-green-700" },
                  done: { label: "Завершена", color: "bg-emerald-100 text-emerald-700" },
                };
                const s = STATUS_MAP[init.status] || { label: init.status, color: "bg-slate-100 text-slate-600" };
                const priorityBorder = init.priority === "critical" ? "border-red-300" : init.priority === "high" ? "border-orange-300" : "border-slate-200";
                return (
                  <div key={init.id} className={`bg-white border rounded-2xl p-4 ${priorityBorder}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-semibold text-slate-900 text-sm">{init.title}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${s.color}`}>{s.label}</span>
                    </div>
                    {init.description && <p className="text-xs text-slate-600 mb-2">{init.description}</p>}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>📈 Эффект: <b className="text-slate-700">{init.impact_score}/5</b></span>
                      <span>💪 Усилие: <b className="text-slate-700">{init.effort_score}/5</b></span>
                      {init.owner_name && <span>👤 {init.owner_name}</span>}
                    </div>
                    {init.next_step && <div className="mt-2 bg-amber-50 rounded-lg px-3 py-2"><p className="text-xs text-amber-800">→ <span className="font-medium">Следующий шаг:</span> {init.next_step}</p></div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

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