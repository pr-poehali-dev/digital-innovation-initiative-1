import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { analytics } from "@/lib/analytics";
import { passportApi } from "@/lib/passportApi";

// ── Types ────────────────────────────────────────────────────────────

type Passport = {
  full_name: string; headline: string; short_bio: string;
  country: string; city: string; timezone: string;
  languages: string[]; primary_role: string;
  secondary_roles: string[]; years_experience: number | null;
  career_stage: string;
  target_roles: string[]; development_interests: string[]; industries: string[];
  work_preferences: Record<string, string>; career_goals: string[];
  links: Record<string, string>; avatar_url: string | null;
};

type EduItem = {
  id: number; institution: string; degree: string; field_of_study: string;
  start_date: string | null; end_date: string | null; is_current: boolean; description: string;
};
type WorkItem = {
  id: number; company_name: string; title: string; employment_type: string;
  start_date: string | null; end_date: string | null; is_current: boolean;
  description: string; achievements: string[]; skills: string[];
};
type Visibility = {
  profile_visibility: string; talent_directory_opt_in: boolean;
  show_competency_map: boolean; show_contact: boolean;
  show_experience_details: boolean; available_for_roles: boolean;
  availability_note: string | null;
};
type CompletionBlock = { key: string; label: string; score: number; max: number; done: boolean };
type Completion = { total_pct: number; blocks: CompletionBlock[]; missing: string[]; next_step: string | null };
type CompSnapshot = {
  total_assessed: number; total_evidence: number;
  average_level: number; strengths: { name: string; level: number }[];
  last_map_update: string | null;
};

type Tab = "profile" | "work" | "education" | "goals" | "visibility" | "summary";

// ── Helpers ──────────────────────────────────────────────────────────

const EMPTY_PASSPORT: Passport = {
  full_name: "", headline: "", short_bio: "", country: "", city: "", timezone: "",
  languages: [], primary_role: "", secondary_roles: [], years_experience: null,
  career_stage: "", target_roles: [], development_interests: [], industries: [],
  work_preferences: {}, career_goals: [], links: {}, avatar_url: null,
};

function Spinner() {
  return <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />;
}

function SaveBtn({ saving, onClick, disabled }: { saving: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={saving || disabled}
      className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
      {saving ? <Spinner /> : <Icon name="Save" size={14} />}
      {saving ? "Сохраняю..." : "Сохранить"}
    </button>
  );
}

function TagsInput({ label, tags, onChange }: { label: string; tags: string[]; onChange: (t: string[]) => void }) {
  const [inp, setInp] = useState("");
  const add = () => { const v = inp.trim(); if (v && !tags.includes(v)) { onChange([...tags, v]); setInp(""); } };
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full border border-slate-200">
            {t}
            <button onClick={() => onChange(tags.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 transition-colors ml-0.5">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={inp} onChange={e => setInp(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 bg-white"
          placeholder="Введите и нажмите Enter" />
        <button onClick={add} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold transition-colors">
          <Icon name="Plus" size={14} />
        </button>
      </div>
    </div>
  );
}

const inp = "w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-slate-400 bg-white transition-colors";
const lbl = "block text-xs font-semibold text-slate-600 mb-1.5";

// ── Profile Tab ───────────────────────────────────────────────────────

function ProfileTab({ passport, onRefresh }: { passport: Passport; onRefresh: () => void }) {
  const [form, setForm] = useState<Passport>(passport);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(passport); }, [passport]);

  const set = (k: keyof Passport, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    await passportApi.upsertMe({ ...form });
    setSaving(false);
    onRefresh();
  }

  const STAGES = ["student","early","mid","senior","lead","executive"];
  const LINK_KEYS = [
    { key: "linkedin", icon: "Linkedin", label: "LinkedIn" },
    { key: "website",  icon: "Globe",    label: "Сайт / портфолио" },
    { key: "github",   icon: "Github",   label: "GitHub" },
    { key: "telegram", icon: "Send",     label: "Telegram" },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={lbl}>Полное имя</label>
          <input className={inp} value={form.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Иван Петров" />
        </div>
        <div className="sm:col-span-2">
          <label className={lbl}>Профессиональный заголовок</label>
          <input className={inp} value={form.headline} onChange={e => set("headline", e.target.value)} placeholder="Senior Project Manager · Fintech · Remote" />
        </div>
        <div className="sm:col-span-2">
          <label className={lbl}>Кратко о себе</label>
          <textarea rows={3} className={`${inp} resize-none`} value={form.short_bio} onChange={e => set("short_bio", e.target.value)}
            placeholder="Кто вы как профессионал, чем занимаетесь, что важно..." />
        </div>
        <div>
          <label className={lbl}>Страна</label>
          <input className={inp} value={form.country} onChange={e => set("country", e.target.value)} placeholder="Россия" />
        </div>
        <div>
          <label className={lbl}>Город</label>
          <input className={inp} value={form.city} onChange={e => set("city", e.target.value)} placeholder="Москва" />
        </div>
        <div>
          <label className={lbl}>Основная роль</label>
          <input className={inp} value={form.primary_role} onChange={e => set("primary_role", e.target.value)} placeholder="Project Manager" />
        </div>
        <div>
          <label className={lbl}>Лет опыта</label>
          <input type="number" min={0} max={50} className={inp} value={form.years_experience ?? ""} onChange={e => set("years_experience", e.target.value ? Number(e.target.value) : null)} placeholder="5" />
        </div>
        <div className="sm:col-span-2">
          <label className={lbl}>Стадия карьеры</label>
          <div className="flex gap-2 flex-wrap">
            {STAGES.map(s => (
              <button key={s} onClick={() => set("career_stage", s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.career_stage === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <TagsInput label="Языки" tags={form.languages} onChange={v => set("languages", v)} />
      <TagsInput label="Дополнительные роли" tags={form.secondary_roles} onChange={v => set("secondary_roles", v)} />

      {/* Links */}
      <div>
        <label className={lbl}>Ссылки</label>
        <div className="space-y-2">
          {LINK_KEYS.map(({ key, icon, label }) => (
            <div key={key} className="flex items-center gap-2">
              <Icon name={icon} size={15} className="text-slate-400 flex-shrink-0" />
              <input className={`${inp} flex-1`} value={(form.links[key] as string) ?? ""} placeholder={label}
                onChange={e => set("links", { ...form.links, [key]: e.target.value })} />
            </div>
          ))}
        </div>
      </div>

      <SaveBtn saving={saving} onClick={save} />
    </div>
  );
}

// ── Work Tab ──────────────────────────────────────────────────────────

function WorkTab() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<WorkItem> | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showMsg(m: string) { setToast(m); setTimeout(() => setToast(null), 2000); }

  const load = useCallback(async () => {
    const d = await passportApi.workList();
    setItems((d.work_experience ?? []).filter((w: WorkItem) => w.company_name !== "[DELETED]"));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!editing?.company_name?.trim() || !editing?.title?.trim()) return;
    setSaving(true);
    await passportApi.workUpsert(editing);
    setSaving(false);
    setEditing(null);
    await load();
    showMsg("Сохранено");
  }

  async function del(id: number) {
    await passportApi.workDelete(id);
    await load();
  }

  const EMP_TYPES = ["full_time","part_time","contract","freelance","internship"];

  function formatDate(d: string | null) {
    if (!d) return ""; return d.slice(0, 7);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{items.length} записей</p>
        <button onClick={() => setEditing({ employment_type: "full_time", achievements: [], skills: [], is_current: false })}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl">
          <Icon name="Plus" size={14} /> Добавить опыт
        </button>
      </div>

      {loading && <div className="flex justify-center py-8"><Spinner /></div>}

      {!loading && items.length === 0 && (
        <div className="text-center py-10 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-2xl">
          Добавьте первый опыт работы
        </div>
      )}

      {items.map(item => (
        <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="text-sm text-slate-600">{item.company_name}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {item.start_date?.slice(0,7)} — {item.is_current ? "настоящее время" : item.end_date?.slice(0,7)}
                {" · "}{item.employment_type}
              </p>
              {item.description && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{item.description}</p>}
              {item.skills.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {item.skills.map((s, i) => <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{s}</span>)}
                </div>
              )}
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => setEditing({ ...item })} className="p-2 text-slate-400 hover:text-slate-700 transition-colors">
                <Icon name="Pencil" size={14} />
              </button>
              <button onClick={() => del(item.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                <Icon name="Trash2" size={14} />
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">{editing.id ? "Редактировать" : "Новый"} опыт работы</h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600"><Icon name="X" size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Компания *</label>
                <input className={inp} value={editing.company_name ?? ""} onChange={e => setEditing(f => ({ ...f!, company_name: e.target.value }))} placeholder="ООО Ромашка" />
              </div>
              <div>
                <label className={lbl}>Должность *</label>
                <input className={inp} value={editing.title ?? ""} onChange={e => setEditing(f => ({ ...f!, title: e.target.value }))} placeholder="Project Manager" />
              </div>
              <div>
                <label className={lbl}>Тип занятости</label>
                <select className={inp} value={editing.employment_type ?? "full_time"} onChange={e => setEditing(f => ({ ...f!, employment_type: e.target.value }))}>
                  {EMP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Начало</label>
                  <input type="month" className={inp} value={formatDate(editing.start_date ?? null)} onChange={e => setEditing(f => ({ ...f!, start_date: e.target.value ? e.target.value + "-01" : null }))} />
                </div>
                <div>
                  <label className={lbl}>Конец</label>
                  <input type="month" className={inp} disabled={!!editing.is_current} value={formatDate(editing.end_date ?? null)} onChange={e => setEditing(f => ({ ...f!, end_date: e.target.value ? e.target.value + "-01" : null }))} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!editing.is_current} onChange={e => setEditing(f => ({ ...f!, is_current: e.target.checked, end_date: e.target.checked ? null : f!.end_date }))} className="w-4 h-4 accent-slate-900" />
                <span className="text-sm text-slate-600">Работаю сейчас</span>
              </label>
              <div>
                <label className={lbl}>Описание</label>
                <textarea rows={3} className={`${inp} resize-none`} value={editing.description ?? ""} onChange={e => setEditing(f => ({ ...f!, description: e.target.value }))} placeholder="Чем занимались, какие результаты..." />
              </div>
              <div>
                <label className={lbl}>Навыки (через запятую)</label>
                <input className={inp} value={(editing.skills ?? []).join(", ")} onChange={e => setEditing(f => ({ ...f!, skills: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))} placeholder="PMBOK, Jira, Agile" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(null)} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl">Отмена</button>
              <button onClick={save} disabled={saving || !editing.company_name?.trim() || !editing.title?.trim()}
                className="flex-1 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl disabled:opacity-40">
                {saving ? "Сохраняю..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-24 right-4 px-4 py-2 bg-emerald-600 text-white text-sm rounded-xl shadow-lg z-50">{toast}</div>}
    </div>
  );
}

// ── Education Tab ─────────────────────────────────────────────────────

function EducationTab() {
  const [items, setItems] = useState<EduItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<EduItem> | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showMsg(m: string) { setToast(m); setTimeout(() => setToast(null), 2000); }

  const load = useCallback(async () => {
    const d = await passportApi.eduList();
    setItems((d.education ?? []).filter((e: EduItem) => e.institution !== "[DELETED]"));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!editing?.institution?.trim()) return;
    setSaving(true);
    await passportApi.eduUpsert(editing);
    setSaving(false);
    setEditing(null);
    await load();
    showMsg("Сохранено");
  }

  function formatDate(d: string | null) {
    if (!d) return ""; return d.slice(0, 7);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{items.length} записей</p>
        <button onClick={() => setEditing({ is_current: false })}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl">
          <Icon name="Plus" size={14} /> Добавить образование
        </button>
      </div>

      {loading && <div className="flex justify-center py-8"><Spinner /></div>}

      {!loading && items.length === 0 && (
        <div className="text-center py-10 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-2xl">
          Добавьте первое учебное заведение
        </div>
      )}

      {items.map(item => (
        <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{item.institution}</p>
              <p className="text-sm text-slate-600">{[item.degree, item.field_of_study].filter(Boolean).join(" · ")}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {item.start_date?.slice(0,7)} — {item.is_current ? "настоящее время" : item.end_date?.slice(0,7)}
              </p>
              {item.description && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{item.description}</p>}
            </div>
            <div className="flex gap-1">
              <button onClick={() => setEditing({ ...item })} className="p-2 text-slate-400 hover:text-slate-700 transition-colors"><Icon name="Pencil" size={14} /></button>
              <button onClick={async () => { await passportApi.eduDelete(item.id); await load(); }} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Icon name="Trash2" size={14} /></button>
            </div>
          </div>
        </div>
      ))}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">{editing.id ? "Редактировать" : "Новое"} образование</h3>
              <button onClick={() => setEditing(null)}><Icon name="X" size={18} className="text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Учебное заведение *</label>
                <input className={inp} value={editing.institution ?? ""} onChange={e => setEditing(f => ({ ...f!, institution: e.target.value }))} placeholder="МГУ, НИУ ВШЭ, Coursera..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Степень</label>
                  <input className={inp} value={editing.degree ?? ""} onChange={e => setEditing(f => ({ ...f!, degree: e.target.value }))} placeholder="Бакалавр, Магистр..." />
                </div>
                <div>
                  <label className={lbl}>Направление</label>
                  <input className={inp} value={editing.field_of_study ?? ""} onChange={e => setEditing(f => ({ ...f!, field_of_study: e.target.value }))} placeholder="Менеджмент" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Начало</label>
                  <input type="month" className={inp} value={formatDate(editing.start_date ?? null)} onChange={e => setEditing(f => ({ ...f!, start_date: e.target.value ? e.target.value + "-01" : null }))} />
                </div>
                <div>
                  <label className={lbl}>Конец</label>
                  <input type="month" className={inp} disabled={!!editing.is_current} value={formatDate(editing.end_date ?? null)} onChange={e => setEditing(f => ({ ...f!, end_date: e.target.value ? e.target.value + "-01" : null }))} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!editing.is_current} onChange={e => setEditing(f => ({ ...f!, is_current: e.target.checked }))} className="w-4 h-4 accent-slate-900" />
                <span className="text-sm text-slate-600">Учусь сейчас</span>
              </label>
              <div>
                <label className={lbl}>Описание</label>
                <textarea rows={2} className={`${inp} resize-none`} value={editing.description ?? ""} onChange={e => setEditing(f => ({ ...f!, description: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl">Отмена</button>
              <button onClick={save} disabled={saving || !editing.institution?.trim()}
                className="flex-1 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl disabled:opacity-40">
                {saving ? "Сохраняю..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-24 right-4 px-4 py-2 bg-emerald-600 text-white text-sm rounded-xl shadow-lg z-50">{toast}</div>}
    </div>
  );
}

// ── Goals Tab ─────────────────────────────────────────────────────────

function GoalsTab({ passport, onRefresh }: { passport: Passport; onRefresh: () => void }) {
  const [form, setForm] = useState({
    target_roles: passport.target_roles,
    development_interests: passport.development_interests,
    industries: passport.industries,
    career_goals: passport.career_goals,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      target_roles: passport.target_roles,
      development_interests: passport.development_interests,
      industries: passport.industries,
      career_goals: passport.career_goals,
    });
  }, [passport]);

  async function save() {
    setSaving(true);
    await passportApi.upsertMe(form);
    setSaving(false);
    onRefresh();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <TagsInput label="Целевые роли" tags={form.target_roles} onChange={v => setForm(f => ({ ...f, target_roles: v }))} />
      <TagsInput label="Интересы в развитии" tags={form.development_interests} onChange={v => setForm(f => ({ ...f, development_interests: v }))} />
      <TagsInput label="Отрасли" tags={form.industries} onChange={v => setForm(f => ({ ...f, industries: v }))} />

      <div>
        <label className={lbl}>Карьерные цели (каждая с новой строки)</label>
        <textarea rows={4} className={`${inp} resize-none`}
          value={form.career_goals.join("\n")}
          onChange={e => setForm(f => ({ ...f, career_goals: e.target.value.split("\n").filter(Boolean) }))}
          placeholder={"Стать Head of PMO к 2026 году\nРазвить компетенции в product management"} />
      </div>

      <SaveBtn saving={saving} onClick={save} />
    </div>
  );
}

// ── Visibility Tab ────────────────────────────────────────────────────

function VisibilityTab() {
  const [vis, setVis] = useState<Visibility>({
    profile_visibility: "private", talent_directory_opt_in: false,
    show_competency_map: false, show_contact: false,
    show_experience_details: true, available_for_roles: false,
    availability_note: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    passportApi.visibilityGet().then(d => {
      if (d.visibility) setVis(d.visibility);
      setLoading(false);
    });
  }, []);

  async function save() {
    setSaving(true);
    await passportApi.visibilityUpsert(vis);
    setSaving(false);
    setToast("Настройки сохранены"); setTimeout(() => setToast(null), 2000);
  }

  const Toggle = ({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${value ? "bg-slate-900" : "bg-slate-200"}`}>
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? "left-6" : "left-1"}`} />
      </button>
    </div>
  );

  const VIS_OPTIONS = [
    { value: "private",        label: "Закрытый", desc: "Никто не видит профиль, кроме вас" },
    { value: "limited",        label: "Ограниченный", desc: "Видят только те, кому вы отправили ссылку" },
    { value: "opt_in_public",  label: "Открытый (opt-in)", desc: "Виден в каталоге специалистов" },
  ];

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
        <Icon name="ShieldCheck" size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">По умолчанию ваш профиль закрыт. Любая видимость только по вашему явному согласию.</p>
      </div>

      {/* Profile visibility */}
      <div>
        <label className={lbl}>Видимость профиля</label>
        <div className="space-y-2">
          {VIS_OPTIONS.map(o => (
            <button key={o.value} onClick={() => setVis(v => ({ ...v, profile_visibility: o.value }))}
              className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-colors ${vis.profile_visibility === o.value ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-200 hover:border-slate-300"}`}>
              <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ${vis.profile_visibility === o.value ? "border-white bg-white" : "border-slate-300"}`} />
              <div>
                <p className={`text-sm font-semibold ${vis.profile_visibility === o.value ? "text-white" : "text-slate-800"}`}>{o.label}</p>
                <p className={`text-xs mt-0.5 ${vis.profile_visibility === o.value ? "text-slate-300" : "text-slate-500"}`}>{o.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5">
        <Toggle label="Попасть в каталог специалистов" desc="Работодатели смогут найти вас по компетенциям" value={vis.talent_directory_opt_in} onChange={v => setVis(f => ({ ...f, talent_directory_opt_in: v }))} />
        <Toggle label="Показывать карту компетенций" desc="Видны результаты W8.1 оценки" value={vis.show_competency_map} onChange={v => setVis(f => ({ ...f, show_competency_map: v }))} />
        <Toggle label="Показывать опыт работы" value={vis.show_experience_details} onChange={v => setVis(f => ({ ...f, show_experience_details: v }))} />
        <Toggle label="Открыт к предложениям" desc="Работодатели видят, что вы рассматриваете роли" value={vis.available_for_roles} onChange={v => setVis(f => ({ ...f, available_for_roles: v }))} />
      </div>

      {vis.available_for_roles && (
        <div>
          <label className={lbl}>Статус доступности (необязательно)</label>
          <input className={inp} value={vis.availability_note ?? ""} onChange={e => setVis(f => ({ ...f, availability_note: e.target.value || null }))} placeholder="Например: рассматриваю senior роли в fintech, remote" />
        </div>
      )}

      <SaveBtn saving={saving} onClick={save} />
      {toast && <div className="fixed bottom-24 right-4 px-4 py-2 bg-emerald-600 text-white text-sm rounded-xl shadow-lg z-50">{toast}</div>}
    </div>
  );
}

// ── Summary Tab ───────────────────────────────────────────────────────

type EvidenceDraft = {
  id: number;
  title: string;
  description: string;
  what_was_done: string;
  outcome: string;
  role_in_work: string;
  skills_demonstrated: string[];
  evidence_type: string;
  artifact_id: number;
  project_id: number;
  project_title: string;
  artifact_title: string;
  status: string;
  created_at: string;
};

function SummaryTab({ completion }: { completion: Completion | null }) {
  const [compSnap, setCompSnap] = useState<CompSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<EvidenceDraft[]>([]);
  const [openDraft, setOpenDraft] = useState<EvidenceDraft | null>(null);
  const [draftEdit, setDraftEdit] = useState<Partial<EvidenceDraft>>({});
  const [draftSaving, setDraftSaving] = useState(false);

  useEffect(() => {
    passportApi.summaryMe().then(d => {
      try {
        setCompSnap(d.summary?.competency_snapshot ?? null);
      } catch {
        setCompSnap(d.summary?.competency_snapshot ?? null);
      }
      setLoading(false);
    });
    passportApi.evidenceDraftsList().then((d: { drafts?: EvidenceDraft[] }) => {
      setDrafts(d.drafts || []);
    }).catch(() => {});
  }, []);

  const handleConfirm = async () => {
    if (!openDraft) return;
    setDraftSaving(true);
    try {
      await passportApi.evidenceDraftConfirm(openDraft.id, {
        title: draftEdit.title ?? openDraft.title,
        description: draftEdit.description ?? openDraft.description,
        what_was_done: draftEdit.what_was_done ?? openDraft.what_was_done,
        outcome: draftEdit.outcome ?? openDraft.outcome,
        role_in_work: draftEdit.role_in_work ?? openDraft.role_in_work,
        skills_demonstrated: draftEdit.skills_demonstrated ?? openDraft.skills_demonstrated,
      });
      setDrafts(prev => prev.filter(d => d.id !== openDraft.id));
      setOpenDraft(null);
    } finally {
      setDraftSaving(false);
    }
  };

  const handleReject = async (id: number) => {
    await passportApi.evidenceDraftReject(id);
    setDrafts(prev => prev.filter(d => d.id !== id));
    if (openDraft?.id === id) setOpenDraft(null);
  };

  const LEVEL_LABELS: Record<number, string> = { 1: "Aware", 2: "Working", 3: "Independent", 4: "Advanced", 5: "Leading" };
  const LEVEL_COLORS: Record<number, string> = {
    1: "bg-slate-100 text-slate-600", 2: "bg-blue-100 text-blue-700",
    3: "bg-violet-100 text-violet-700", 4: "bg-emerald-100 text-emerald-700", 5: "bg-amber-100 text-amber-700",
  };

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Completion */}
      {completion && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-800">Заполненность профиля</p>
            <span className={`text-2xl font-bold ${completion.total_pct >= 70 ? "text-emerald-600" : completion.total_pct >= 40 ? "text-amber-600" : "text-slate-400"}`}>
              {completion.total_pct}%
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full mb-4">
            <div className="h-2 bg-slate-900 rounded-full transition-all" style={{ width: `${completion.total_pct}%` }} />
          </div>
          <div className="space-y-2">
            {completion.blocks.map(b => (
              <div key={b.key} className="flex items-center gap-3">
                <Icon name={b.done ? "CheckCircle2" : "Circle"} size={14} className={b.done ? "text-emerald-500" : "text-slate-300"} />
                <span className="flex-1 text-xs text-slate-600">{b.label}</span>
                <span className="text-[10px] text-slate-400">{b.score}/{b.max}</span>
              </div>
            ))}
          </div>
          {completion.next_step && (
            <div className="mt-3 p-3 bg-slate-50 rounded-xl">
              <p className="text-xs text-slate-500">Следующий шаг: <span className="font-semibold text-slate-700">{completion.next_step}</span></p>
            </div>
          )}
        </div>
      )}

      {/* Competency snapshot */}
      {loading && <div className="flex justify-center py-6"><Spinner /></div>}
      {!loading && compSnap && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-800">Срез компетенций</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: "Оценено", v: compSnap.total_assessed, cls: "text-violet-600" },
              { l: "Подтверждений", v: compSnap.total_evidence, cls: "text-blue-600" },
              { l: "Средний уровень", v: compSnap.average_level, cls: "text-emerald-600" },
            ].map(({ l, v, cls }) => (
              <div key={l} className="text-center p-3 bg-slate-50 rounded-xl">
                <p className={`text-xl font-bold ${cls}`}>{v}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{l}</p>
              </div>
            ))}
          </div>
          {compSnap.strengths.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Сильные стороны</p>
              <div className="space-y-1.5">
                {compSnap.strengths.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${LEVEL_COLORS[s.level] ?? "bg-slate-100 text-slate-500"}`}>
                      {s.level} · {LEVEL_LABELS[s.level]}
                    </span>
                    <span className="text-xs text-slate-700">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {compSnap.last_map_update && (
            <p className="text-[10px] text-slate-400">Обновлено: {new Date(compSnap.last_map_update).toLocaleDateString("ru-RU")}</p>
          )}
          {compSnap.total_assessed === 0 && (
            <div className="text-center py-4 space-y-2">
              <p className="text-slate-400 text-sm">Карта компетенций пока не заполнена.</p>
              <div className="flex items-center justify-center gap-1.5">
                <Icon name="BookOpen" size={12} className="text-slate-400" />
                <p className="text-xs text-slate-400">
                  Не знаете, с чего начать?{" "}
                  <Link
                    to="/guide"
                    state={{ source: "profile_empty_state" }}
                    onClick={() => analytics.guideCtaClicked("open_guide", "profile_empty_state")}
                    className="text-violet-600 hover:text-violet-800 font-medium underline underline-offset-2 transition-colors"
                  >
                    Откройте инструкцию
                  </Link>
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evidence drafts from Workspace */}
      {drafts.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
              <Icon name="Package" size={13} className="text-violet-600" />
            </div>
            <span className="text-sm font-semibold text-slate-800">Черновики из Рабочего пространства</span>
            <span className="ml-auto text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              {drafts.length} {drafts.length === 1 ? "черновик" : "черновика"}
            </span>
          </div>
          <p className="text-xs text-slate-500">AI подготовил описание ваших результатов. Проверьте и подтвердите — они будут добавлены в профиль как evidence.</p>
          <div className="space-y-2">
            {drafts.map(d => (
              <div key={d.id} className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 leading-snug">{d.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      из «{d.project_title}» · {d.artifact_title}
                    </p>
                  </div>
                  <span className="text-[9px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full flex-shrink-0">черновик</span>
                </div>
                {d.outcome && (
                  <p className="text-xs text-slate-600 leading-snug">{d.outcome}</p>
                )}
                {d.skills_demonstrated?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {d.skills_demonstrated.slice(0, 4).map(s => (
                      <span key={s} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5 pt-0.5">
                  <button
                    onClick={() => { setOpenDraft(d); setDraftEdit({}); }}
                    className="flex-1 py-1.5 text-[11px] font-semibold bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    Проверить и подтвердить
                  </button>
                  <button
                    onClick={() => handleReject(d.id)}
                    className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-red-600 border border-slate-200 rounded-lg hover:border-red-200 transition-colors"
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Модал подтверждения черновика */}
      {openDraft && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOpenDraft(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="font-semibold text-slate-900">Подтвердить evidence</p>
                <p className="text-xs text-slate-400 mt-0.5">Отредактируй при необходимости — потом сохрани</p>
              </div>
              <button onClick={() => setOpenDraft(null)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100">
                <Icon name="X" size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-3">
              {[
                { key: "title",        label: "Название",         type: "input" as const },
                { key: "description",  label: "Описание",         type: "textarea" as const },
                { key: "what_was_done",label: "Что было сделано", type: "textarea" as const },
                { key: "outcome",      label: "Результат",        type: "textarea" as const },
                { key: "role_in_work", label: "Роль",             type: "input" as const },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{f.label}</label>
                  {f.type === "input" ? (
                    <input
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                      value={draftEdit[f.key as keyof EvidenceDraft] as string ?? openDraft[f.key as keyof EvidenceDraft] as string}
                      onChange={e => setDraftEdit(prev => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <textarea
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                      rows={2}
                      value={draftEdit[f.key as keyof EvidenceDraft] as string ?? openDraft[f.key as keyof EvidenceDraft] as string}
                      onChange={e => setDraftEdit(prev => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Навыки (через запятую)</label>
                <input
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  value={(draftEdit.skills_demonstrated ?? openDraft.skills_demonstrated).join(", ")}
                  onChange={e => setDraftEdit(prev => ({ ...prev, skills_demonstrated: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))}
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
              <button
                onClick={() => handleReject(openDraft.id)}
                className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
              >
                Отклонить
              </button>
              <button
                onClick={handleConfirm}
                disabled={draftSaving}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                {draftSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Сохраняю...</> : <>
                  <Icon name="CheckCircle2" size={15} />
                  Подтвердить evidence
                </>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy reminder */}
      <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <Icon name="Lock" size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">Данные профиля и карта компетенций видны только вам, если вы не изменили настройки видимости.</p>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────

export default function ProfessionalPassportPage() {
  const [tab, setTab] = useState<Tab>("profile");
  const [passport, setPassport] = useState<Passport>(EMPTY_PASSPORT);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPassport = useCallback(async () => {
    const [pp, cp] = await Promise.all([passportApi.getMe(), passportApi.completionMe()]);
    if (pp.passport) setPassport({ ...EMPTY_PASSPORT, ...pp.passport });
    setCompletion(cp.completion ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { loadPassport(); }, [loadPassport]);

  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key: "profile",    icon: "User",        label: "Профиль" },
    { key: "work",       icon: "Briefcase",   label: "Опыт" },
    { key: "education",  icon: "GraduationCap", label: "Образование" },
    { key: "goals",      icon: "Target",      label: "Цели" },
    { key: "visibility", icon: "Eye",         label: "Видимость" },
    { key: "summary",    icon: "BarChart2",   label: "Сводка" },
  ];

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                <Icon name="UserCircle" size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Профессиональный профиль</h1>
                <p className="text-sm text-slate-500">Professional Identity · PM/Operations</p>
              </div>
            </div>
            {/* Completion bar */}
            {completion && (
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-slate-200 rounded-full">
                  <div className="h-1.5 bg-slate-900 rounded-full transition-all" style={{ width: `${completion.total_pct}%` }} />
                </div>
                <span className="text-xs font-semibold text-slate-600">{completion.total_pct}%</span>
              </div>
            )}
          </div>

          {/* Tab nav */}
          <div className="flex gap-0.5 bg-slate-100 p-1 rounded-2xl mb-6 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
                  tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}>
                <Icon name={t.icon} size={13} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : (
            <>
              {tab === "profile"    && <ProfileTab passport={passport} onRefresh={loadPassport} />}
              {tab === "work"       && <WorkTab />}
              {tab === "education"  && <EducationTab />}
              {tab === "goals"      && <GoalsTab passport={passport} onRefresh={loadPassport} />}
              {tab === "visibility" && <VisibilityTab />}
              {tab === "summary"    && <SummaryTab completion={completion} />}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}