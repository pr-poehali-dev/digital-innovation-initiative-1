import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { publicProfileApi, type PublicSettings, type PublicView } from "@/lib/publicProfileApi";

// ── Helpers ──────────────────────────────────────────────────────────

function Spinner() {
  return <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />;
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

const LEVEL_LABELS: Record<number, string> = { 1: "Aware", 2: "Working", 3: "Independent", 4: "Advanced", 5: "Leading" };
const LEVEL_COLORS: Record<number, string> = {
  3: "bg-violet-100 text-violet-700", 4: "bg-emerald-100 text-emerald-700", 5: "bg-amber-100 text-amber-700",
};

// ── Preview pane ──────────────────────────────────────────────────────

function ProfilePreview({ view, settings }: { view: PublicView; settings: PublicSettings }) {
  const LINK_ICONS: Record<string, string> = { linkedin: "Linkedin", website: "Globe", github: "Github", telegram: "Send" };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-700 px-6 py-8 text-white">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Icon name="User" size={28} className="text-white/80" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold">{view.full_name || "Имя не указано"}</h2>
            {view.headline && <p className="text-slate-300 text-sm mt-0.5">{view.headline}</p>}
            <div className="flex flex-wrap gap-3 mt-2">
              {view.primary_role && (
                <span className="flex items-center gap-1.5 text-xs text-white/80">
                  <Icon name="Briefcase" size={12} /> {view.primary_role}
                </span>
              )}
              {view.years_experience && (
                <span className="flex items-center gap-1.5 text-xs text-white/80">
                  <Icon name="Clock" size={12} /> {view.years_experience} лет опыта
                </span>
              )}
              {view.location && (
                <span className="flex items-center gap-1.5 text-xs text-white/80">
                  <Icon name="MapPin" size={12} /> {view.location}
                </span>
              )}
            </div>
          </div>
        </div>
        {view.available_for_roles && (
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-full">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-xs text-emerald-300 font-medium">
              {view.availability_note || "Открыт к предложениям"}
            </span>
          </div>
        )}
      </div>

      <div className="p-6 space-y-5">
        {/* Bio */}
        {view.bio && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">О себе</p>
            <p className="text-sm text-slate-700 leading-relaxed">{view.bio}</p>
          </div>
        )}

        {/* Verified signals */}
        {view.verified_signals && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center gap-3">
            <Icon name="BadgeCheck" size={20} className="text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Verified Professional Signals</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {view.verified_signals.competencies_assessed} компетенций оценено · {view.verified_signals.learning_evidence_count} подтверждений обучения
              </p>
            </div>
          </div>
        )}

        {/* Strengths */}
        {view.strengths && view.strengths.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Сильные стороны</p>
            <div className="flex flex-wrap gap-2">
              {view.strengths.map((s, i) => (
                <span key={i} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${LEVEL_COLORS[s.level] ?? "bg-slate-100 text-slate-600"}`}>
                  {s.name} · {LEVEL_LABELS[s.level]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Experience */}
        {view.experience && view.experience.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Опыт работы</p>
            <div className="space-y-3">
              {view.experience.map((exp, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon name="Building2" size={14} className="text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{exp.title}</p>
                    <p className="text-xs text-slate-600">{exp.company_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {exp.start_date?.slice(0, 7)} — {exp.is_current ? "настоящее время" : exp.end_date?.slice(0, 7)}
                    </p>
                    {exp.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{exp.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {view.education && view.education.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Образование</p>
            <div className="space-y-2">
              {view.education.map((edu, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon name="GraduationCap" size={14} className="text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{edu.institution}</p>
                    <p className="text-xs text-slate-600">{[edu.degree, edu.field_of_study].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Links */}
        {view.links && Object.keys(view.links).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Ссылки</p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(view.links).filter(([, v]) => v).map(([k, v]) => (
                <a key={k} href={v as string} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors">
                  <Icon name={LINK_ICONS[k] ?? "ExternalLink"} size={12} />
                  {k}
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

export default function PublicProfileSettingsPage() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [preview,  setPreview]  = useState<PublicView | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [toast,    setToast]    = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  function showMsg(m: string) { setToast(m); setTimeout(() => setToast(null), 2500); }

  const load = useCallback(async () => {
    const [sm, pv] = await Promise.all([
      publicProfileApi.getMe(),
      publicProfileApi.previewMe(),
    ]);
    setSettings(sm.settings ?? null);
    setPreview(pv.preview ?? null);
    if (!sm.settings && pv.settings) setSettings(pv.settings);
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
    const d = await publicProfileApi.publish();
    if (d.settings) setSettings(d.settings);
    setPublishing(false);
    showMsg("Профиль опубликован");
  }

  async function handleUnpublish() {
    setPublishing(true);
    await publicProfileApi.unpublish();
    setSettings(s => s ? { ...s, is_published: false } : s);
    setPublishing(false);
    showMsg("Профиль скрыт");
  }

  async function regenerateSlug() {
    const name = prompt("Введите базу для URL (например ваше имя):");
    if (name === null) return;
    const d = await publicProfileApi.generateSlug(name || undefined);
    if (d.public_slug) {
      setSettings(s => s ? { ...s, public_slug: d.public_slug, public_url: d.public_url } : s);
      showMsg("URL обновлён");
    }
  }

  function copyLink() {
    if (!settings?.public_url) return;
    navigator.clipboard.writeText(settings.public_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return (
    <Layout>
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Spinner />
      </div>
    </Layout>
  );

  const isPublished = settings?.is_published ?? false;

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
    { key: "show_availability",              label: "Открыт к предложениям",           desc: "Статус доступности из настроек видимости" },
  ] as const;

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 pb-24">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3">
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
          </div>

          {/* Status card */}
          <div className={`rounded-2xl border p-5 mb-5 ${isPublished ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"}`}>
            <div className="flex items-center gap-3 mb-4">
              <span className={`w-2.5 h-2.5 rounded-full ${isPublished ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
              <span className={`text-sm font-semibold ${isPublished ? "text-emerald-800" : "text-slate-700"}`}>
                {isPublished ? "Профиль опубликован" : "Профиль приватный"}
              </span>
              {settings?.published_at && (
                <span className="text-xs text-slate-400 ml-auto">
                  с {new Date(settings.published_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                </span>
              )}
            </div>

            {/* Public URL */}
            {settings?.public_slug && (
              <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2.5 mb-4">
                <Icon name="Link" size={13} className="text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-600 flex-1 truncate">
                  raven.moscow/p/<span className="font-semibold text-slate-800">{settings.public_slug}</span>
                </span>
                <button onClick={copyLink}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors flex-shrink-0">
                  <Icon name={copied ? "Check" : "Copy"} size={12} />
                  {copied ? "Скопировано" : "Копировать"}
                </button>
                <button onClick={regenerateSlug}
                  className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 transition-colors flex-shrink-0">
                  <Icon name="RefreshCw" size={12} />
                </button>
              </div>
            )}

            <div className="flex gap-2">
              {!isPublished ? (
                <button onClick={handlePublish} disabled={publishing}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
                  {publishing ? <Spinner /> : <Icon name="Globe" size={14} />}
                  Опубликовать
                </button>
              ) : (
                <button onClick={handleUnpublish} disabled={publishing}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-sm font-semibold rounded-xl transition-colors">
                  {publishing ? <Spinner /> : <Icon name="EyeOff" size={14} />}
                  Скрыть профиль
                </button>
              )}
              {isPublished && (
                <a href={settings?.public_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-medium rounded-xl transition-colors">
                  <Icon name="ExternalLink" size={14} />
                  Открыть
                </a>
              )}
            </div>
          </div>

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

          {showPreview && preview && settings && (
            <ProfilePreview view={preview} settings={settings} />
          )}
        </div>
      </div>

      {saving && (
        <div className="fixed bottom-6 right-4 flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-xs rounded-xl shadow-lg z-50">
          <Spinner />
          Сохраняю...
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-4 px-4 py-2 bg-emerald-600 text-white text-sm rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </Layout>
  );
}
