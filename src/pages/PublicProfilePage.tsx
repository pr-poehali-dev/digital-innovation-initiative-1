import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { publicProfileApi, type PublicView } from "@/lib/publicProfileApi";
import { analytics } from "@/lib/analytics";

function setPageMeta(title: string, description: string, url: string) {
  document.title = title;
  const setMeta = (sel: string, val: string) => {
    const el = document.querySelector(sel);
    if (el) el.setAttribute("content", val);
  };
  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', description);
  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = url;
}

const DEFAULT_TITLE = "Траектория — личный кабинет развития и обучения с AI";
const DEFAULT_DESC  = "Траектория — платформа развития человека: проекты, AI-презентации, карта компетенций, план карьерного роста";


const LEVEL_LABELS: Record<number, string> = {
  1: "Aware", 2: "Working", 3: "Independent", 4: "Advanced", 5: "Leading",
};
const LEVEL_COLORS: Record<number, string> = {
  3: "bg-violet-100 text-violet-700",
  4: "bg-emerald-100 text-emerald-700",
  5: "bg-amber-100 text-amber-700",
};
const LINK_META: Record<string, { icon: string; label: string }> = {
  linkedin:  { icon: "Linkedin",    label: "LinkedIn" },
  website:   { icon: "Globe",       label: "Сайт" },
  github:    { icon: "Github",      label: "GitHub" },
  telegram:  { icon: "Send",        label: "Telegram" },
  hh:        { icon: "FileText",    label: "HH" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  );
}

function SectionWrap({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>;
}

export default function PublicProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [view, setView] = useState<PublicView | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "not_found" | "private">("loading");

  useEffect(() => {
    if (!slug) { setStatus("not_found"); return; }
    publicProfileApi.getBySlug(slug).then((d: { error?: string; profile?: PublicView }) => {
      if (d.error === "not_found") { setStatus("not_found"); return; }
      if (d.error === "not_published") { setStatus("private"); return; }
      if (d.profile) {
        setView(d.profile);
        setStatus("ok");
        analytics.publicProfileViewed(slug);
        const p = d.profile;
        const title = p.full_name
          ? `${p.full_name}${p.primary_role ? ` — ${p.primary_role}` : ""} · Траектория`
          : "Публичный профиль · Траектория";
        const desc = [p.headline, p.bio].find(Boolean)?.slice(0, 160)
          ?? `Профессиональный профиль ${p.full_name || ""} на платформе Траектория`;
        setPageMeta(title, desc, window.location.href);
        return;
      }
      setStatus("not_found");
    }).catch(() => setStatus("not_found"));
    return () => setPageMeta(DEFAULT_TITLE, DEFAULT_DESC, window.location.origin);
  }, [slug]);

  if (status === "loading") return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
    </div>
  );

  if (status === "not_found" || status === "private") return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Icon name={status === "private" ? "EyeOff" : "UserX"} size={28} className="text-slate-400" />
      </div>
      <h1 className="text-xl font-bold text-slate-800 mb-2">
        {status === "private" ? "Профиль закрыт" : "Профиль не найден"}
      </h1>
      <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
        {status === "private"
          ? "Автор пока не опубликовал этот профиль."
          : "По этой ссылке профиль не существует или был удалён."}
      </p>
      <Link to="/" className="mt-6 text-sm text-slate-500 hover:text-slate-800 underline underline-offset-2 transition-colors">
        На главную
      </Link>
    </div>
  );

  if (!view) return null;

  // Считаем есть ли вообще хоть одна секция контента
  const hasBody = !!(
    view.bio ||
    (view.strengths && view.strengths.length > 0) ||
    (view.experience && view.experience.length > 0) ||
    (view.education && view.education.length > 0) ||
    (view.projects && view.projects.length > 0) ||
    (view.links && Object.values(view.links).some(Boolean))
  );

  const hasVerifiedSignals = !!(
    view.verified_signals &&
    (view.verified_signals.competencies_assessed > 0 || view.verified_signals.learning_evidence_count > 0)
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-2xl mx-auto px-3 py-6 pb-16 sm:px-4 sm:py-8 space-y-3">

        {/* Header card */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-700 rounded-2xl px-5 py-6 text-white sm:px-6 sm:py-8">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Icon name="User" size={26} className="text-white/80" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold leading-tight break-words">{view.full_name}</h1>
              {view.headline && (
                <p className="text-slate-300 text-sm mt-1 leading-snug break-words">{view.headline}</p>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
                {view.primary_role && (
                  <span className="flex items-center gap-1.5 text-xs text-white/80 min-w-0">
                    <Icon name="Briefcase" size={12} className="flex-shrink-0" />
                    <span className="truncate">{view.primary_role}</span>
                  </span>
                )}
                {view.years_experience != null && view.years_experience > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-white/80 flex-shrink-0">
                    <Icon name="Clock" size={12} />
                    {view.years_experience} {view.years_experience === 1 ? "год" : view.years_experience < 5 ? "года" : "лет"} опыта
                  </span>
                )}
                {view.location && (
                  <span className="flex items-center gap-1.5 text-xs text-white/80 min-w-0">
                    <Icon name="MapPin" size={12} className="flex-shrink-0" />
                    <span className="truncate">{view.location}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {view.secondary_roles && view.secondary_roles.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {view.secondary_roles.map((r, i) => (
                <span key={i} className="text-xs px-2.5 py-1 bg-white/10 rounded-full text-white/80 break-words">{r}</span>
              ))}
            </div>
          )}

          {view.available_for_roles && (
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-full max-w-full">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse flex-shrink-0" />
              <span className="text-xs text-emerald-300 font-medium truncate">
                {view.availability_note || "Открыт к предложениям"}
              </span>
            </div>
          )}
        </div>

        {/* Verified signals — только если есть реальные данные */}
        {hasVerifiedSignals && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3.5 flex items-center gap-3">
            <Icon name="BadgeCheck" size={20} className="text-emerald-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-800">Verified Professional Signals</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {view.verified_signals!.competencies_assessed > 0 && (
                  <>{view.verified_signals!.competencies_assessed} компетенций оценено</>
                )}
                {view.verified_signals!.competencies_assessed > 0 && view.verified_signals!.learning_evidence_count > 0 && " · "}
                {view.verified_signals!.learning_evidence_count > 0 && (
                  <>{view.verified_signals!.learning_evidence_count} подтверждений обучения</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Body sections */}
        {hasBody && (
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">

            {/* Bio */}
            {view.bio && (
              <SectionWrap>
                <Section title="О себе">
                  <p className="text-sm text-slate-700 leading-relaxed break-words">{view.bio}</p>
                </Section>
              </SectionWrap>
            )}

            {/* Strengths */}
            {view.strengths && view.strengths.length > 0 && (
              <SectionWrap>
                <Section title="Сильные стороны">
                  <div className="flex flex-wrap gap-2">
                    {view.strengths.map((s, i) => (
                      <span key={i}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${LEVEL_COLORS[s.level] ?? "bg-slate-100 text-slate-600"}`}>
                        {s.name} · {LEVEL_LABELS[s.level]}
                      </span>
                    ))}
                  </div>
                </Section>
              </SectionWrap>
            )}

            {/* Experience */}
            {view.experience && view.experience.length > 0 && (
              <SectionWrap>
                <Section title="Опыт работы">
                  <div className="space-y-4">
                    {view.experience.map((exp, i) => (
                      <div key={i} className="flex gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Icon name="Building2" size={15} className="text-slate-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 break-words">{exp.title}</p>
                          <p className="text-xs text-slate-600 mt-0.5 break-words">{exp.company_name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {exp.start_date?.slice(0, 7)}
                            {(exp.start_date || exp.is_current || exp.end_date) && " — "}
                            {exp.is_current ? "настоящее время" : exp.end_date?.slice(0, 7)}
                          </p>
                          {exp.description && (
                            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed break-words">{exp.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              </SectionWrap>
            )}

            {/* Education */}
            {view.education && view.education.length > 0 && (
              <SectionWrap>
                <Section title="Образование">
                  <div className="space-y-3">
                    {view.education.map((edu, i) => (
                      <div key={i} className="flex gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Icon name="GraduationCap" size={15} className="text-slate-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 break-words">{edu.institution}</p>
                          {(edu.degree || edu.field_of_study) && (
                            <p className="text-xs text-slate-600 mt-0.5 break-words">
                              {[edu.degree, edu.field_of_study].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          {(edu.start_date || edu.end_date || edu.is_current) && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              {edu.start_date?.slice(0, 4)}
                              {(edu.start_date || edu.is_current || edu.end_date) && " — "}
                              {edu.is_current ? "настоящее время" : edu.end_date?.slice(0, 4)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              </SectionWrap>
            )}

            {/* Projects */}
            {view.projects && view.projects.length > 0 && (
              <SectionWrap>
                <Section title="Проекты">
                  <div className="space-y-2.5">
                    {view.projects.map((project) => (
                      <div key={project.id}
                        className="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors"
                        onClick={() => analytics.publicProfileProjectClicked(project.id)}
                      >
                        <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Icon name="FolderOpen" size={15} className="text-violet-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 leading-tight break-words">{project.title}</p>
                          {project.description && (
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2 break-words">{project.description}</p>
                          )}
                          {project.updated_at && (
                            <p className="text-[11px] text-slate-400 mt-1">
                              Обновлён {project.updated_at.slice(0, 10)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              </SectionWrap>
            )}

            {/* Links */}
            {view.links && Object.entries(view.links).some(([, v]) => v) && (
              <SectionWrap>
                <Section title="Ссылки">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(view.links).filter(([, v]) => v).map(([k, v]) => {
                      const meta = LINK_META[k];
                      return (
                        <a key={k}
                          href={v}
                          target="_blank"
                          rel="noreferrer noopener"
                          onClick={() => analytics.publicProfileExternalLinkClicked(k, v)}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-colors max-w-full"
                        >
                          <Icon name={meta?.icon ?? "ExternalLink"} size={13} className="flex-shrink-0" />
                          <span className="truncate">{meta?.label ?? k}</span>
                          <Icon name="ExternalLink" size={10} className="text-slate-400 flex-shrink-0" />
                        </a>
                      );
                    })}
                  </div>
                </Section>
              </SectionWrap>
            )}
          </div>
        )}

        {/* Graceful empty — если нет ни одной секции */}
        {!hasBody && (
          <div className="bg-white rounded-2xl border border-slate-200 px-6 py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="FileText" size={20} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700">Профиль пока заполняется</p>
            <p className="text-xs text-slate-400 mt-1">Автор ещё не добавил информацию о себе.</p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 pt-2">
          Профиль создан на{" "}
          <a href="https://raven.moscow" className="underline underline-offset-2 hover:text-slate-600 transition-colors">
            Траектории
          </a>
        </p>
      </div>
    </div>
  );
}