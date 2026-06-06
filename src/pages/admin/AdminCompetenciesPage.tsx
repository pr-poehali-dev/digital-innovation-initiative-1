import { useState, useEffect, useCallback } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { profApi } from "@/lib/profApi";
import { bridgeApi } from "@/lib/bridgeApi";

// ── Types ────────────────────────────────────────────────────────────

type Domain = { id: number; code: string; name: string; description: string; sort_order: number; competency_count: number };
type Competency = {
  id: number; domain_id: number; domain_name: string; code: string;
  name: string; description: string;
  level_descriptors: Record<string, string>;
  status: string; sort_order: number;
};
type RoleProfile = { id: number; code: string; name: string; description: string; target_count: number };
type RoleTarget = {
  competency_id: number; code: string; name: string; domain_name: string;
  target_level: number; importance: string;
  level_descriptors: Record<string, string>;
};
type RoleDetail = RoleProfile & { targets: RoleTarget[] };
type MapItem = {
  competency_id: number; code: string; name: string; domain_id: number; domain_name: string;
  level_descriptors: Record<string, string>;
  uc_id: number | null; current_level: number; confidence: string;
  last_assessed_at: string | null; evidence_count: number;
  target_level: number; importance: string; gap: number;
};
type GapSummary = {
  total_competencies: number; assessed: number; on_target: number; coverage_pct: number;
  strengths: { id: number; name: string; level: number; importance: string }[];
  critical_gaps: { id: number; name: string; gap: number; current: number; target: number; importance: string }[];
  quick_wins:   { id: number; name: string; current: number; target: number; evidence_count: number }[];
  recommended_next: { id: number; name: string; gap: number; importance: string }[];
};
type User = { id: number; name: string; email: string };
type ContentLink = {
  id: number; competency_id: number; competency_name: string;
  content_type: string; content_id: number | null;
  content_title: string; content_url: string;
  level_min: number | null; level_max: number | null;
  gap_min: number | null; gap_max: number | null;
  recommendation_strength: string; is_required: boolean;
  match_reason: string; sort_order: number; created_by: string; created_at: string;
};
type CatalogItem = { id: number; title: string; kind: string; content_type: string; module: string };

type Tab = "framework" | "roles" | "usermap" | "content_links";

// ── Helpers ──────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<number, string> = {
  0: "—", 1: "Aware", 2: "Working", 3: "Independent", 4: "Advanced", 5: "Leading",
};
const LEVEL_COLORS: Record<number, string> = {
  0: "bg-gray-800 text-gray-600 border-gray-700",
  1: "bg-gray-800 text-gray-500 border-gray-700",
  2: "bg-blue-900/30 text-blue-400 border-blue-800",
  3: "bg-violet-900/30 text-violet-400 border-violet-800",
  4: "bg-emerald-900/30 text-emerald-400 border-emerald-800",
  5: "bg-amber-900/30 text-amber-400 border-amber-800",
};
const IMP_COLORS: Record<string, string> = {
  core:      "text-red-400",
  important: "text-amber-400",
  supporting:"text-gray-500",
};
const DOMAIN_COLORS: Record<string, string> = {
  D1: "border-violet-800/40 bg-violet-900/10",
  D2: "border-blue-800/40 bg-blue-900/10",
  D3: "border-red-800/40 bg-red-900/10",
  D4: "border-amber-800/40 bg-amber-900/10",
  D5: "border-teal-800/40 bg-teal-900/10",
  D6: "border-emerald-800/40 bg-emerald-900/10",
};

function Spinner() {
  return <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />;
}

function LevelBadge({ level, size = "sm" }: { level: number; size?: "xs" | "sm" }) {
  const cls = LEVEL_COLORS[level] ?? LEVEL_COLORS[0];
  return (
    <span className={`inline-flex items-center gap-1 font-semibold border rounded-full px-2 py-0.5 ${size === "xs" ? "text-[9px]" : "text-[10px]"} ${cls}`}>
      {level > 0 && <span>{level}</span>}
      <span>{LEVEL_LABELS[level] ?? "—"}</span>
    </span>
  );
}

function LevelSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value))}
      className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-violet-600">
      {[0,1,2,3,4,5].map(l => (
        <option key={l} value={l}>{l} — {LEVEL_LABELS[l]}</option>
      ))}
    </select>
  );
}

// ── Framework Tab ─────────────────────────────────────────────────────

function FrameworkTab() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editComp, setEditComp] = useState<Partial<Competency> & { domain_id?: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showMsg(m: string) { setToast(m); setTimeout(() => setToast(null), 2500); }

  const load = useCallback(async () => {
    setLoading(true);
    const [dd, cc] = await Promise.all([profApi.domainsList(), profApi.competenciesList()]);
    setDomains(dd.domains ?? []);
    setCompetencies(cc.competencies ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const byDomain = (did: number) => competencies.filter(c => c.domain_id === did);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{domains.length} доменов · {competencies.length} компетенций · Вертикаль PM/Operations</p>
      </div>

      {loading && <div className="flex justify-center py-10"><Spinner /></div>}

      {!loading && domains.map(d => {
        const comps = byDomain(d.id);
        const isOpen = expanded === d.id;
        const dcol = DOMAIN_COLORS[d.code] ?? "border-gray-800 bg-gray-900";
        return (
          <div key={d.id} className={`border rounded-2xl overflow-hidden ${dcol}`}>
            {/* Domain header */}
            <button className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/5 transition-colors"
              onClick={() => setExpanded(isOpen ? null : d.id)}>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{d.code}</span>
                  <span className="text-[10px] text-gray-600">{d.competency_count} компетенций</span>
                </div>
                <p className="text-sm font-semibold text-gray-200">{d.name}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{d.description}</p>
              </div>
              <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} size={16} className="text-gray-600 flex-shrink-0" />
            </button>

            {/* Competencies list */}
            {isOpen && (
              <div className="border-t border-white/5">
                {comps.map((c, i) => (
                  <div key={c.id} className={`px-5 py-3 flex items-start gap-3 ${i < comps.length - 1 ? "border-b border-white/5" : ""} hover:bg-white/5 group`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[9px] font-mono text-gray-600">{c.code}</span>
                      </div>
                      <p className="text-xs font-semibold text-gray-200">{c.name}</p>
                      {c.description && <p className="text-[10px] text-gray-600 mt-0.5">{c.description}</p>}
                      {/* Level descriptors preview */}
                      {Object.keys(c.level_descriptors).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {[1,2,3,4,5].map(l => c.level_descriptors[String(l)] ? (
                            <span key={l} className={`text-[9px] px-1.5 py-0.5 rounded-full border ${LEVEL_COLORS[l]} cursor-help`}
                              title={c.level_descriptors[String(l)]}>
                              {l}: {c.level_descriptors[String(l)]?.slice(0, 32)}…
                            </span>
                          ) : null)}
                        </div>
                      )}
                    </div>
                    <button onClick={() => setEditComp(c)}
                      className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-violet-400 p-1 transition-all">
                      <Icon name="Pencil" size={12} />
                    </button>
                  </div>
                ))}
                <div className="px-5 py-2 border-t border-white/5">
                  <button onClick={() => setEditComp({ domain_id: d.id })}
                    className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1">
                    <Icon name="Plus" size={11} /> Добавить компетенцию
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Edit/create modal */}
      {editComp !== null && (
        <CompetencyModal
          comp={editComp}
          domains={domains}
          onClose={() => setEditComp(null)}
          onSaved={() => { setEditComp(null); load(); showMsg("Сохранено"); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium z-50 bg-emerald-900 text-emerald-300 border border-emerald-700">
          {toast}
        </div>
      )}
    </div>
  );
}

function CompetencyModal({ comp, domains, onClose, onSaved }: {
  comp: Partial<Competency> & { domain_id?: number };
  domains: Domain[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    id:          comp.id ?? undefined,
    domain_id:   comp.domain_id ?? domains[0]?.id ?? 0,
    name:        comp.name ?? "",
    description: comp.description ?? "",
    level_descriptors: comp.level_descriptors ?? {
      "0": "не оценивалось",
      "1": "", "2": "", "3": "", "4": "", "5": "",
    },
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    await profApi.competencyUpsert({ ...form, level_descriptors: form.level_descriptors });
    setSaving(false);
    onSaved();
  }

  const inp = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-100">{comp.id ? "Редактировать" : "Новая"} компетенция</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400"><Icon name="X" size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Домен</label>
            <select value={form.domain_id} onChange={e => setForm(f => ({ ...f, domain_id: Number(e.target.value) }))} className={inp}>
              {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Название *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inp} placeholder="Название компетенции" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Описание</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className={`${inp} resize-none`} />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-2 font-semibold uppercase">Дескрипторы уровней</label>
            <div className="space-y-2">
              {[1,2,3,4,5].map(l => (
                <div key={l} className="flex items-center gap-2">
                  <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${LEVEL_COLORS[l]}`}>{l}</span>
                  <input value={form.level_descriptors[String(l)] ?? ""} onChange={e => setForm(f => ({
                    ...f, level_descriptors: { ...f.level_descriptors, [String(l)]: e.target.value }
                  }))} className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-violet-600"
                    placeholder={`Уровень ${l}: ${LEVEL_LABELS[l]}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-xl">Отмена</button>
          <button onClick={save} disabled={saving || !form.name.trim()}
            className="flex-1 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl">
            {saving ? "Сохраняю..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Roles Tab ─────────────────────────────────────────────────────────

function RolesTab() {
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [selected, setSelected] = useState<RoleDetail | null>(null);
  const [allComps, setAllComps] = useState<Competency[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingTargets, setSavingTargets] = useState(false);
  const [editTargets, setEditTargets] = useState<Record<number, { level: number; importance: string }>>({});
  const [toast, setToast] = useState<string | null>(null);

  function showMsg(m: string) { setToast(m); setTimeout(() => setToast(null), 2500); }

  useEffect(() => {
    Promise.all([profApi.roleProfilesList(), profApi.competenciesList()]).then(([rr, cc]) => {
      setRoles(rr.role_profiles ?? []);
      setAllComps(cc.competencies ?? []);
      setLoading(false);
    });
  }, []);

  async function openRole(id: number) {
    setLoadingDetail(true);
    const d = await profApi.roleProfileGet(id);
    setSelected(d.role_profile ?? null);
    const init: Record<number, { level: number; importance: string }> = {};
    (d.role_profile?.targets ?? []).forEach((t: RoleTarget) => {
      init[t.competency_id] = { level: t.target_level, importance: t.importance };
    });
    setEditTargets(init);
    setLoadingDetail(false);
  }

  async function saveTargets() {
    if (!selected) return;
    setSavingTargets(true);
    const targets = Object.entries(editTargets).map(([cid, v]) => ({
      competency_id: Number(cid), target_level: v.level, importance: v.importance,
    }));
    await profApi.roleProfileTargetsUpsert({ role_profile_id: selected.id, targets });
    setSavingTargets(false);
    showMsg("Targets сохранены");
  }

  const IMP_OPTIONS = ["core","important","supporting"];
  const domains = [...new Set(allComps.map(c => c.domain_name))];

  return (
    <div className="flex gap-4 min-h-[600px]">
      {/* Roles list */}
      <div className="w-64 flex-shrink-0 space-y-2">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}
        {!loading && roles.map(r => (
          <button key={r.id} onClick={() => openRole(r.id)}
            className={`w-full text-left p-3 rounded-xl border transition-colors ${selected?.id === r.id ? "bg-violet-900/30 border-violet-800" : "bg-gray-900 border-gray-800 hover:border-gray-700"}`}>
            <p className="text-xs font-semibold text-gray-200">{r.name}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">{r.target_count} targets</p>
            {r.description && <p className="text-[9px] text-gray-700 mt-1 line-clamp-2">{r.description}</p>}
          </button>
        ))}
      </div>

      {/* Role detail */}
      <div className="flex-1 min-w-0">
        {!selected && !loadingDetail && (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            Выберите роль слева
          </div>
        )}
        {loadingDetail && <div className="flex justify-center py-10"><Spinner /></div>}
        {selected && !loadingDetail && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-bold text-gray-100">{selected.name}</p>
                <p className="text-[10px] text-gray-500">{selected.description}</p>
              </div>
              <button onClick={saveTargets} disabled={savingTargets}
                className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-xs font-semibold rounded-xl">
                {savingTargets ? <Spinner /> : <Icon name="Save" size={12} />} Сохранить targets
              </button>
            </div>

            {/* Matrix by domain */}
            {domains.map(domName => {
              const comps = allComps.filter(c => c.domain_name === domName);
              return (
                <div key={domName} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 border-b border-gray-800">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase">{domName}</p>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left text-[9px] text-gray-600 font-semibold uppercase px-3 py-2">Компетенция</th>
                        <th className="text-left text-[9px] text-gray-600 font-semibold uppercase px-3 py-2 w-36">Target уровень</th>
                        <th className="text-left text-[9px] text-gray-600 font-semibold uppercase px-3 py-2 w-32">Важность</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comps.map(c => {
                        const cur = editTargets[c.id] ?? { level: 0, importance: "supporting" };
                        return (
                          <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                            <td className="px-3 py-2">
                              <p className="text-xs text-gray-300">{c.name}</p>
                            </td>
                            <td className="px-3 py-2">
                              <LevelSelect value={cur.level}
                                onChange={v => setEditTargets(p => ({ ...p, [c.id]: { ...cur, level: v } }))} />
                            </td>
                            <td className="px-3 py-2">
                              <select value={cur.importance}
                                onChange={e => setEditTargets(p => ({ ...p, [c.id]: { ...cur, importance: e.target.value } }))}
                                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs focus:outline-none">
                                {IMP_OPTIONS.map(o => <option key={o} value={o} className={IMP_COLORS[o]}>{o}</option>)}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium z-50 bg-emerald-900 text-emerald-300 border border-emerald-700">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── User Map Tab ──────────────────────────────────────────────────────

function UserMapTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<number | null>(null);
  const [mapData, setMapData] = useState<MapItem[]>([]);
  const [gapData, setGapData] = useState<GapSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [editLevel, setEditLevel] = useState<{ item: MapItem; level: number } | null>(null);
  const [savingLevel, setSavingLevel] = useState(false);
  const [addEvidence, setAddEvidence] = useState<MapItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showMsg(m: string) { setToast(m); setTimeout(() => setToast(null), 2500); }

  useEffect(() => {
    profApi.roleProfilesList().then(rr => {
      setRoles(rr.role_profiles ?? []);
    });
    // Load users from admin-users endpoint
    import("@/lib/admin-api").then(({ getAdminToken }) => {
      const token = getAdminToken();
      fetch("https://functions.poehali.dev/8a915c0f-1259-4816-a8e3-14280bdb94ae/?action=admin_users_list&limit=50", {
        headers: { "X-Admin-Token": token },
      }).then(r => r.json()).then(d => setUsers(d.users ?? []));
    });
  }, []);

  const loadMap = useCallback(async (uid: number, rid: number | null) => {
    setLoading(true);
    const [mp, gp] = await Promise.all([
      profApi.userCompetencyMapGet(uid, rid ?? undefined),
      rid ? profApi.gapSummary(uid, rid) : Promise.resolve(null),
    ]);
    setMapData(mp.map ?? []);
    setGapData(gp?.gap_summary ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedUser) loadMap(selectedUser, selectedRole);
  }, [selectedUser, selectedRole, loadMap]);

  async function saveLevel() {
    if (!editLevel || !selectedUser) return;
    setSavingLevel(true);
    const item = editLevel.item;
    const res = await profApi.userCompetencyUpsert({
      user_id: selectedUser, competency_id: item.competency_id,
      current_level: editLevel.level, confidence: "medium",
    });
    setSavingLevel(false);
    setEditLevel(null);
    if (res.ok) { showMsg("Уровень сохранён"); loadMap(selectedUser, selectedRole); }
  }

  const domains = [...new Set(mapData.map(m => m.domain_name))];
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div>
          <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Пользователь</label>
          <select value={selectedUser ?? ""} onChange={e => setSelectedUser(Number(e.target.value) || null)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-violet-600 min-w-[200px]">
            <option value="">— выберите —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Целевая роль</label>
          <select value={selectedRole ?? ""} onChange={e => setSelectedRole(Number(e.target.value) || null)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-violet-600 min-w-[200px]">
            <option value="">— без роли —</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        {loading && <div className="mt-4"><Spinner /></div>}
      </div>

      {/* Gap Summary */}
      {gapData && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-[9px] text-gray-600 mb-0.5">Покрытие</p>
            <p className="text-2xl font-bold text-violet-400">{gapData.coverage_pct}%</p>
            <p className="text-[9px] text-gray-600">{gapData.assessed}/{gapData.total_competencies} оценено</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-[9px] text-gray-600 mb-0.5">На уровне</p>
            <p className="text-2xl font-bold text-emerald-400">{gapData.on_target}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-[9px] text-gray-600 mb-0.5">Критичных gap</p>
            <p className={`text-2xl font-bold ${gapData.critical_gaps.length > 0 ? "text-red-400" : "text-gray-500"}`}>{gapData.critical_gaps.length}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-[9px] text-gray-600 mb-0.5">Quick wins</p>
            <p className="text-2xl font-bold text-amber-400">{gapData.quick_wins.length}</p>
          </div>
        </div>
      )}

      {/* Gap sections */}
      {gapData && (
        <div className="grid grid-cols-2 gap-3">
          {gapData.critical_gaps.length > 0 && (
            <div className="bg-red-900/10 border border-red-800/40 rounded-xl p-4">
              <p className="text-[10px] text-red-400 font-semibold uppercase mb-2">Критичные gaps</p>
              {gapData.critical_gaps.map(g => (
                <div key={g.id} className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[9px] font-semibold ${IMP_COLORS[g.importance]}`}>{g.importance}</span>
                  <span className="text-xs text-gray-300 flex-1 truncate">{g.name}</span>
                  <span className="text-[9px] text-gray-500">{g.current}→{g.target}</span>
                  <span className="text-[9px] font-bold text-red-400">Δ{g.gap}</span>
                </div>
              ))}
            </div>
          )}
          {gapData.quick_wins.length > 0 && (
            <div className="bg-amber-900/10 border border-amber-800/40 rounded-xl p-4">
              <p className="text-[10px] text-amber-400 font-semibold uppercase mb-2">Quick wins (gap = 1)</p>
              {gapData.quick_wins.map(g => (
                <div key={g.id} className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-gray-300 flex-1 truncate">{g.name}</span>
                  <span className="text-[9px] text-gray-500">{g.current}→{g.target}</span>
                  {g.evidence_count > 0 && <span className="text-[9px] text-violet-400">{g.evidence_count} ev</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Competency heatmap */}
      {!loading && mapData.length > 0 && (
        <div className="space-y-3">
          {domains.map(domName => {
            const items = mapData.filter(m => m.domain_name === domName);
            return (
              <div key={domName} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-800">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase">{domName}</p>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-[9px] text-gray-600 px-3 py-2 font-semibold uppercase">Компетенция</th>
                      <th className="text-left text-[9px] text-gray-600 px-3 py-2 font-semibold uppercase w-28">Текущий</th>
                      {selectedRole && <th className="text-left text-[9px] text-gray-600 px-3 py-2 font-semibold uppercase w-24">Target</th>}
                      {selectedRole && <th className="text-left text-[9px] text-gray-600 px-3 py-2 font-semibold uppercase w-16">Gap</th>}
                      <th className="text-left text-[9px] text-gray-600 px-3 py-2 font-semibold uppercase w-16">Evidence</th>
                      <th className="w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const gapCls = item.gap > 1 ? "text-red-400 font-bold" : item.gap === 1 ? "text-amber-400 font-semibold" : "text-emerald-500";
                      return (
                        <tr key={item.competency_id} className="border-b border-gray-800/40 hover:bg-gray-800/20 group">
                          <td className="px-3 py-2">
                            <p className="text-xs text-gray-200">{item.name}</p>
                            {item.importance && <span className={`text-[9px] ${IMP_COLORS[item.importance]}`}>{item.importance}</span>}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <LevelBadge level={item.current_level} size="xs" />
                            </div>
                          </td>
                          {selectedRole && <td className="px-3 py-2">
                            {item.target_level > 0 ? <LevelBadge level={item.target_level} size="xs" /> : <span className="text-[9px] text-gray-700">—</span>}
                          </td>}
                          {selectedRole && <td className="px-3 py-2">
                            {item.target_level > 0 ? <span className={`text-xs ${gapCls}`}>{item.gap > 0 ? `−${item.gap}` : "✓"}</span> : null}
                          </td>}
                          <td className="px-3 py-2">
                            <button onClick={() => setAddEvidence(item)}
                              className={`text-[10px] flex items-center gap-1 ${item.evidence_count > 0 ? "text-violet-400" : "text-gray-700 hover:text-violet-400"} transition-colors`}>
                              <Icon name="FileCheck" size={10} />
                              {item.evidence_count > 0 ? item.evidence_count : "+"}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <button onClick={() => setEditLevel({ item, level: item.current_level })}
                              className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-violet-400 p-1 transition-all">
                              <Icon name="Pencil" size={11} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !selectedUser && (
        <div className="text-center py-12 text-gray-600 text-sm">Выберите пользователя для просмотра карты компетенций</div>
      )}

      {/* Edit level modal */}
      {editLevel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setEditLevel(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-100">Уровень: {editLevel.item.name}</h3>
              <button onClick={() => setEditLevel(null)}><Icon name="X" size={16} className="text-gray-600" /></button>
            </div>
            <div className="space-y-2">
              {[0,1,2,3,4,5].map(l => (
                <button key={l} onClick={() => setEditLevel(p => p ? { ...p, level: l } : null)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${editLevel.level === l ? "bg-violet-900/30 border-violet-700" : "bg-gray-800 border-gray-700 hover:border-gray-600"}`}>
                  <LevelBadge level={l} />
                  <span className="text-xs text-gray-400 flex-1 text-left">{editLevel.item.level_descriptors[String(l)] || "—"}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditLevel(null)} className="flex-1 px-4 py-2 bg-gray-800 text-gray-400 text-sm rounded-xl">Отмена</button>
              <button onClick={saveLevel} disabled={savingLevel}
                className="flex-1 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl">
                {savingLevel ? "..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add evidence modal */}
      {addEvidence && selectedUser && (
        <EvidenceModal
          item={addEvidence}
          userId={selectedUser}
          onClose={() => setAddEvidence(null)}
          onSaved={() => { setAddEvidence(null); showMsg("Evidence добавлен"); loadMap(selectedUser, selectedRole); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium z-50 bg-emerald-900 text-emerald-300 border border-emerald-700">
          {toast}
        </div>
      )}
    </div>
  );
}

function EvidenceModal({ item, userId, onClose, onSaved }: {
  item: MapItem; userId: number; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ evidence_type: "self_assessment", title: "", description: "", source_ref: "" });
  const [saving, setSaving] = useState(false);

  const EVIDENCE_TYPES = ["self_assessment","learning_completion","test_result","project_evidence","manager_review"];

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    // Ensure uc_id — upsert first
    const uc = await profApi.userCompetencyUpsert({
      user_id: userId, competency_id: item.competency_id,
      current_level: item.current_level, confidence: "medium",
    });
    const ucId = uc.uc_id ?? item.uc_id;
    if (ucId) {
      await profApi.evidenceAdd({ user_competency_id: ucId, ...form });
    }
    setSaving(false);
    onSaved();
  }

  const inp = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-100">Evidence: {item.name}</h3>
          <button onClick={onClose}><Icon name="X" size={16} className="text-gray-600" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Тип</label>
            <select value={form.evidence_type} onChange={e => setForm(f => ({ ...f, evidence_type: e.target.value }))} className={inp}>
              {EVIDENCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Заголовок *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inp} placeholder="Что подтверждает компетенцию?" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Описание</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className={`${inp} resize-none`} />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 font-semibold uppercase">Источник / ссылка</label>
            <input value={form.source_ref} onChange={e => setForm(f => ({ ...f, source_ref: e.target.value }))} className={inp} placeholder="URL, название курса, проекта..." />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-800 text-gray-400 text-sm rounded-xl">Отмена</button>
          <button onClick={save} disabled={saving || !form.title.trim()}
            className="flex-1 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl">
            {saving ? "Сохраняю..." : "Добавить"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Content Links Tab ─────────────────────────────────────────────────

function ContentLinksTab() {
  const [links, setLinks] = useState<ContentLink[]>([]);
  const [competencies, setCompetencies] = useState<{ id: number; name: string; domain_name: string }[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [filterComp, setFilterComp] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<ContentLink> | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [syncStatus, setSyncStatus] = useState<Record<string, number> | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [totalLearningEvidence, setTotalLearningEvidence] = useState<number | null>(null);

  function showMsg(m: string) { setToast(m); setTimeout(() => setToast(null), 2000); }

  async function loadSyncStatus() {
    const d = await bridgeApi.syncStatus();
    setSyncStatus(d.sync_status ?? {});
    setTotalLearningEvidence(d.total_learning_evidence ?? null);
  }

  async function runBackfill() {
    setBackfilling(true);
    const d = await bridgeApi.backfill();
    setBackfilling(false);
    showMsg(`Backfill: ${d.processed ?? 0} обработано, ${d.skipped ?? 0} пропущено, ${d.failed ?? 0} ошибок`);
    loadSyncStatus();
  }

  useEffect(() => { loadSyncStatus(); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [ll, cc] = await Promise.all([
      profApi.contentLinksList(filterComp ?? undefined),
      profApi.competenciesList(),
    ]);
    setLinks((ll.content_links ?? []).filter((l: ContentLink) => l.content_title !== "[DELETED]"));
    setCompetencies(cc.competencies ?? []);
    setLoading(false);
  }, [filterComp]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    profApi.contentCatalog({ q: catalogSearch, limit: "30" }).then(d => setCatalog(d.catalog ?? []));
  }, [catalogSearch]);

  async function save() {
    if (!editing?.competency_id || !editing?.content_title?.trim()) return;
    await profApi.contentLinkUpsert(editing);
    setEditing(null);
    await load();
    showMsg("Сохранено");
  }

  async function del(id: number) {
    await profApi.contentLinkDelete(id);
    await load();
  }

  const STRENGTH_CFG: Record<string, { cls: string }> = {
    high:   { cls: "bg-emerald-900/30 text-emerald-400 border-emerald-800" },
    medium: { cls: "bg-amber-900/30 text-amber-400 border-amber-800" },
    low:    { cls: "bg-gray-800 text-gray-500 border-gray-700" },
  };
  const inp = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600";
  const lbl = "block text-[10px] text-gray-500 mb-1 font-semibold uppercase";

  return (
    <div className="space-y-4">
      {/* W9.2 Sync status */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Icon name="RefreshCw" size={13} className="text-violet-400" />
          <span className="text-xs font-semibold text-gray-400">Evidence Sync</span>
        </div>
        {syncStatus && (
          <div className="flex gap-3 flex-wrap">
            {[
              ["processed", "Обработано", "text-emerald-400"],
              ["skipped",   "Пропущено",  "text-gray-500"],
              ["failed",    "Ошибок",     "text-red-400"],
            ].map(([k, l, cls]) => syncStatus[k] != null ? (
              <span key={k} className="flex items-center gap-1 text-[10px]">
                <span className={`font-bold ${cls}`}>{syncStatus[k]}</span>
                <span className="text-gray-600">{l}</span>
              </span>
            ) : null)}
            {totalLearningEvidence !== null && (
              <span className="flex items-center gap-1 text-[10px]">
                <span className="font-bold text-violet-400">{totalLearningEvidence}</span>
                <span className="text-gray-600">learning evidence всего</span>
              </span>
            )}
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={runBackfill} disabled={backfilling}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-900/30 hover:bg-violet-800/40 disabled:opacity-40 text-violet-400 border border-violet-800 rounded-lg text-[10px] font-semibold transition-colors">
            {backfilling ? <div className="w-3 h-3 border border-violet-400 border-t-transparent rounded-full animate-spin" /> : <Icon name="Zap" size={11} />}
            Backfill
          </button>
          <button onClick={() => bridgeApi.replay().then(() => { showMsg("Replay запущен"); loadSyncStatus(); })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 rounded-lg text-[10px] font-semibold transition-colors">
            <Icon name="RotateCcw" size={11} /> Replay failed
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterComp ?? ""} onChange={e => setFilterComp(Number(e.target.value) || null)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-violet-600">
          <option value="">— Все компетенции —</option>
          {competencies.map(c => (
            <option key={c.id} value={c.id}>{c.domain_name}: {c.name}</option>
          ))}
        </select>
        <button onClick={() => setEditing({ recommendation_strength: "medium", is_required: false })}
          className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-xs font-semibold rounded-xl">
          <Icon name="Plus" size={13} /> Добавить привязку
        </button>
        <span className="text-xs text-gray-600 ml-auto">{links.length} привязок</span>
      </div>

      {loading && <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && links.length === 0 && (
        <div className="text-center py-10 text-gray-600 text-sm border border-dashed border-gray-800 rounded-xl">
          Нет привязок. Добавьте связь между компетенцией и учебным материалом.
        </div>
      )}

      {/* Links grouped by competency */}
      {!loading && links.length > 0 && (() => {
        const grouped = links.reduce<Record<string, ContentLink[]>>((acc, l) => {
          const key = l.competency_name;
          if (!acc[key]) acc[key] = [];
          acc[key].push(l);
          return acc;
        }, {});
        return Object.entries(grouped).map(([compName, items]) => (
          <div key={compName} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400">{compName}</p>
              <span className="text-[9px] text-gray-600">{items.length} материалов</span>
            </div>
            {items.map(lk => (
              <div key={lk.id} className="px-4 py-3 flex items-start gap-3 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${STRENGTH_CFG[lk.recommendation_strength]?.cls ?? ""}`}>
                      {lk.recommendation_strength}
                    </span>
                    {lk.is_required && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-red-900/30 text-red-400 border-red-800">required</span>
                    )}
                    <span className="text-[9px] text-gray-600 font-mono">{lk.content_type}</span>
                    {(lk.level_min != null || lk.level_max != null) && (
                      <span className="text-[9px] text-gray-600">lvl {lk.level_min ?? "?"}-{lk.level_max ?? "?"}</span>
                    )}
                    {(lk.gap_min != null || lk.gap_max != null) && (
                      <span className="text-[9px] text-gray-600">gap {lk.gap_min ?? "?"}-{lk.gap_max ?? "?"}</span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-gray-200">{lk.content_title}</p>
                  {lk.content_url && (
                    <a href={lk.content_url} target="_blank" rel="noreferrer"
                      className="text-[10px] text-violet-400 hover:underline truncate block max-w-xs">
                      {lk.content_url}
                    </a>
                  )}
                  {lk.match_reason && <p className="text-[9px] text-gray-600 mt-0.5 italic">{lk.match_reason}</p>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                  <button onClick={() => setEditing({ ...lk })} className="p-1.5 text-gray-600 hover:text-violet-400 transition-colors">
                    <Icon name="Pencil" size={12} />
                  </button>
                  <button onClick={() => del(lk.id)} className="p-1.5 text-gray-600 hover:text-red-500 transition-colors">
                    <Icon name="Trash2" size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ));
      })()}

      {/* Edit/Create modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-100">{editing.id ? "Редактировать" : "Новая"} привязка контента</h3>
              <button onClick={() => setEditing(null)}><Icon name="X" size={16} className="text-gray-600" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={lbl}>Компетенция *</label>
                <select className={inp} value={editing.competency_id ?? ""} onChange={e => setEditing(f => ({ ...f!, competency_id: Number(e.target.value) }))}>
                  <option value="">— выберите —</option>
                  {competencies.map(c => <option key={c.id} value={c.id}>{c.domain_name}: {c.name}</option>)}
                </select>
              </div>
              {/* Catalog picker */}
              <div>
                <label className={lbl}>Поиск в каталоге (необязательно)</label>
                <input className={inp} placeholder="Название материала..." value={catalogSearch}
                  onChange={e => setCatalogSearch(e.target.value)} />
                {catalog.length > 0 && (
                  <div className="mt-1 border border-gray-700 rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                    {catalog.map(ci => (
                      <button key={`${ci.content_type}-${ci.id}`}
                        onClick={() => {
                          setEditing(f => ({
                            ...f!,
                            content_type: ci.content_type,
                            content_id: ci.id,
                            content_title: ci.title,
                          }));
                          setCatalogSearch("");
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-800 border-b border-gray-800/50 last:border-0">
                        <p className="text-xs text-gray-200">{ci.title}</p>
                        <p className="text-[9px] text-gray-600">{ci.content_type} · {ci.kind}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className={lbl}>Название материала *</label>
                <input className={inp} value={editing.content_title ?? ""} onChange={e => setEditing(f => ({ ...f!, content_title: e.target.value }))} placeholder="Название курса, модуля, практики..." />
              </div>
              <div>
                <label className={lbl}>URL (необязательно)</label>
                <input className={inp} value={editing.content_url ?? ""} onChange={e => setEditing(f => ({ ...f!, content_url: e.target.value }))} placeholder="https://..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Тип контента</label>
                  <select className={inp} value={editing.content_type ?? "admin_content"} onChange={e => setEditing(f => ({ ...f!, content_type: e.target.value }))}>
                    {["admin_content","education_item","course","module","lesson","practice","assessment","other"].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Сила рекомендации</label>
                  <select className={inp} value={editing.recommendation_strength ?? "medium"} onChange={e => setEditing(f => ({ ...f!, recommendation_strength: e.target.value }))}>
                    {["high","medium","low"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  ["level_min","Lvl от"], ["level_max","Lvl до"],
                  ["gap_min","Gap от"],  ["gap_max","Gap до"],
                ].map(([k, l]) => (
                  <div key={k}>
                    <label className={lbl}>{l}</label>
                    <input type="number" min={0} max={5} className={inp}
                      value={(editing[k as keyof ContentLink] as number) ?? ""}
                      onChange={e => setEditing(f => ({ ...f!, [k]: e.target.value ? Number(e.target.value) : null }))} />
                  </div>
                ))}
              </div>
              <div>
                <label className={lbl}>Причина рекомендации</label>
                <textarea rows={2} className={`${inp} resize-none`} value={editing.match_reason ?? ""}
                  onChange={e => setEditing(f => ({ ...f!, match_reason: e.target.value }))}
                  placeholder="Почему этот материал подходит для данной компетенции..." />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!editing.is_required} onChange={e => setEditing(f => ({ ...f!, is_required: e.target.checked }))} className="w-4 h-4 accent-violet-600" />
                <span className="text-sm text-gray-300">Обязательный материал</span>
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(null)} className="flex-1 px-4 py-2 bg-gray-800 text-gray-400 text-sm rounded-xl">Отмена</button>
              <button onClick={save} disabled={!editing.competency_id || !editing.content_title?.trim()}
                className="flex-1 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium z-50 bg-emerald-900 text-emerald-300 border border-emerald-700">{toast}</div>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function AdminCompetenciesPage() {
  const [tab, setTab] = useState<Tab>("framework");

  const TABS: { key: Tab; icon: string; label: string; desc: string }[] = [
    { key: "framework",    icon: "Layers",      label: "Фреймворк",       desc: "Домены и компетенции" },
    { key: "roles",        icon: "Briefcase",    label: "Ролевые профили", desc: "Targets по ролям" },
    { key: "usermap",      icon: "UserCheck",    label: "Карта пользователя", desc: "Уровни и gap-анализ" },
    { key: "content_links",icon: "Link",         label: "Контент",         desc: "Привязка материалов" },
  ];

  return (
    <AdminShell>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-100">Competency Map</h1>
          <p className="text-sm text-gray-500">PM/Operations · 6 доменов · 28 компетенций · 6-уровневая шкала</p>
        </div>

        {/* Tab nav */}
        <div className="flex gap-2 border-b border-gray-800 pb-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.key
                  ? "border-violet-500 text-violet-300"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}>
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "framework"     && <FrameworkTab />}
        {tab === "roles"         && <RolesTab />}
        {tab === "usermap"       && <UserMapTab />}
        {tab === "content_links" && <ContentLinksTab />}
      </div>
    </AdminShell>
  );
}