import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Dictionaries, execApi, Initiative, PersonRef } from "@/lib/execCabinetApi";
import { Badge, Card, Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import InitiativeForm from "@/components/exec/InitiativeForm";
import QuickStartForm from "@/components/exec/QuickStartForm";

export default function ExecInitiativesPage() {
  const navigate = useNavigate();
  const [quickStart, setQuickStart] = useState(false);
  const [items, setItems] = useState<Initiative[]>([]);
  const [dicts, setDicts] = useState<Dictionaries>({});
  const [persons, setPersons] = useState<PersonRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Initiative | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([execApi.initiatives(), execApi.refs()])
      .then(([r, refs]) => {
        setItems(r.items);
        setDicts(r.dictionaries);
        setPersons(refs.persons);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (q && !`${i.title} ${i.code || ""} ${i.owner_name || ""}`.toLowerCase().includes(q.toLowerCase()))
          return false;
        if (status && i.status !== status) return false;
        if (priority && i.priority !== priority) return false;
        return true;
      }),
    [items, q, status, priority],
  );

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (e: React.MouseEvent, i: Initiative) => {
    e.preventDefault();
    e.stopPropagation();
    setEditing(i);
    setFormOpen(true);
  };

  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Портфель инициатив</h1>
            <p className="text-sm text-slate-500 mt-1">
              Инициативы Блока внутреннего контроля и создаваемые решения
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuickStart(true)}
              className="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Icon name="Zap" size={15} />
              Быстрый старт
            </button>
            <button
              onClick={openNew}
              className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-700 hover:border-slate-300 text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Icon name="Plus" size={15} />
              Подробная форма
            </button>
          </div>
        </header>

        {quickStart && (
          <QuickStartForm
            onClose={() => setQuickStart(false)}
            onDone={(id) => navigate(`/cabinet/exec/initiatives/${id}`)}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Icon
              name="Search"
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по названию или владельцу"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 focus:border-slate-200 outline-none"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-slate-200"
          >
            <option value="">Все статусы</option>
            {(dicts.initiative_status || []).map((v) => (
              <option key={v.code} value={v.code}>
                {v.title}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-slate-200"
          >
            <option value="">Любой приоритет</option>
            {(dicts.priority || []).map((v) => (
              <option key={v.code} value={v.code}>
                {v.title}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <Card title="Инициативы" icon="Rocket">
            <Empty text={items.length ? "Ничего не найдено по фильтрам" : "Инициатив пока нет"} />
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((i) => (
              <Link
                key={i.id}
                to={`/cabinet/exec/initiatives/${i.id}`}
                className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors flex flex-col"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[11px] font-mono text-slate-400">{i.code || `#${i.id}`}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge dicts={dicts} type="priority" code={i.priority} />
                    <button
                      onClick={(e) => openEdit(e, i)}
                      title="Редактировать"
                      className="p-1 rounded text-slate-400 hover:text-violet-600 hover:bg-slate-100 transition-colors"
                    >
                      <Icon name="Pencil" size={13} />
                    </button>
                  </div>
                </div>
                <h3 className="text-sm font-medium text-slate-900 leading-snug flex-1">{i.title}</h3>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <Badge dicts={dicts} type="initiative_status" code={i.status} />
                  <Badge dicts={dicts} type="initiative_stage" code={i.stage} />
                </div>
                <div className="mt-3 pt-3 border-t border-slate-200 space-y-1">
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Icon name="User" size={11} />
                    {i.owner_name || <span className="text-red-600">владелец не назначен</span>}
                  </p>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Icon name="Calendar" size={11} />
                    {fmtDate(i.plan_end)}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                    <span className="flex items-center gap-1">
                      <Icon name="Users" size={11} />
                      {i.stakeholders_count ?? 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="GitPullRequest" size={11} />
                      {i.open_decisions ?? 0} открытых
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {formOpen && (
          <InitiativeForm
            initiative={editing}
            dicts={dicts}
            persons={persons}
            onClose={() => setFormOpen(false)}
            onSaved={() => {
              setFormOpen(false);
              load();
            }}
          />
        )}
      </div>
    </Layout>
  );
}