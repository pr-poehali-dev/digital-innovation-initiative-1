import { useState, useEffect, useCallback } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import {
  contentApi,
  type ContentType,
  type ContentStatus,
  type CommChannel,
  type CommStatus,
  type ContentAudience,
} from "@/lib/admin-api";

// ─── Local types ────────────────────────────────────────────────────────────

type ContentItem = {
  id: number;
  content_no: string;
  type: ContentType;
  status: ContentStatus;
  title: string;
  slug: string;
  summary: string;
  body_markdown: string;
  module_slug: string;
  audience: ContentAudience;
  tags_json: string[];
  published_at: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
};

type Communication = {
  id: number;
  comm_no: string;
  content_item_id: number | null;
  channel: CommChannel;
  status: CommStatus;
  audience: ContentAudience;
  subject: string;
  body: string;
  module_slug: string;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
};

type CommEvent = {
  id: number;
  communication_id: number;
  event_type: string;
  event_value: string | null;
  meta_json: Record<string, unknown>;
  created_at: string;
};

type ContentSummary = {
  draft: number;
  review: number;
  published: number;
  archived: number;
  published_week: number;
};

type CommSummary = {
  draft: number;
  scheduled: number;
  sent_today: number;
  failed: number;
  sent_total: number;
};

// ─── Config constants ────────────────────────────────────────────────────────

const CONTENT_TYPE_CFG: Record<ContentType, { label: string; icon: string; color: string }> = {
  announcement: { label: "Анонс",        icon: "Megaphone",      color: "text-violet-400"  },
  release_note: { label: "Release Note", icon: "Tag",            color: "text-blue-400"    },
  faq:          { label: "FAQ",          icon: "HelpCircle",     color: "text-amber-400"   },
  guide:        { label: "Гайд",         icon: "BookOpen",       color: "text-emerald-400" },
  article:      { label: "Статья",       icon: "FileText",       color: "text-cyan-400"    },
  template:     { label: "Шаблон",       icon: "LayoutTemplate", color: "text-gray-400"    },
};

const CONTENT_STATUS_CFG: Record<ContentStatus, { label: string; badge: string }> = {
  draft:     { label: "Черновик",    badge: "text-gray-400 bg-gray-800 border-gray-700"                },
  review:    { label: "На ревью",    badge: "text-amber-400 bg-amber-900/30 border-amber-800"          },
  published: { label: "Опубликован", badge: "text-emerald-400 bg-emerald-900/30 border-emerald-800"    },
  archived:  { label: "Архив",       badge: "text-gray-600 bg-gray-900 border-gray-800"                },
};

const COMM_STATUS_CFG: Record<CommStatus, { label: string; badge: string }> = {
  draft:     { label: "Черновик",      badge: "text-gray-400 bg-gray-800 border-gray-700"              },
  scheduled: { label: "Запланирован",  badge: "text-blue-400 bg-blue-900/30 border-blue-800"           },
  sent:      { label: "Отправлен",     badge: "text-emerald-400 bg-emerald-900/30 border-emerald-800"  },
  failed:    { label: "Ошибка",        badge: "text-red-400 bg-red-900/30 border-red-800"              },
  cancelled: { label: "Отменён",       badge: "text-gray-600 bg-gray-900 border-gray-800"              },
};

const CHANNEL_CFG: Record<CommChannel, { label: string; icon: string; color: string }> = {
  in_app: { label: "In-app", icon: "Bell", color: "text-violet-400" },
  email:  { label: "Email",  icon: "Mail", color: "text-blue-400"   },
  system: { label: "System", icon: "Cpu",  color: "text-amber-400"  },
};

const EVENT_CFG: Record<string, { label: string; color: string }> = {
  queued:    { label: "Поставлено в очередь", color: "text-gray-500"    },
  sent:      { label: "Отправлено",           color: "text-emerald-400" },
  delivered: { label: "Доставлено",           color: "text-blue-400"    },
  failed:    { label: "Ошибка",               color: "text-red-400"     },
  opened:    { label: "Открыто",              color: "text-violet-400"  },
  clicked:   { label: "Клик",                 color: "text-amber-400"   },
};

const CONTENT_TYPES: ContentType[]   = ["announcement", "release_note", "faq", "guide", "article", "template"];
const CONTENT_STATUSES: ContentStatus[] = ["draft", "review", "published", "archived"];
const COMM_STATUSES: CommStatus[]    = ["draft", "scheduled", "sent", "failed", "cancelled"];
const COMM_CHANNELS: CommChannel[]   = ["in_app", "email", "system"];
const AUDIENCES: ContentAudience[]   = ["all", "learners", "admins", "support", "project_team"];
const AUDIENCE_LABELS: Record<ContentAudience, string> = {
  all: "Все", learners: "Обучающиеся", admins: "Админы",
  support: "Поддержка", project_team: "Команда",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function StatusBadge({
  label, badge, onClick,
}: {
  label: string; badge: string; onClick?: () => void;
}) {
  return (
    <span
      onClick={onClick}
      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge} ${onClick ? "cursor-pointer hover:opacity-80" : ""}`}
    >
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminContentPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"content" | "comms">("content");

  // ── Content state ──
  const [contentList, setContentList]         = useState<ContentItem[]>([]);
  const [contentLoading, setContentLoading]   = useState(false);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [contentSummary, setContentSummary]   = useState<ContentSummary | null>(null);
  const [showAddContent, setShowAddContent]   = useState(false);
  const [editingBody, setEditingBody]         = useState(false);
  const [editBodyValue, setEditBodyValue]     = useState("");

  // Content filters
  const [cSearch, setCSearch]   = useState("");
  const [cType, setCType]       = useState<ContentType | "">("");
  const [cStatus, setCStatus]   = useState<ContentStatus | "">("");
  const [cAudience, setCAudience] = useState<ContentAudience | "">("");

  // Add content form
  const [addCForm, setAddCForm] = useState({
    title: "", type: "announcement" as ContentType, status: "draft" as ContentStatus,
    audience: "all" as ContentAudience, module_slug: "", summary: "", body_markdown: "",
  });
  const [addCLoading, setAddCLoading] = useState(false);

  // ── Comms state ──
  const [commList, setCommList]         = useState<Communication[]>([]);
  const [commLoading, setCommLoading]   = useState(false);
  const [selectedComm, setSelectedComm] = useState<Communication | null>(null);
  const [commSummary, setCommSummary]   = useState<CommSummary | null>(null);
  const [commEvents, setCommEvents]     = useState<CommEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [showAddComm, setShowAddComm]   = useState(false);

  // Comms filters
  const [mmSearch, setMmSearch]     = useState("");
  const [mmChannel, setMmChannel]   = useState<CommChannel | "">("");
  const [mmStatus, setMmStatus]     = useState<CommStatus | "">("");
  const [mmAudience, setMmAudience] = useState<ContentAudience | "">("");

  // Pre-fill from content "Create comm"
  const [commPreSubject, setCommPreSubject] = useState("");

  // Add comm form
  const [addMmForm, setAddMmForm] = useState({
    subject: "", channel: "in_app" as CommChannel, status: "draft" as CommStatus,
    audience: "all" as ContentAudience, module_slug: "", body: "", scheduled_at: "",
  });
  const [addMmLoading, setAddMmLoading] = useState(false);

  // ── Loaders ──

  const loadContentSummary = useCallback(async () => {
    const res = await contentApi.contentSummary();
    if (res.ok) setContentSummary(res.data as ContentSummary);
  }, []);

  const loadCommSummary = useCallback(async () => {
    const res = await contentApi.commSummary();
    if (res.ok) setCommSummary(res.data as CommSummary);
  }, []);

  const loadContentList = useCallback(async () => {
    setContentLoading(true);
    try {
      const params: Record<string, string> = {};
      if (cSearch) params.search = cSearch;
      if (cType)   params.type   = cType;
      if (cStatus) params.status = cStatus;
      if (cAudience) params.audience = cAudience;
      const res = await contentApi.contentList(params);
      if (res.ok) {
        setContentList((res.data as { items: ContentItem[] }).items ?? []);
      } else {
        toast({ title: "Ошибка загрузки контента", variant: "destructive" });
      }
    } finally {
      setContentLoading(false);
    }
  }, [cSearch, cType, cStatus, cAudience, toast]);

  const loadCommList = useCallback(async () => {
    setCommLoading(true);
    try {
      const params: Record<string, string> = {};
      if (mmSearch)  params.search  = mmSearch;
      if (mmChannel) params.channel = mmChannel;
      if (mmStatus)  params.status  = mmStatus;
      if (mmAudience) params.audience = mmAudience;
      const res = await contentApi.commList(params);
      if (res.ok) {
        setCommList((res.data as { items: Communication[] }).items ?? []);
      } else {
        toast({ title: "Ошибка загрузки коммуникаций", variant: "destructive" });
      }
    } finally {
      setCommLoading(false);
    }
  }, [mmSearch, mmChannel, mmStatus, mmAudience, toast]);

  const loadCommEvents = useCallback(async (commId: number) => {
    setEventsLoading(true);
    try {
      const res = await contentApi.commEvents(commId);
      if (res.ok) {
        setCommEvents((res.data as { events: CommEvent[] }).events ?? []);
      } else {
        toast({ title: "Ошибка загрузки событий", variant: "destructive" });
      }
    } finally {
      setEventsLoading(false);
    }
  }, [toast]);

  // ── Effects ──

  useEffect(() => {
    loadContentSummary();
    loadCommSummary();
  }, [loadContentSummary, loadCommSummary]);

  useEffect(() => {
    if (activeTab === "content") loadContentList();
  }, [activeTab, loadContentList]);

  useEffect(() => {
    if (activeTab === "comms") loadCommList();
  }, [activeTab, loadCommList]);

  useEffect(() => {
    if (selectedComm) loadCommEvents(selectedComm.id);
  }, [selectedComm, loadCommEvents]);

  // Apply commPreSubject when switching to comms tab
  useEffect(() => {
    if (activeTab === "comms" && commPreSubject) {
      setAddMmForm(f => ({ ...f, subject: commPreSubject }));
      setShowAddComm(true);
      setCommPreSubject("");
    }
  }, [activeTab, commPreSubject]);

  // ── Content mutations ──

  const handleAddContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addCForm.title.trim()) return;
    setAddCLoading(true);
    try {
      const res = await contentApi.addContent({
        title:         addCForm.title,
        type:          addCForm.type,
        status:        addCForm.status,
        audience:      addCForm.audience,
        module_slug:   addCForm.module_slug,
        summary:       addCForm.summary,
        body_markdown: addCForm.body_markdown,
      });
      if (res.ok) {
        toast({ title: "Контент создан" });
        setShowAddContent(false);
        setAddCForm({ title: "", type: "announcement", status: "draft", audience: "all", module_slug: "", summary: "", body_markdown: "" });
        await Promise.all([loadContentList(), loadContentSummary()]);
      } else {
        toast({ title: "Ошибка создания контента", variant: "destructive" });
      }
    } finally {
      setAddCLoading(false);
    }
  };

  const handleCycleContentStatus = async (item: ContentItem) => {
    const idx = CONTENT_STATUSES.indexOf(item.status);
    const next = CONTENT_STATUSES[(idx + 1) % CONTENT_STATUSES.length];
    const res = await contentApi.updateContent({ id: item.id, status: next });
    if (res.ok) {
      const updated = { ...item, status: next };
      setSelectedContent(updated);
      setContentList(list => list.map(c => (c.id === item.id ? updated : c)));
      await loadContentSummary();
    } else {
      toast({ title: "Ошибка смены статуса", variant: "destructive" });
    }
  };

  const handleSaveBody = async (item: ContentItem) => {
    const res = await contentApi.updateContent({ id: item.id, body_markdown: editBodyValue });
    if (res.ok) {
      const updated = { ...item, body_markdown: editBodyValue };
      setSelectedContent(updated);
      setContentList(list => list.map(c => (c.id === item.id ? updated : c)));
      setEditingBody(false);
      toast({ title: "Тело сохранено" });
    } else {
      toast({ title: "Ошибка сохранения", variant: "destructive" });
    }
  };

  const handlePublishContent = async (item: ContentItem) => {
    const res = await contentApi.publishContent(item.id);
    if (res.ok) {
      const updated = { ...item, status: "published" as ContentStatus };
      setSelectedContent(updated);
      setContentList(list => list.map(c => (c.id === item.id ? updated : c)));
      toast({ title: "Опубликовано" });
      await loadContentSummary();
    } else {
      toast({ title: "Ошибка публикации", variant: "destructive" });
    }
  };

  const handleArchiveContent = async (item: ContentItem) => {
    const res = await contentApi.archiveContent(item.id);
    if (res.ok) {
      const updated = { ...item, status: "archived" as ContentStatus };
      setSelectedContent(updated);
      setContentList(list => list.map(c => (c.id === item.id ? updated : c)));
      toast({ title: "Архивировано" });
      await loadContentSummary();
    } else {
      toast({ title: "Ошибка архивации", variant: "destructive" });
    }
  };

  // ── Comm mutations ──

  const handleAddComm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addMmForm.subject.trim()) return;
    setAddMmLoading(true);
    try {
      const payload: Record<string, unknown> = {
        subject:      addMmForm.subject,
        channel:      addMmForm.channel,
        status:       addMmForm.status,
        audience:     addMmForm.audience,
        module_slug:  addMmForm.module_slug,
        body:         addMmForm.body,
      };
      if (addMmForm.scheduled_at) payload.scheduled_at = addMmForm.scheduled_at;
      const res = await contentApi.addComm(payload);
      if (res.ok) {
        toast({ title: "Коммуникация создана" });
        setShowAddComm(false);
        setAddMmForm({ subject: "", channel: "in_app", status: "draft", audience: "all", module_slug: "", body: "", scheduled_at: "" });
        await Promise.all([loadCommList(), loadCommSummary()]);
      } else {
        toast({ title: "Ошибка создания", variant: "destructive" });
      }
    } finally {
      setAddMmLoading(false);
    }
  };

  const handleCycleCommStatus = async (comm: Communication) => {
    const idx = COMM_STATUSES.indexOf(comm.status);
    const next = COMM_STATUSES[(idx + 1) % COMM_STATUSES.length];
    const res = await contentApi.updateComm({ id: comm.id, status: next });
    if (res.ok) {
      const updated = { ...comm, status: next };
      setSelectedComm(updated);
      setCommList(list => list.map(c => (c.id === comm.id ? updated : c)));
      await loadCommSummary();
    } else {
      toast({ title: "Ошибка смены статуса", variant: "destructive" });
    }
  };

  const handleSendComm = async (comm: Communication) => {
    const res = await contentApi.sendComm(comm.id);
    if (res.ok) {
      toast({ title: "Отправлено" });
      const updated = { ...comm, status: "sent" as CommStatus };
      setSelectedComm(updated);
      setCommList(list => list.map(c => (c.id === comm.id ? updated : c)));
      await Promise.all([loadCommSummary(), loadCommEvents(comm.id)]);
    } else {
      toast({ title: "Ошибка отправки", variant: "destructive" });
    }
  };

  const handleCancelComm = async (comm: Communication) => {
    const res = await contentApi.cancelComm(comm.id);
    if (res.ok) {
      toast({ title: "Отменено" });
      const updated = { ...comm, status: "cancelled" as CommStatus };
      setSelectedComm(updated);
      setCommList(list => list.map(c => (c.id === comm.id ? updated : c)));
      await loadCommSummary();
    } else {
      toast({ title: "Ошибка отмены", variant: "destructive" });
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AdminShell>
      <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden flex-col">

        {/* ── Tabs header ── */}
        <div className="flex-shrink-0 flex items-center gap-0 border-b border-gray-800 bg-gray-950">
          {(["content", "comms"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab
                  ? "text-white border-violet-500"
                  : "text-gray-500 border-transparent hover:text-gray-300"
              }`}
            >
              {tab === "content" ? "Content" : "Communications"}
            </button>
          ))}
        </div>

        {/* ── Content below ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ═══════════════════════════════════════════════════════════
              TAB 1: CONTENT
          ═══════════════════════════════════════════════════════════ */}
          {activeTab === "content" && (
            <>
              {/* Left column */}
              <div className="w-96 flex-shrink-0 border-r border-gray-800 flex flex-col overflow-hidden">

                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 flex-shrink-0">
                  <Icon name="FileText" size={16} className="text-violet-400" />
                  <span className="text-sm font-semibold text-white">Контент</span>
                  <span className="ml-1 text-xs text-gray-400 bg-gray-700 rounded px-1.5 py-0.5">
                    {contentList.length}
                  </span>
                  <button
                    onClick={() => setShowAddContent(v => !v)}
                    className="ml-auto text-xs px-2.5 py-1 rounded bg-violet-700 hover:bg-violet-600 text-white transition-colors"
                  >
                    Добавить
                  </button>
                </div>

                {/* Overview cards */}
                {contentSummary && (
                  <div className="px-4 pt-3 grid grid-cols-2 gap-2 flex-shrink-0">
                    <div className="bg-gray-900 rounded-lg p-2 border border-gray-800">
                      <p className="text-lg font-bold text-gray-200">{contentSummary.draft}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">Черновики</p>
                    </div>
                    <div className="bg-amber-900/20 rounded-lg p-2 border border-amber-900/40">
                      <p className="text-lg font-bold text-amber-400">{contentSummary.review}</p>
                      <p className="text-[10px] text-amber-600 mt-0.5">На ревью</p>
                    </div>
                    <div className="bg-emerald-900/20 rounded-lg p-2 border border-emerald-900/40">
                      <p className="text-lg font-bold text-emerald-400">{contentSummary.published}</p>
                      <p className="text-[10px] text-emerald-600 mt-0.5">Опубликовано</p>
                    </div>
                    <div className="bg-blue-900/20 rounded-lg p-2 border border-blue-900/40">
                      <p className="text-lg font-bold text-blue-400">{contentSummary.published_week}</p>
                      <p className="text-[10px] text-blue-600 mt-0.5">За неделю</p>
                    </div>
                  </div>
                )}

                {/* Filters */}
                <div className="px-4 py-2 space-y-2 flex-shrink-0">
                  <input
                    value={cSearch}
                    onChange={e => setCSearch(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && loadContentList()}
                    placeholder="Поиск…"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600"
                  />
                  <div className="flex gap-2">
                    <select
                      value={cType}
                      onChange={e => { setCType(e.target.value as ContentType | ""); }}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-violet-600"
                    >
                      <option value="">Тип</option>
                      {CONTENT_TYPES.map(t => (
                        <option key={t} value={t}>{CONTENT_TYPE_CFG[t].label}</option>
                      ))}
                    </select>
                    <select
                      value={cStatus}
                      onChange={e => { setCStatus(e.target.value as ContentStatus | ""); }}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-violet-600"
                    >
                      <option value="">Статус</option>
                      {CONTENT_STATUSES.map(s => (
                        <option key={s} value={s}>{CONTENT_STATUS_CFG[s].label}</option>
                      ))}
                    </select>
                  </div>
                  <select
                    value={cAudience}
                    onChange={e => { setCAudience(e.target.value as ContentAudience | ""); }}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-violet-600"
                  >
                    <option value="">Аудитория</option>
                    {AUDIENCES.map(a => (
                      <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>
                    ))}
                  </select>
                </div>

                {/* Add content form */}
                {showAddContent && (
                  <form
                    onSubmit={handleAddContent}
                    className="bg-gray-900 border-b border-gray-800 px-4 py-4 space-y-3 flex-shrink-0"
                  >
                    <input
                      required
                      placeholder="Заголовок *"
                      value={addCForm.title}
                      onChange={e => setAddCForm(f => ({ ...f, title: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600"
                    />
                    <div className="flex gap-2">
                      <select
                        value={addCForm.type}
                        onChange={e => setAddCForm(f => ({ ...f, type: e.target.value as ContentType }))}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none"
                      >
                        {CONTENT_TYPES.map(t => (
                          <option key={t} value={t}>{CONTENT_TYPE_CFG[t].label}</option>
                        ))}
                      </select>
                      <select
                        value={addCForm.status}
                        onChange={e => setAddCForm(f => ({ ...f, status: e.target.value as ContentStatus }))}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none"
                      >
                        {CONTENT_STATUSES.map(s => (
                          <option key={s} value={s}>{CONTENT_STATUS_CFG[s].label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={addCForm.audience}
                        onChange={e => setAddCForm(f => ({ ...f, audience: e.target.value as ContentAudience }))}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none"
                      >
                        {AUDIENCES.map(a => (
                          <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>
                        ))}
                      </select>
                      <input
                        placeholder="module_slug"
                        value={addCForm.module_slug}
                        onChange={e => setAddCForm(f => ({ ...f, module_slug: e.target.value }))}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none"
                      />
                    </div>
                    <textarea
                      placeholder="Summary"
                      rows={2}
                      value={addCForm.summary}
                      onChange={e => setAddCForm(f => ({ ...f, summary: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none"
                    />
                    <textarea
                      placeholder="Body (markdown)"
                      rows={4}
                      value={addCForm.body_markdown}
                      onChange={e => setAddCForm(f => ({ ...f, body_markdown: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none font-mono"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={addCLoading}
                        className="flex-1 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {addCLoading ? "Создание…" : "Создать"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddContent(false)}
                        className="flex-1 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors"
                      >
                        Отмена
                      </button>
                    </div>
                  </form>
                )}

                {/* List */}
                <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
                  {contentLoading ? (
                    <Spinner />
                  ) : contentList.length === 0 ? (
                    <div className="py-12 text-center text-gray-600 text-sm">Нет материалов</div>
                  ) : (
                    contentList.map(item => {
                      const tcfg = CONTENT_TYPE_CFG[item.type];
                      const scfg = CONTENT_STATUS_CFG[item.status];
                      const isSelected = selectedContent?.id === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedContent(item)}
                          className={`w-full text-left px-4 py-3 transition-colors hover:bg-gray-800/50 ${
                            isSelected ? "bg-violet-900/20 border-l-2 border-violet-500" : "border-l-2 border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon name={tcfg.icon} size={12} className={tcfg.color} />
                            <span className="font-mono text-[10px] text-gray-600">{item.content_no}</span>
                            <StatusBadge label={scfg.label} badge={scfg.badge} />
                          </div>
                          <p className="text-sm font-medium text-gray-200 truncate">{item.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {item.module_slug && (
                              <span className="text-[10px] text-gray-600 font-mono">{item.module_slug}</span>
                            )}
                            <span className="text-[10px] text-gray-600">{AUDIENCE_LABELS[item.audience]}</span>
                            <span className="ml-auto text-[10px] text-gray-700">{fmtDate(item.updated_at)}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right column */}
              <div className="flex-1 overflow-y-auto bg-gray-900/30">
                {!selectedContent ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-700">
                    <Icon name="Inbox" size={40} className="mb-3 opacity-40" />
                    <p className="text-sm">Выберите материал</p>
                  </div>
                ) : (
                  <ContentDetailPanel
                    item={selectedContent}
                    onCycleStatus={() => handleCycleContentStatus(selectedContent)}
                    onPublish={() => handlePublishContent(selectedContent)}
                    onArchive={() => handleArchiveContent(selectedContent)}
                    onCreateComm={() => {
                      setCommPreSubject(selectedContent.title);
                      setActiveTab("comms");
                    }}
                    editingBody={editingBody}
                    editBodyValue={editBodyValue}
                    onStartEditBody={() => { setEditBodyValue(selectedContent.body_markdown); setEditingBody(true); }}
                    onEditBodyChange={setEditBodyValue}
                    onSaveBody={() => handleSaveBody(selectedContent)}
                    onCancelEditBody={() => setEditingBody(false)}
                  />
                )}
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB 2: COMMUNICATIONS
          ═══════════════════════════════════════════════════════════ */}
          {activeTab === "comms" && (
            <>
              {/* Left column */}
              <div className="w-96 flex-shrink-0 border-r border-gray-800 flex flex-col overflow-hidden">

                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 flex-shrink-0">
                  <Icon name="Send" size={16} className="text-sky-400" />
                  <span className="text-sm font-semibold text-white">Коммуникации</span>
                  <span className="ml-1 text-xs text-gray-400 bg-gray-700 rounded px-1.5 py-0.5">
                    {commList.length}
                  </span>
                  <button
                    onClick={() => setShowAddComm(v => !v)}
                    className="ml-auto text-xs px-2.5 py-1 rounded bg-violet-700 hover:bg-violet-600 text-white transition-colors"
                  >
                    Добавить
                  </button>
                </div>

                {/* Overview cards */}
                {commSummary && (
                  <div className="px-4 pt-3 grid grid-cols-2 gap-2 flex-shrink-0">
                    <div className="bg-gray-900 rounded-lg p-2 border border-gray-800">
                      <p className="text-lg font-bold text-gray-200">{commSummary.draft}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">Черновики</p>
                    </div>
                    <div className="bg-blue-900/20 rounded-lg p-2 border border-blue-900/40">
                      <p className="text-lg font-bold text-blue-400">{commSummary.scheduled}</p>
                      <p className="text-[10px] text-blue-600 mt-0.5">Запланировано</p>
                    </div>
                    <div className="bg-emerald-900/20 rounded-lg p-2 border border-emerald-900/40">
                      <p className="text-lg font-bold text-emerald-400">{commSummary.sent_today}</p>
                      <p className="text-[10px] text-emerald-600 mt-0.5">Сегодня</p>
                    </div>
                    <div className="bg-red-900/20 rounded-lg p-2 border border-red-900/40">
                      <p className="text-lg font-bold text-red-400">{commSummary.failed}</p>
                      <p className="text-[10px] text-red-600 mt-0.5">Ошибки</p>
                    </div>
                  </div>
                )}

                {/* Filters */}
                <div className="px-4 py-2 space-y-2 flex-shrink-0">
                  <input
                    value={mmSearch}
                    onChange={e => setMmSearch(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && loadCommList()}
                    placeholder="Поиск…"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600"
                  />
                  <div className="flex gap-2">
                    <select
                      value={mmChannel}
                      onChange={e => { setMmChannel(e.target.value as CommChannel | ""); }}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-violet-600"
                    >
                      <option value="">Канал</option>
                      {COMM_CHANNELS.map(ch => (
                        <option key={ch} value={ch}>{CHANNEL_CFG[ch].label}</option>
                      ))}
                    </select>
                    <select
                      value={mmStatus}
                      onChange={e => { setMmStatus(e.target.value as CommStatus | ""); }}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-violet-600"
                    >
                      <option value="">Статус</option>
                      {COMM_STATUSES.map(s => (
                        <option key={s} value={s}>{COMM_STATUS_CFG[s].label}</option>
                      ))}
                    </select>
                  </div>
                  <select
                    value={mmAudience}
                    onChange={e => { setMmAudience(e.target.value as ContentAudience | ""); }}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-violet-600"
                  >
                    <option value="">Аудитория</option>
                    {AUDIENCES.map(a => (
                      <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>
                    ))}
                  </select>
                </div>

                {/* Add comm form */}
                {showAddComm && (
                  <form
                    onSubmit={handleAddComm}
                    className="bg-gray-900 border-b border-gray-800 px-4 py-4 space-y-3 flex-shrink-0"
                  >
                    <input
                      required
                      placeholder="Тема *"
                      value={addMmForm.subject}
                      onChange={e => setAddMmForm(f => ({ ...f, subject: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600"
                    />
                    <div className="flex gap-2">
                      <select
                        value={addMmForm.channel}
                        onChange={e => setAddMmForm(f => ({ ...f, channel: e.target.value as CommChannel }))}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none"
                      >
                        {COMM_CHANNELS.map(ch => (
                          <option key={ch} value={ch}>{CHANNEL_CFG[ch].label}</option>
                        ))}
                      </select>
                      <select
                        value={addMmForm.status}
                        onChange={e => setAddMmForm(f => ({ ...f, status: e.target.value as CommStatus }))}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none"
                      >
                        {COMM_STATUSES.map(s => (
                          <option key={s} value={s}>{COMM_STATUS_CFG[s].label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={addMmForm.audience}
                        onChange={e => setAddMmForm(f => ({ ...f, audience: e.target.value as ContentAudience }))}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none"
                      >
                        {AUDIENCES.map(a => (
                          <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>
                        ))}
                      </select>
                      <input
                        placeholder="module_slug"
                        value={addMmForm.module_slug}
                        onChange={e => setAddMmForm(f => ({ ...f, module_slug: e.target.value }))}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none"
                      />
                    </div>
                    <textarea
                      placeholder="Текст сообщения"
                      rows={3}
                      value={addMmForm.body}
                      onChange={e => setAddMmForm(f => ({ ...f, body: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none"
                    />
                    <input
                      type="datetime-local"
                      value={addMmForm.scheduled_at}
                      onChange={e => setAddMmForm(f => ({ ...f, scheduled_at: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={addMmLoading}
                        className="flex-1 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {addMmLoading ? "Создание…" : "Создать"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddComm(false)}
                        className="flex-1 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors"
                      >
                        Отмена
                      </button>
                    </div>
                  </form>
                )}

                {/* Comms list */}
                <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
                  {commLoading ? (
                    <Spinner />
                  ) : commList.length === 0 ? (
                    <div className="py-12 text-center text-gray-600 text-sm">Нет коммуникаций</div>
                  ) : (
                    commList.map(comm => {
                      const chcfg = CHANNEL_CFG[comm.channel];
                      const scfg  = COMM_STATUS_CFG[comm.status];
                      const isSelected = selectedComm?.id === comm.id;
                      return (
                        <button
                          key={comm.id}
                          onClick={() => setSelectedComm(comm)}
                          className={`w-full text-left px-4 py-3 transition-colors hover:bg-gray-800/50 ${
                            isSelected ? "bg-violet-900/20 border-l-2 border-violet-500" : "border-l-2 border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon name={chcfg.icon} size={12} className={chcfg.color} />
                            <span className="font-mono text-[10px] text-gray-600">{comm.comm_no}</span>
                            <StatusBadge label={scfg.label} badge={scfg.badge} />
                          </div>
                          <p className="text-sm font-medium text-gray-200 truncate">{comm.subject}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {comm.module_slug && (
                              <span className="text-[10px] text-gray-600 font-mono">{comm.module_slug}</span>
                            )}
                            <span className="text-[10px] text-gray-600">{AUDIENCE_LABELS[comm.audience]}</span>
                            <span className="ml-auto text-[10px] text-gray-700">{fmtDate(comm.updated_at)}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right column */}
              <div className="flex-1 overflow-y-auto bg-gray-900/30">
                {!selectedComm ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-700">
                    <Icon name="Send" size={40} className="mb-3 opacity-40" />
                    <p className="text-sm">Выберите коммуникацию</p>
                  </div>
                ) : (
                  <CommDetailPanel
                    comm={selectedComm}
                    events={commEvents}
                    eventsLoading={eventsLoading}
                    onCycleStatus={() => handleCycleCommStatus(selectedComm)}
                    onSend={() => handleSendComm(selectedComm)}
                    onCancel={() => handleCancelComm(selectedComm)}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

// ─── Content Detail Panel ────────────────────────────────────────────────────

type ContentDetailProps = {
  item: ContentItem;
  onCycleStatus: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onCreateComm: () => void;
  editingBody: boolean;
  editBodyValue: string;
  onStartEditBody: () => void;
  onEditBodyChange: (v: string) => void;
  onSaveBody: () => void;
  onCancelEditBody: () => void;
};

function ContentDetailPanel({
  item, onCycleStatus, onPublish, onArchive, onCreateComm,
  editingBody, editBodyValue, onStartEditBody, onEditBodyChange, onSaveBody, onCancelEditBody,
}: ContentDetailProps) {
  const scfg = CONTENT_STATUS_CFG[item.status];
  const tcfg = CONTENT_TYPE_CFG[item.type];

  return (
    <div className="px-6 py-5 space-y-5 max-w-3xl">

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-gray-600">{item.content_no}</span>
        </div>
        <h1 className="text-xl font-bold text-white leading-snug">{item.title}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge
            label={scfg.label}
            badge={scfg.badge}
            onClick={onCycleStatus}
          />
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-700 bg-gray-800 ${tcfg.color}`}>
            {tcfg.label}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-700 bg-gray-800 text-gray-400">
            {AUDIENCE_LABELS[item.audience]}
          </span>
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-3 bg-gray-900 rounded-xl p-4 border border-gray-800">
        <MetaField label="Модуль"     value={item.module_slug || "—"} mono />
        <MetaField label="Аудитория"  value={AUDIENCE_LABELS[item.audience]} />
        <MetaField label="Slug"       value={item.slug || "—"} mono />
        <MetaField label="Опубликован" value={fmtDate(item.published_at)} />
        <MetaField label="Создал"     value={item.created_by} />
        <MetaField label="Обновлён"   value={fmtDate(item.updated_at)} />
      </div>

      {/* Summary */}
      {item.summary && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Summary</p>
          <p className="text-sm text-gray-300">{item.summary}</p>
        </div>
      )}

      {/* Body markdown */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Body (Markdown)</p>
          {!editingBody && (
            <button
              onClick={onStartEditBody}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-violet-400 transition-colors"
            >
              <Icon name="Pencil" size={12} />
              Редактировать
            </button>
          )}
        </div>
        {editingBody ? (
          <div className="space-y-2">
            <textarea
              rows={10}
              value={editBodyValue}
              onChange={e => onEditBodyChange(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-violet-600 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={onSaveBody}
                className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-xs font-medium transition-colors"
              >
                Сохранить
              </button>
              <button
                onClick={onCancelEditBody}
                className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
            {item.body_markdown || <span className="text-gray-600 italic">Пусто</span>}
          </pre>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {item.status !== "published" && (
          <button
            onClick={onPublish}
            className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <Icon name="CheckCircle" size={13} />
            Опубликовать
          </button>
        )}
        {item.status !== "archived" && (
          <button
            onClick={onArchive}
            className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <Icon name="Archive" size={13} />
            Архивировать
          </button>
        )}
        <button
          onClick={onCreateComm}
          className="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
        >
          <Icon name="Send" size={13} />
          Создать коммуникацию
        </button>
      </div>
    </div>
  );
}

// ─── Comm Detail Panel ────────────────────────────────────────────────────────

type CommDetailProps = {
  comm: Communication;
  events: CommEvent[];
  eventsLoading: boolean;
  onCycleStatus: () => void;
  onSend: () => void;
  onCancel: () => void;
};

function CommDetailPanel({ comm, events, eventsLoading, onCycleStatus, onSend, onCancel }: CommDetailProps) {
  const scfg  = COMM_STATUS_CFG[comm.status];
  const chcfg = CHANNEL_CFG[comm.channel];

  return (
    <div className="px-6 py-5 space-y-5 max-w-3xl">

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-gray-600">{comm.comm_no}</span>
        </div>
        <h1 className="text-xl font-bold text-white leading-snug">{comm.subject}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge
            label={scfg.label}
            badge={scfg.badge}
            onClick={onCycleStatus}
          />
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-700 bg-gray-800 ${chcfg.color} flex items-center gap-1`}>
            <Icon name={chcfg.icon} size={10} />
            {chcfg.label}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-700 bg-gray-800 text-gray-400">
            {AUDIENCE_LABELS[comm.audience]}
          </span>
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-3 bg-gray-900 rounded-xl p-4 border border-gray-800">
        <MetaField label="Канал"       value={chcfg.label} />
        <MetaField label="Аудитория"   value={AUDIENCE_LABELS[comm.audience]} />
        <MetaField label="Модуль"      value={comm.module_slug || "—"} mono />
        <MetaField label="Запланирован" value={fmtDate(comm.scheduled_at)} />
        <MetaField label="Отправлен"   value={fmtDate(comm.sent_at)} />
        <MetaField label="Content ID"  value={comm.content_item_id != null ? String(comm.content_item_id) : "—"} mono />
        <MetaField label="Создал"      value={comm.created_by} />
        <MetaField label="Обновлён"    value={fmtDate(comm.updated_at)} />
      </div>

      {/* Body */}
      {comm.body && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Текст</p>
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{comm.body}</p>
        </div>
      )}

      {/* Events timeline */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="Activity" size={14} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-300">События</span>
        </div>
        {eventsLoading ? (
          <Spinner />
        ) : events.length === 0 ? (
          <p className="text-sm text-gray-600 py-4 text-center">Нет событий</p>
        ) : (
          <div className="space-y-2">
            {events.map(ev => {
              const ecfg = EVENT_CFG[ev.event_type] ?? { label: ev.event_type, color: "text-gray-500" };
              const hasMeta = ev.meta_json && Object.keys(ev.meta_json).length > 0;
              if (ev.event_type === "system_event") {
                return (
                  <div key={ev.id} className="text-center">
                    <span className="text-[10px] text-gray-600">{ecfg.label} · {fmtDate(ev.created_at)}</span>
                  </div>
                );
              }
              return (
                <div key={ev.id} className="flex items-start gap-3 py-1.5">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${ecfg.color.replace("text-", "bg-")}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${ecfg.color}`}>{ecfg.label}</span>
                      {ev.event_value && (
                        <span className="text-xs text-gray-500 truncate">{ev.event_value}</span>
                      )}
                      <span className="ml-auto text-[10px] text-gray-700 flex-shrink-0">{fmtDate(ev.created_at)}</span>
                    </div>
                    {hasMeta && (
                      <p className="text-[10px] text-gray-600 font-mono mt-0.5 truncate">
                        {JSON.stringify(ev.meta_json)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {(comm.status === "draft" || comm.status === "scheduled") && (
          <>
            <button
              onClick={onSend}
              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Icon name="Send" size={13} />
              Отправить сейчас
            </button>
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Icon name="X" size={13} />
              Отменить
            </button>
          </>
        )}
        {comm.status === "sent" && (
          <span className="text-xs text-emerald-400 bg-emerald-900/30 border border-emerald-800 px-3 py-1.5 rounded-lg font-medium">
            Отправлено
          </span>
        )}
      </div>
    </div>
  );
}

// ─── MetaField ────────────────────────────────────────────────────────────────

function MetaField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-xs text-gray-300 truncate ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
