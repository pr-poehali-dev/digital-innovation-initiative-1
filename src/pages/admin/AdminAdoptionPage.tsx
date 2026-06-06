import { useState, useEffect, useCallback } from "react";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { adoptionApi, type AdoptionStats } from "@/lib/admin-api";

// ── Helpers ───────────────────────────────────────────────────────────

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

const EVENT_LABELS: Record<string, string> = {
  competency_map_loaded:                 "Загрузили карту",
  competency_map_domain_expanded:        "Раскрыли домен",
  competency_map_self_assessed:          "Self-assessment",
  competency_map_recommendation_clicked: "Клик рекомендации",
};

const STATUS_COLORS: Record<string, string> = {
  empty:   "bg-slate-500",
  partial: "bg-amber-500",
  ready:   "bg-emerald-500",
  unknown: "bg-gray-600",
};

// ── Period preset helpers ─────────────────────────────────────────────

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function presetDates(preset: "7d" | "30d" | "custom") {
  const to = new Date();
  const from = new Date();
  if (preset === "7d")  from.setDate(to.getDate() - 7);
  if (preset === "30d") from.setDate(to.getDate() - 30);
  return { from: isoDate(from), to: isoDate(to) };
}

// ── Sub-components ────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = "text-white" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function FunnelBar({ label, users, total, pctLoaded, pctPrev, isFirst }: {
  label: string; users: number; total: number; pctLoaded: number; pctPrev: number; isFirst: boolean;
}) {
  const width = Math.max(pctLoaded, 4);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span className="flex gap-3">
          <span className="text-white font-semibold">{fmt(users)} users</span>
          <span>{fmt(total)} events</span>
          {!isFirst && <span className="text-amber-400">← {pct(pctPrev)} from prev</span>}
          <span className="text-emerald-400">{pct(pctLoaded)} from loaded</span>
        </span>
      </div>
      <div className="h-7 bg-gray-800 rounded-lg overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-lg transition-all duration-500"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
        <Icon name="BarChart2" size={28} className="text-gray-600" />
      </div>
      <p className="text-gray-400 font-medium mb-1">Данных пока нет</p>
      <p className="text-gray-600 text-sm max-w-xs">
        События начнут появляться когда реальные пользователи откроют карту компетенций
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export default function AdminAdoptionPage() {
  const [preset, setPreset]   = useState<"7d" | "30d" | "custom">("30d");
  const [fromDate, setFrom]   = useState(() => presetDates("30d").from);
  const [toDate, setTo]       = useState(() => presetDates("30d").to);
  const [exclude, setExclude] = useState(true);
  const [stats, setStats]     = useState<AdoptionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async (from: string, to: string, excl: boolean) => {
    setLoading(true);
    setError(null);
    const res = await adoptionApi.getStats({ from_date: from, to_date: to, exclude_internal: excl });
    setLoading(false);
    if (res.ok) setStats(res.data);
    else setError("Не удалось загрузить данные");
  }, []);

  useEffect(() => {
    load(fromDate, toDate, exclude);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePreset(p: "7d" | "30d") {
    const { from, to } = presetDates(p);
    setPreset(p);
    setFrom(from);
    setTo(to);
    load(from, to, exclude);
  }

  function handleApply() {
    setPreset("custom");
    load(fromDate, toDate, exclude);
  }

  const s = stats?.summary;
  const hasData = (s?.loaded_users ?? 0) > 0;

  return (
    <AdminShell>
      <div className="p-6 max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Adoption — Competency Map</h1>
            <p className="text-sm text-gray-500 mt-0.5">Воронка и активность по карте компетенций</p>
          </div>
          {loading && (
            <div className="w-5 h-5 border-2 border-gray-700 border-t-emerald-500 rounded-full animate-spin" />
          )}
        </div>

        {/* Filters */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            {(["7d", "30d"] as const).map(p => (
              <button
                key={p}
                onClick={() => handlePreset(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  preset === p
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {p === "7d" ? "7 дней" : "30 дней"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              value={fromDate}
              onChange={e => { setFrom(e.target.value); setPreset("custom"); }}
              className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
            <span className="text-gray-600">—</span>
            <input
              type="date"
              value={toDate}
              onChange={e => { setTo(e.target.value); setPreset("custom"); }}
              className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
            <button
              onClick={handleApply}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
            >
              Применить
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-400 ml-auto cursor-pointer">
            <input
              type="checkbox"
              checked={exclude}
              onChange={e => { setExclude(e.target.checked); load(fromDate, toDate, e.target.checked); }}
              className="accent-emerald-500"
            />
            Исключить тестовых
          </label>
          {stats && (
            <span className="text-xs text-gray-600">
              {stats.period.from} — {stats.period.to}
            </span>
          )}
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {!loading && stats && !hasData && <EmptyState />}

        {stats && hasData && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <KpiCard label="Загрузили карту"    value={fmt(s!.loaded_users)}    color="text-white" />
              <KpiCard label="Раскрыли домен"     value={fmt(s!.expanded_users)}  color="text-gray-300" />
              <KpiCard label="Self-assessment"    value={fmt(s!.assessed_users)}  color="text-emerald-400" />
              <KpiCard label="Клик рекомендации"  value={fmt(s!.rec_click_users)} color="text-blue-400" />
              <KpiCard
                label="Loaded → Assessed"
                value={pct(s!.loaded_to_assessed_pct)}
                sub="конверсия"
                color={s!.loaded_to_assessed_pct >= 30 ? "text-emerald-400" : "text-amber-400"}
              />
              <KpiCard
                label="Loaded → Rec click"
                value={pct(s!.loaded_to_rec_pct)}
                sub="конверсия"
                color={s!.loaded_to_rec_pct >= 20 ? "text-emerald-400" : "text-amber-400"}
              />
            </div>

            {/* Funnel */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <p className="text-sm font-semibold text-white">Воронка</p>
              {stats.funnel.map((step, i) => (
                <FunnelBar
                  key={step.event}
                  label={EVENT_LABELS[step.event] ?? step.event}
                  users={step.unique_users}
                  total={step.total_events}
                  pctLoaded={step.from_loaded_pct}
                  pctPrev={step.from_prev_pct}
                  isFirst={i === 0}
                />
              ))}
            </div>

            {/* Daily trend + Map status */}
            <div className="grid lg:grid-cols-3 gap-4">

              {/* Daily trend */}
              <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-sm font-semibold text-white mb-4">Активность по дням</p>
                {stats.daily.length === 0 ? (
                  <p className="text-gray-600 text-sm">Нет данных за период</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-800">
                          <th className="text-left pb-2 font-medium">Дата</th>
                          <th className="text-right pb-2 font-medium text-white">Загрузили</th>
                          <th className="text-right pb-2 font-medium text-gray-400">Домен</th>
                          <th className="text-right pb-2 font-medium text-emerald-400">Оценили</th>
                          <th className="text-right pb-2 font-medium text-blue-400">Рек.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {[...stats.daily].reverse().map(row => (
                          <tr key={row.date} className="hover:bg-gray-800/30">
                            <td className="py-1.5 text-gray-400">{row.date}</td>
                            <td className="py-1.5 text-right text-white font-medium">{row.loaded}</td>
                            <td className="py-1.5 text-right text-gray-400">{row.expanded}</td>
                            <td className="py-1.5 text-right text-emerald-400">{row.assessed}</td>
                            <td className="py-1.5 text-right text-blue-400">{row.rec_clicked}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Map status breakdown */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-sm font-semibold text-white mb-4">Статус при первом входе</p>
                {stats.map_status.length === 0 ? (
                  <p className="text-gray-600 text-sm">Нет данных</p>
                ) : (
                  <div className="space-y-3">
                    {stats.map_status.map(row => {
                      const total = stats.map_status.reduce((a, r) => a + r.users, 0);
                      const w = total > 0 ? (row.users / total) * 100 : 0;
                      return (
                        <div key={row.status}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[row.status] ?? "bg-gray-600"}`} />
                              <span className="text-gray-300 capitalize">{row.status}</span>
                            </div>
                            <span className="text-white font-semibold">{row.users}</span>
                          </div>
                          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${STATUS_COLORS[row.status] ?? "bg-gray-600"}`}
                              style={{ width: `${Math.max(w, 4)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Landing CTA */}
            {stats.landing_cta.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-sm font-semibold text-white mb-4">Лендинг — клики по CTA</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-800">
                        <th className="text-left pb-2 font-medium">CTA ID</th>
                        <th className="text-right pb-2 font-medium">Users</th>
                        <th className="text-right pb-2 font-medium">Clicks</th>
                        <th className="text-right pb-2 font-medium">Clicks / User</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {stats.landing_cta.map(row => (
                        <tr key={row.cta_id} className="hover:bg-gray-800/30">
                          <td className="py-2 text-gray-300 font-mono">{row.cta_id}</td>
                          <td className="py-2 text-right text-white font-medium">{row.users}</td>
                          <td className="py-2 text-right text-gray-400">{row.clicks}</td>
                          <td className="py-2 text-right text-gray-500">
                            {row.users > 0 ? (row.clicks / row.users).toFixed(1) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </>
        )}
      </div>
    </AdminShell>
  );
}
