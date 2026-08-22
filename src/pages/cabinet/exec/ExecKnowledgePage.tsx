import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Card, Empty, ErrorBox, Loading, Metric, fmtDate } from "@/components/exec/ExecUI";
import KnowledgeForm from "@/components/exec/KnowledgeForm";
import {
  DOC_TYPE_ICON,
  DOC_TYPE_LABEL,
  DOC_TYPE_STYLE,
  KnowledgeDetail,
  KnowledgeItem,
  knowledgeApi,
} from "@/lib/execKnowledgeApi";

function sizeText(item: KnowledgeItem): string {
  if (item.file_size) {
    const kb = item.file_size / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} МБ` : `${kb.toFixed(0)} КБ`;
  }
  if (item.extracted_length) return `${(item.extracted_length / 1000).toFixed(1)} тыс. знаков`;
  return "—";
}

export default function ExecKnowledgePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [form, setForm] = useState<{ open: boolean; item?: KnowledgeDetail | null }>({
    open: false,
  });
  const [busy, setBusy] = useState<number | null>(null);
  const [preview, setPreview] = useState<KnowledgeDetail | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    knowledgeApi
      .list()
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (typeFilter && i.doc_type !== typeFilter) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        (i.summary || "").toLowerCase().includes(q) ||
        (i.filename || "").toLowerCase().includes(q)
      );
    });
  }, [items, search, typeFilter]);

  const stats = useMemo(
    () => ({
      total: items.length,
      inAi: items.filter((i) => i.use_in_ai).length,
      files: items.filter((i) => i.filename).length,
      chunks: items.reduce((a, i) => a + (i.chunks || 0), 0),
    }),
    [items],
  );

  const toggleAi = async (item: KnowledgeItem) => {
    setBusy(item.id);
    try {
      await knowledgeApi.toggleAi(item.id, !item.use_in_ai);
      setItems((p) =>
        p.map((x) => (x.id === item.id ? { ...x, use_in_ai: !x.use_in_ai } : x)),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const openEdit = async (item: KnowledgeItem) => {
    try {
      const full = await knowledgeApi.get(item.id);
      setForm({ open: true, item: full });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openPreview = async (item: KnowledgeItem) => {
    try {
      setPreview(await knowledgeApi.get(item.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (item: KnowledgeItem) => {
    setBusy(item.id);
    try {
      await knowledgeApi.remove(item.id);
      setItems((p) => p.filter((x) => x.id !== item.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">База знаний</h1>
            <p className="text-sm text-slate-500 mt-1">
              Регламенты, матрицы и правила — AI опирается на них при планировании и советах
            </p>
          </div>
          <button
            onClick={() => setForm({ open: true })}
            className="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Icon name="Plus" size={15} />
            Добавить
          </button>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Документов" value={stats.total} icon="Library" />
          <Metric
            label="Учитывается AI"
            value={stats.inAi}
            icon="Sparkles"
            tone={stats.inAi ? "success" : "default"}
          />
          <Metric label="Файлов" value={stats.files} icon="FileText" />
          <Metric label="Фрагментов" value={stats.chunks} icon="ListTree" />
        </div>

        {error && <ErrorBox message={error} onRetry={load} />}

        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <Card title="База знаний" icon="Library">
            <div className="py-10 text-center">
              <Icon name="Library" size={34} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-900 font-medium">База знаний пуста</p>
              <p className="text-sm text-slate-500 mt-2 max-w-lg mx-auto leading-relaxed">
                Загрузите регламенты, матрицы ответственности и внутренние правила — и AI
                начнёт строить планы по вашему порядку: с нужными этапами, согласованиями и
                ролями.
              </p>
              <button
                onClick={() => setForm({ open: true })}
                className="mt-5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                <Icon name="Plus" size={15} />
                Добавить документ
              </button>
            </div>
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <Icon
                  name="Search"
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по названию и описанию"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:border-violet-500"
                />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-violet-500"
              >
                <option value="">Все типы</option>
                {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <Card
              title="Документы"
              subtitle={`${filtered.length} из ${items.length}`}
              icon="Library"
            >
              {filtered.length === 0 ? (
                <Empty text="Ничего не найдено" icon="SearchX" />
              ) : (
                <div className="space-y-2">
                  {filtered.map((item) => (
                    <div
                      key={item.id}
                      className={`group rounded-lg border p-3.5 transition-colors ${
                        item.use_in_ai
                          ? "border-violet-200 bg-violet-50/30"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            item.use_in_ai ? "bg-violet-100" : "bg-slate-100"
                          }`}
                        >
                          <Icon
                            name={DOC_TYPE_ICON[item.doc_type] || "File"}
                            size={16}
                            className={item.use_in_ai ? "text-violet-600" : "text-slate-500"}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => openPreview(item)}
                              className="text-sm font-medium text-slate-900 hover:text-violet-700 text-left leading-snug"
                            >
                              {item.title}
                            </button>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                DOC_TYPE_STYLE[item.doc_type] || DOC_TYPE_STYLE.other
                              }`}
                            >
                              {DOC_TYPE_LABEL[item.doc_type] || "Документ"}
                            </span>
                            {item.priority >= 90 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                                высокий приоритет
                              </span>
                            )}
                          </div>

                          {item.summary && (
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                              {item.summary}
                            </p>
                          )}

                          <div className="flex items-center gap-3 flex-wrap mt-1.5 text-[11px] text-slate-500">
                            {item.filename && (
                              <span className="flex items-center gap-1">
                                <Icon name="Paperclip" size={10} />
                                {item.filename}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Icon name="HardDrive" size={10} />
                              {sizeText(item)}
                            </span>
                            {item.page_count ? (
                              <span className="flex items-center gap-1">
                                <Icon name="FileText" size={10} />
                                {item.page_count} стр.
                              </span>
                            ) : null}
                            <span className="flex items-center gap-1">
                              <Icon name="ListTree" size={10} />
                              {item.chunks} фрагм.
                            </span>
                            <span className="flex items-center gap-1">
                              <Icon name="Calendar" size={10} />
                              {fmtDate(item.created_at)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => toggleAi(item)}
                            disabled={busy === item.id}
                            title={
                              item.use_in_ai
                                ? "AI учитывает этот документ — нажмите, чтобы отключить"
                                : "AI не учитывает — нажмите, чтобы включить"
                            }
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                              item.use_in_ai
                                ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}
                          >
                            <Icon name={item.use_in_ai ? "Sparkles" : "SparklesIcon"} size={12} fallback="Sparkles" />
                            {item.use_in_ai ? "В контексте AI" : "Выключен"}
                          </button>

                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEdit(item)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-violet-700 hover:bg-slate-100"
                              title="Изменить"
                            >
                              <Icon name="Pencil" size={13} />
                            </button>
                            <button
                              onClick={() => remove(item)}
                              disabled={busy === item.id}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100"
                              title="Убрать из базы"
                            >
                              <Icon name="Trash2" size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-start gap-2.5">
              <Icon name="Info" size={15} className="text-slate-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 leading-relaxed">
                Документы с пометкой «В контексте AI» подмешиваются в запрос, когда
                планировщик раскладывает задачу на шаги. Чем выше приоритет — тем важнее
                документ для AI. Ненужное можно временно отключить, не удаляя.
              </p>
            </div>
          </>
        )}
      </div>

      {form.open && (
        <KnowledgeForm
          item={form.item}
          onClose={() => setForm({ open: false })}
          onSaved={() => {
            setForm({ open: false });
            load();
          }}
        />
      )}

      {preview && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900">{preview.title}</h2>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      DOC_TYPE_STYLE[preview.doc_type] || DOC_TYPE_STYLE.other
                    }`}
                  >
                    {DOC_TYPE_LABEL[preview.doc_type] || "Документ"}
                  </span>
                  {preview.filename && (
                    <span className="text-xs text-slate-400">{preview.filename}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <Icon name="X" size={18} />
              </button>
            </header>
            <div className="p-5">
              {preview.summary && (
                <p className="text-sm text-slate-600 mb-4 pb-4 border-b border-slate-100">
                  {preview.summary}
                </p>
              )}
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-[55vh] overflow-y-auto">
                {preview.body || "Текст не извлечён"}
              </pre>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
