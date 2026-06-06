import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { publicProfileApi, type PublicView } from "@/lib/publicProfileApi";

const LEVEL_LABELS: Record<number, string> = {
  1: "Aware", 2: "Working", 3: "Independent", 4: "Advanced", 5: "Leading",
};
const LEVEL_COLORS: Record<number, string> = {
  3: "bg-violet-100 text-violet-700",
  4: "bg-emerald-100 text-emerald-700",
  5: "bg-amber-100 text-amber-700",
};
const LINK_ICONS: Record<string, string> = {
  linkedin: "Linkedin", website: "Globe", github: "Github", telegram: "Send",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );
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
      if (d.profile) { setView(d.profile); setStatus("ok"); return; }
      setStatus("not_found");
    }).catch(() => setStatus("not_found"));
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
      <p className="text-sm text-slate-500 max-w-xs">
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

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-2xl mx-auto px-4 py-8 pb-16">

        {/* Header card */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-700 rounded-2xl px-6 py-8 text-white mb-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Icon name="User" size={28} className="text-white/80" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold leading-tight">{view.full_name}</h1>
              {view.headline && (
                <p className="text-slate-300 text-sm mt-1">{view.headline}</p>
              )}
              <div className="flex flex-wrap gap-3 mt-3">
                {view.primary_role && (
                  <span className="flex items-center gap-1.5 text-xs text-white/80">
                    <Icon name="Briefcase" size={12} /> {view.primary_role}
                  </span>
                )}
                {view.years_experience != null && (
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

          {view.secondary_roles && view.secondary_roles.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {view.secondary_roles.map((r, i) => (
                <span key={i} className="text-xs px-2.5 py-1 bg-white/10 rounded-full text-white/80">{r}</span>
              ))}
            </div>
          )}

          {view.available_for_roles && (
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-full">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-xs text-emerald-300 font-medium">
                {view.availability_note || "Открыт к предложениям"}
              </span>
            </div>
          )}
        </div>

        {/* Verified signals */}
        {view.verified_signals && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3 mb-4">
            <Icon name="BadgeCheck" size={22} className="text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Verified Professional Signals</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {view.verified_signals.competencies_assessed} компетенций оценено
                {" · "}
                {view.verified_signals.learning_evidence_count} подтверждений обучения
              </p>
            </div>
          </div>
        )}

        {/* Body sections */}
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">

          {/* Bio */}
          {view.bio && (
            <div className="p-6">
              <Section title="О себе">
                <p className="text-sm text-slate-700 leading-relaxed">{view.bio}</p>
              </Section>
            </div>
          )}

          {/* Strengths */}
          {view.strengths && view.strengths.length > 0 && (
            <div className="p-6">
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
            </div>
          )}

          {/* Experience */}
          {view.experience && view.experience.length > 0 && (
            <div className="p-6">
              <Section title="Опыт работы">
                <div className="space-y-4">
                  {view.experience.map((exp, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon name="Building2" size={15} className="text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{exp.title}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{exp.company_name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {exp.start_date?.slice(0, 7)} — {exp.is_current ? "настоящее время" : exp.end_date?.slice(0, 7)}
                        </p>
                        {exp.description && (
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{exp.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {/* Education */}
          {view.education && view.education.length > 0 && (
            <div className="p-6">
              <Section title="Образование">
                <div className="space-y-3">
                  {view.education.map((edu, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon name="GraduationCap" size={15} className="text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{edu.institution}</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {[edu.degree, edu.field_of_study].filter(Boolean).join(" · ")}
                        </p>
                        {(edu.start_date || edu.end_date) && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {edu.start_date?.slice(0, 4)} — {edu.is_current ? "настоящее время" : edu.end_date?.slice(0, 4)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {/* Links */}
          {view.links && Object.entries(view.links).some(([, v]) => v) && (
            <div className="p-6">
              <Section title="Ссылки">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(view.links).filter(([, v]) => v).map(([k, v]) => (
                    <a key={k} href={v} target="_blank" rel="noreferrer noopener"
                      className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-colors">
                      <Icon name={LINK_ICONS[k] ?? "ExternalLink"} size={13} />
                      {k}
                      <Icon name="ExternalLink" size={10} className="text-slate-400" />
                    </a>
                  ))}
                </div>
              </Section>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-8">
          Профиль создан на платформе{" "}
          <a href="https://raven.moscow" className="underline underline-offset-2 hover:text-slate-600 transition-colors">
            Траектория
          </a>
        </p>
      </div>
    </div>
  );
}
