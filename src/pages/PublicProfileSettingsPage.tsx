import { useState, useEffect, useCallback, useRef } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { publicProfileApi, type PublicSettings, type PublicView } from "@/lib/publicProfileApi";

// ── Constants ─────────────────────────────────────────────────────────

const APP_ORIGIN = window.location.origin;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$|^[a-z0-9]{1,2}$/;

// ── Helpers ──────────────────────────────────────────────────────────

function Spinner({ size = 5 }: { size?: number }) {
  return (
    <div className={`w-${size} h-${size} border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin flex-shrink-0`} />
  );
}

function Toggle({ label, desc, value, onChange }: {
  label: string; desc?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${value ? "bg-slate-900" : "bg-slate-200"}`}>
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? "left-6" : "left-1"}`} />
      </button>
    </div>
  );
}

// ── Copy link with fallback ──────────────────────────────────────────

async function copyToClipboard(text: string): Promise<"ok" | "fallback" | "error"> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return "ok";
    }
  } catch { /* fall through */ }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok ? "fallback" : "error";
  } catch {
    return "error";
  }
}

// ── Confirm Modal ─────────────────────────────────────────────────────

function ConfirmModal({ title, body, confirmLabel, confirmCls, onConfirm, onClose, loading }: {
  title: string;
  body: string;
  confirmLabel: string;
  confirmCls: string;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Icon name="Globe" size={18} className="text-slate-600" />
          </div>
          <div>
            <p className="text-base font-bold text-slate-900">{title}</p>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">{body}</p>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors disabled:opacity-40">
            Отмена
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 ${confirmCls}`}>
            {loading ? <Spinner size={4} /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manual copy fallback dialog ───────────────────────────────────────

function ManualCopyDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <p className="text-base font-bold text-slate-900">Скопируйте ссылку вручную</p>
        <p className="text-sm text-slate-500">Автокопирование недоступно в этом браузере.</p>
        <input ref={ref} readOnly value={url}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-violet-400 select-all"
          onFocus={e => e.target.select()}
        />
        <button onClick={onClose} className="w-full py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors">
          Закрыть
        </button>
      </div>
    </div>
  );
}

// ── Slug editor ───────────────────────────────────────────────────────

type SlugState = "idle" | "checking" | "available" | "taken" | "invalid" | "saved";

function SlugEditor({ settings, isPublished, onSaved }: {
  settings: PublicSettings | null;
  isPublished: boolean;
  onSaved: (slug: string, url: string) => void;
}) {
  const currentSlug = settings?.public_slug ?? "";
  const [value, setValue] = useState(currentSlug);
  const [state, setState] = useState<SlugState>(currentSlug ? "saved" : "idle");
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync if settings loaded after mount
  useEffect(() => {
    setValue(settings?.public_slug ?? "");
    setState(settings?.public_slug ? "saved" : "idle");
  }, [settings?.public_slug]);

  function validateFormat(s: string): boolean {
    return SLUG_RE.test(s);
  }

  function handleChange(raw: string) {
    const s = raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setValue(s);

    if (!s) { setState("idle"); return; }
    if (!validateFormat(s)) { setState("invalid"); return; }
    if (s === currentSlug) { setState("saved"); return; }

    setState("checking");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const d = await publicProfileApi.checkSlug(s) as { available?: boolean };
        setState(d.available ? "available" : "taken");
      } catch {
        setState("available"); // если проверка упала — даём попробовать сохранить
      }
    }, 400);
  }

  async function handleSave() {
    if (state !== "available" && state !== "idle") return;
    if (!value) return;
    setSaving(true);
    try {
      const d = await publicProfileApi.generateSlug(value) as { public_slug?: string; public_url?: string };
      if (d.public_slug) {
        onSaved(d.public_slug, d.public_url ?? `${APP_ORIGIN}/p/${d.public_slug}`);
        setState("saved");
      }
    } finally {
      setSaving(false);
    }
  }

  const statusMap: Record<SlugState, { icon: string; cls: string; text: string } | null> = {
    idle:      null,
    checking:  { icon: "Loader2", cls: "text-slate-400", text: "Проверяю..." },
    available: { icon: "CheckCircle2", cls: "text-emerald-500", text: "Доступен" },
    taken:     { icon: "XCircle", cls: "text-red-500", text: "Уже занят" },
    invalid:   { icon: "AlertCircle", cls: "text-amber-500", text: "Только латиница, цифры и дефис" },
    saved:     { icon: "CheckCircle2", cls: "text-emerald-500", text: "Сохранён" },
  };

  const status = statusMap[state];
  const canSave = (state === "available" || (!value && state === "idle")) && !saving;
  const showWarn = isPublished && value !== currentSlug && value && state === "available";
  const previewUrl = value ? `${APP_ORIGIN}/p/${value}` : null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5 space-y-3">
      <p className="text-sm font-semibold text-slate-800">Адрес публичной страницы</p>

      {/* Input */}
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-violet-400 focus-within:bg-white transition-colors">
        <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">{APP_ORIGIN}/p/</span>
        <input
          value={value}
          onChange={e => handleChange(e.target.value)}
          placeholder="your-name"
          maxLength={50}
          className="flex-1 min-w-0 bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none font-mono"
        />
        {state === "checking" && <Spinner size={4} />}
        {status && state !== "checking" && state !== "idle" && (
          <Icon name={status.icon} size={15} className={status.cls} />
        )}
      </div>

      {/* Status text */}
      {status && state !== "idle" && state !== "saved" && (
        <p className={`text-xs ${status.cls}`}>{status.text}</p>
      )}

      {/* Preview URL */}
      {previewUrl && state !== "invalid" && (
        <p className="text-xs text-slate-400 truncate">
          Страница будет доступна по адресу: <span className="text-slate-600 font-medium">{previewUrl}</span>
        </p>
      )}

      {/* Warn if published and slug changes */}
      {showWarn && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <Icon name="AlertTriangle" size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">После сохранения старая ссылка перестанет работать.</p>
        </div>
      )}

      {/* Action */}
      {value !== currentSlug && (
        <button onClick={handleSave} disabled={!canSave || saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
          {saving ? <Spinner size={4} /> : null}
          {currentSlug ? "Сохранить адрес" : "Создать публичную ссылку"}
        </button>
      )}

      {!value && (
        <p className="text-xs text-slate-400 text-center">Введите адрес публичной страницы</p>
      )}
    </div>
  );
}

// ── Preview pane ──────────────────────────────────────────────────────

const LEVEL_LABELS: Record<number, string> = { 1: "Aware", 2: "Working", 3: "Independent", 4: "Advanced", 5: "Leading" };
const LEVEL_COLORS: Record<number, string> = {
  3: "bg-violet-100 text-violet-700", 4: "bg-emerald-100 text-emerald-700", 5: "bg-amber-100 text-amber-700",
};

function ProfilePreview({ view }: { view: PublicView }) {
  const LINK_ICONS: Record<string, string> = { linkedin: "Linkedin", website: "Globe", github: "Github", telegram: "Send" };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-br from-slate-900 to-slate-700 px-6 py-8 text-white">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Icon name="User" size={28} className="text-white/80" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold">{view.full_name || "Имя не указано"}</h2>
            {view.headline && <p className="text-slate-300 text-sm mt-0.5">{view.headline}</p>}
            <div className="flex flex-wrap gap-3 mt-2">
              {view.primary_role && <span className="flex items-center gap-1.5 text-xs text-white/80"><Icon name="Briefcase" size={12} /> {view.primary_role}</span>}
              {view.years_experience && <span className="flex items-center gap-1.5 text-xs text-white/80"><Icon name="Clock" size={12} /> {view.years_experience} лет опыта</span>}
              {view.location && <span className="flex items-center gap-1.5 text-xs text-white/80"><Icon name="MapPin" size={12} /> {view.location}</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="p-6 space-y-4">
        {view.bio && <div><p className="text-xs font-semibold text-slate-500 uppercase mb-2">О себе</p><p className="text-sm text-slate-700 leading-relaxed">{view.bio}</p></div>}
        {view.strengths && view.strengths.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Сильные стороны</p>
            <div className="flex flex-wrap gap-2">
              {view.strengths.map((s, i) => <span key={i} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${LEVEL_COLORS[s.level] ?? "bg-slate-100 text-slate-600"}`}>{s.name} · {LEVEL_LABELS[s.level]}</span>)}
            </div>
          </div>
        )}
        {view.experience && view.experience.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Опыт работы</p>
            <div className="space-y-3">
              {view.experience.map((exp, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5"><Icon name="Building2" size={14} className="text-slate-500" /></div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{exp.title}</p>
                    <p className="text-xs text-slate-600">{exp.company_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{exp.start_date?.slice(0, 7)} — {exp.is_current ? "наст. время" : exp.end_date?.slice(0, 7)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {view.links && Object.keys(view.links).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Ссылки</p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(view.links).filter(([, v]) => v).map(([k, v]) => (
                <a key={k} href={v as string} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors">
                  <Icon name={LINK_ICONS[k] ?? "ExternalLink"} size={12} />{k}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────

type Modal = "publish" | "unpublish" | null;

export default function PublicProfileSettingsPage() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [preview,  setPreview]  = useState<PublicView | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [modal,    setModal]    = useState<Modal>(null);
  const [toast,    setToast]    = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showManualCopy, setShowManualCopy] = useState(false);

  function showMsg(text: string, tone: "ok" | "err" = "ok") {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 2800);
  }

  const load = useCallback(async () => {
    const [sm, pv] = await Promise.all([
      publicProfileApi.getMe(),
      publicProfileApi.previewMe(),
    ]);
    setSettings(sm.settings ?? null);
    setPreview(pv.preview ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(patch: Partial<PublicSettings>) {
    setSaving(true);
    const d = await publicProfileApi.upsertMe(patch);
    if (d.settings) setSettings(d.settings);
    setSaving(false);
  }

  async function toggleBool(key: keyof PublicSettings) {
    if (!settings) return;
    const val = !settings[key];
    setSettings(s => s ? { ...s, [key]: val } : s);
    await save({ [key]: val });
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      const d = await publicProfileApi.publish() as { settings?: PublicSettings; error?: string };
      if (d.settings) { setSettings(d.settings); showMsg("Профиль опубликован"); }
      else showMsg(d.error ?? "Не удалось опубликовать", "err");
    } finally { setPublishing(false); setModal(null); }
  }

  async function handleUnpublish() {
    setPublishing(true);
    try {
      const d = await publicProfileApi.unpublish() as { ok?: boolean; error?: string };
      if (d.ok !== false) {
        setSettings(s => s ? { ...s, is_published: false, published_at: null } : s);
        showMsg("Профиль скрыт");
      } else showMsg(d.error ?? "Не удалось снять с публикации", "err");
    } finally { setPublishing(false); setModal(null); }
  }

  async function handleCopyLink() {
    const url = settings?.public_url ?? `${APP_ORIGIN}/p/${settings?.public_slug}`;
    const result = await copyToClipboard(url);
    if (result === "error") {
      setShowManualCopy(true);
    } else {
      showMsg("Ссылка скопирована");
    }
  }

  function handleSlugSaved(slug: string, url: string) {
    setSettings(s => s ? { ...s, public_slug: slug, public_url: url } : {
      id: 0, user_id: 0, is_published: false,
      public_slug: slug, public_url: url,
      public_title: null, public_summary: null,
      show_headline: true, show_bio: true, show_location: false,
      show_roles: true, show_experience: true, show_education: true,
      show_links: true, show_competency_strengths: false,
      show_verified_evidence_summary: false, show_availability: false,
      show_contact: false, allow_indexing: false,
      published_at: null, updated_at: new Date().toISOString(),
    });
    showMsg("Адрес сохранён");
  }

  if (loading) return (
    <Layout>
      <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Spinner /></div>
    </Layout>
  );

  const isPublished = settings?.is_published ?? false;
  const hasSlug = Boolean(settings?.public_slug);
  const pubUrl = settings?.public_url ?? (hasSlug ? `${APP_ORIGIN}/p/${settings!.public_slug}` : null);

  const TOGGLE_SECTIONS = [
    { key: "show_headline",                  label: "Заголовок / специализация",       desc: undefined },
    { key: "show_bio",                       label: "О себе",                           desc: undefined },
    { key: "show_location",                  label: "Город / страна",                   desc: undefined },
    { key: "show_roles",                     label: "Роли (основная + дополнительные)", desc: undefined },
    { key: "show_experience",                label: "Опыт работы",                      desc: undefined },
    { key: "show_education",                 label: "Образование",                      desc: undefined },
    { key: "show_links",                     label: "Ссылки (LinkedIn, сайт...)",       desc: undefined },
    { key: "show_competency_strengths",      label: "Сильные стороны",                 desc: "Только компетенции уровня 3+ — gaps не показываются" },
    { key: "show_verified_evidence_summary", label: "Verified signals",                desc: "Счётчик подтверждённых компетенций и learning evidence" },
    { key: "show_availability",              label: "Открыт к предложениям",           desc: undefined },
  ] as const;

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 pb-24">
        <div className="max-w-2xl mx-auto px-4 py-6">

          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isPublished ? "bg-emerald-500" : "bg-slate-300"}`}>
              <Icon name={isPublished ? "Globe" : "EyeOff"} size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Публичный профиль</h1>
              <p className="text-sm text-slate-500">
                {isPublished ? "Опубликован · виден по ссылке" : "Приватный · виден только вам"}
              </p>
            </div>
          </div>

          {/* Status card */}
          <div className={`rounded-2xl border p-5 mb-5 ${isPublished ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"}`}>
            <div className="flex items-center gap-3 mb-4">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isPublished ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
              <span className={`text-sm font-semibold ${isPublished ? "text-emerald-800" : "text-slate-700"}`}>
                {isPublished ? "Профиль опубликован" : "Профиль приватный"}
              </span>
              {settings?.published_at && (
                <span className="text-xs text-slate-400 ml-auto">
                  с {new Date(settings.published_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                </span>
              )}
            </div>

            {/* URL row (only when has slug) */}
            {hasSlug && pubUrl && (
              <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2.5 mb-4">
                <Icon name="Link" size={13} className="text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-600 flex-1 truncate font-mono">
                  {pubUrl.replace(/^https?:\/\//, "")}
                </span>
                <button onClick={handleCopyLink}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors flex-shrink-0">
                  <Icon name="Copy" size={12} />
                  Копировать
                </button>
              </div>
            )}

            {/* Publish / Unpublish */}
            <div className="flex gap-2">
              {!isPublished ? (
                <button
                  onClick={() => setModal("publish")}
                  disabled={!hasSlug}
                  title={!hasSlug ? "Сначала создайте адрес страницы" : undefined}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  <Icon name="Globe" size={14} />
                  Опубликовать
                </button>
              ) : (
                <button onClick={() => setModal("unpublish")}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors">
                  <Icon name="EyeOff" size={14} />
                  Снять с публикации
                </button>
              )}
              {isPublished && pubUrl && (
                <a href={pubUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-medium rounded-xl transition-colors">
                  <Icon name="ExternalLink" size={14} />
                  Открыть
                </a>
              )}
            </div>

            {!hasSlug && (
              <p className="text-xs text-slate-400 mt-3 text-center">
                Создайте адрес страницы ниже, чтобы опубликовать профиль
              </p>
            )}
          </div>

          {/* Slug editor */}
          <SlugEditor
            settings={settings}
            isPublished={isPublished}
            onSaved={handleSlugSaved}
          />

          {/* Privacy notice */}
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl mb-5">
            <Icon name="ShieldCheck" size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800">Consent-first</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Профиль закрыт по умолчанию. Никакого каталога и рейтингов — только ссылка, которую вы сами раздаёте.
                Gaps и слабые стороны никогда не публикуются.
              </p>
            </div>
          </div>

          {/* Section toggles */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
            <p className="text-sm font-semibold text-slate-800 mb-3">Что показывать в профиле</p>
            {settings && TOGGLE_SECTIONS.map(({ key, label, desc }) => (
              <Toggle
                key={key}
                label={label}
                desc={desc}
                value={!!(settings as Record<string, unknown>)[key]}
                onChange={() => toggleBool(key as keyof PublicSettings)}
              />
            ))}
          </div>

          {/* Preview toggle */}
          <button onClick={() => setShowPreview(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-medium text-slate-700 hover:border-slate-300 transition-colors mb-4">
            <span className="flex items-center gap-2">
              <Icon name="Eye" size={15} className="text-slate-400" />
              {showPreview ? "Скрыть превью" : "Посмотреть превью профиля"}
            </span>
            <Icon name={showPreview ? "ChevronUp" : "ChevronDown"} size={16} className="text-slate-400" />
          </button>

          {showPreview && preview && <ProfilePreview view={preview} />}
        </div>
      </div>

      {/* Saving indicator */}
      {saving && (
        <div className="fixed bottom-6 right-4 flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-xs rounded-xl shadow-lg z-50">
          <Spinner size={4} /> Сохраняю...
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-4 px-4 py-2.5 text-white text-sm font-medium rounded-xl shadow-lg z-50 transition-all ${toast.tone === "err" ? "bg-red-600" : "bg-emerald-600"}`}>
          {toast.text}
        </div>
      )}

      {/* Confirm: Publish */}
      {modal === "publish" && (
        <ConfirmModal
          title="Опубликовать профиль?"
          body="Публичная страница станет доступна по ссылке и её можно будет отправлять другим."
          confirmLabel="Опубликовать"
          confirmCls="bg-slate-900 hover:bg-slate-800"
          onConfirm={handlePublish}
          onClose={() => setModal(null)}
          loading={publishing}
        />
      )}

      {/* Confirm: Unpublish */}
      {modal === "unpublish" && (
        <ConfirmModal
          title="Снять с публикации?"
          body="Публичная ссылка перестанет работать. Настройки профиля сохранятся."
          confirmLabel="Снять с публикации"
          confirmCls="bg-red-600 hover:bg-red-700"
          onConfirm={handleUnpublish}
          onClose={() => setModal(null)}
          loading={publishing}
        />
      )}

      {/* Manual copy fallback */}
      {showManualCopy && pubUrl && (
        <ManualCopyDialog url={pubUrl} onClose={() => setShowManualCopy(false)} />
      )}
    </Layout>
  );
}
