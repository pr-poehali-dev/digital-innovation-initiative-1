import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { Empty, ErrorBox, Loading, fmtDate } from "@/components/exec/ExecUI";
import PageGuide from "@/components/exec/PageGuide";
import ReminderQuickButton from "@/components/exec/ReminderQuickButton";
import { execPageGuides } from "@/config/execPageGuides";
import {
  docRegistryApi,
  DocMaterial,
  ContextPreview,
  SearchResult,
  LegacyMapItem,
} from "@/lib/docRegistryApi";

const TYPE_LABEL: Record<string, string> = {
  note: "Заметка",
  work_artifact: "Рабочий артефакт",
  ai_summary: "Сводка ИИ",
  legacy_ocr: "Legacy OCR-текст",
  legacy_record: "Legacy-запись",
  canonical_candidate: "Кандидат на канонический документ (файл доступен)",
  order: "Распоряжение",
  policy: "Положение",
  unknown: "Не установлен",
};

const ORIGIN_LABEL: Record<string, string> = {
  human: "создано человеком",
  ocr: "распознано (OCR)",
  ai_summary: "сформировано ИИ",
  legacy: "перенесено из старой базы",
  import: "импортировано",
  unknown: "не установлено",
};

const FILE_LABEL: Record<string, { label: string; cls: string }> = {
  present: { label: "Оригинал есть", cls: "bg-emerald-100 text-emerald-700" },
  absent: { label: "Оригинала нет", cls: "bg-slate-100 text-slate-600" },
  name_only_no_binary: { label: "Только имя файла", cls: "bg-amber-100 text-amber-700" },
  no_file: { label: "Без файла", cls: "bg-slate-100 text-slate-500" },
  unknown: { label: "Наличие не установлено", cls: "bg-amber-100 text-amber-700" },
};

const VERIFY_LABEL: Record<string, { label: string; cls: string }> = {
  unverified: { label: "Не проверен", cls: "bg-amber-100 text-amber-700" },
  checked_against_original: { label: "Сверен с оригиналом", cls: "bg-blue-100 text-blue-700" },
  confirmed: { label: "Подтверждён", cls: "bg-emerald-100 text-emerald-700" },
};

const SOURCE_STATUS_LABEL: Record<string, string> = {
  not_established: "Статус источника не установлен",
  draft: "Проект",
  approved: "Утверждён",
  in_force: "Введён в действие",
  repealed: "Утратил силу",
};

export default function ExecDocumentsPage() {
  const [items, setItems] = useState<DocMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [preview, setPreview] = useState<ContextPreview | null>(null);
  const [legacy, setLegacy] = useState<LegacyMapItem[]>([]);
  const [showLegacy, setShowLegacy] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    docRegistryApi
      .list()
      .then((d) => setItems(d.items))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    if (showLegacy && legacy.length === 0) {
      docRegistryApi
        .legacyMap()
        .then((d) => setLegacy(d.items))
        .catch((e) => setError((e as Error).message));
    }
  }, [showLegacy, legacy.length]);

  const runSearch = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setPreview(null);
    try {
      setSearch(await docRegistryApi.search(query.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setSearch(null);
    try {
      setPreview(await docRegistryApi.previewContext(query.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Icon name="Library" size={22} className="text-violet-600" />
            Документы и знания
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Единый реестр материалов. Каждый материал честно показывает: есть ли оригинал,
            откуда взялся текст и проверен ли он.
          </p>
        </div>

        <PageGuide {...execPageGuides.documents} />

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 flex items-start gap-2">
          <Icon name="Info" size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-900 leading-relaxed">
            Внешний AI сейчас отключён. Поиск и сборка контекста выполняются локально —
            данные никуда не передаются. Загрузка файла не запускает анализ.
          </div>
        </div>

        {error && <ErrorBox message={error} onRetry={load} />}

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Поиск по документам и знаниям"
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-violet-400"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={runSearch}
              disabled={busy || !query.trim()}
              className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white font-medium disabled:opacity-40"
            >
              Найти
            </button>
            <button
              onClick={runPreview}
              disabled={busy || !query.trim()}
              className="text-xs px-3 py-1.5 rounded-lg bg-white border border-violet-200 text-violet-700 font-medium disabled:opacity-40"
            >
              Показать контекст без отправки в AI
            </button>
          </div>
        </div>

        {preview && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <div className="font-semibold text-sm flex items-center gap-1.5 text-amber-900">
              <Icon name="Eye" size={15} />
              Предварительный просмотр контекста
            </div>
            <div className="text-xs text-amber-800 mt-1">
              Было бы передано: {preview.would_send_fragments} фрагм., {preview.would_send_chars} симв.
              (лимит {preview.budget}). Исключено политикой: {preview.excluded_by_policy}.
            </div>
            <div className="text-[11px] text-amber-700 mt-0.5 font-medium">{preview.note}</div>
            <div className="mt-2.5 space-y-2">
              {preview.fragments.length === 0 ? (
                <div className="text-xs text-amber-800">Подходящих фрагментов не найдено.</div>
              ) : (
                preview.fragments.map((f) => (
                  <div key={f.chunk_id} className="rounded-lg bg-white border border-amber-200 p-2.5">
                    <div className="text-[11px] text-muted-foreground flex flex-wrap gap-2">
                      <span className="font-medium text-slate-700">{f.document}</span>
                      <span>· {f.page}</span>
                      <span>· {f.verification}</span>
                      <span>· {ORIGIN_LABEL[f.origin_kind] || f.origin_kind}</span>
                      <span>· {f.chars} симв.</span>
                    </div>
                    <div className="text-xs mt-1.5 text-slate-700 line-clamp-4">{f.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {search && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-muted-foreground">
              Найдено: {search.chunks.length} фрагм. в документах, {search.entries.length} записей
            </div>
            {search.chunks.map((c) => (
              <div key={`c${c.chunk_id}`} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs font-medium">{c.document}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {c.page_number !== null ? `с. ${c.page_number}` : "Страница не установлена"} ·
                  фрагмент {c.chunk_index} · символы {c.char_start}–{c.char_end} ·{" "}
                  {ORIGIN_LABEL[c.origin_kind] || c.origin_kind}
                </div>
                <div className="text-xs mt-1.5 text-slate-600 line-clamp-3">{c.preview}</div>
              </div>
            ))}
            {search.entries.map((e) => (
              <div key={`e${e.entry_id}`} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs font-medium">{e.document}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {TYPE_LABEL[e.entry_type] || e.entry_type} ·{" "}
                  {ORIGIN_LABEL[e.origin_kind] || e.origin_kind}
                </div>
                <div className="text-xs mt-1.5 text-slate-600 line-clamp-3">{e.preview}</div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty text="Материалов пока нет" icon="Library" />
        ) : (
          <div>
            <div className="text-sm font-semibold mb-2 text-muted-foreground">
              Все материалы ({items.length})
            </div>
            <div className="space-y-2">
              {items.map((m) => {
                const file = FILE_LABEL[m.file_presence] || FILE_LABEL.unknown;
                const ver = VERIFY_LABEL[m.verification_state] || VERIFY_LABEL.unverified;
                return (
                  <div
                    key={`${m.material_kind}-${m.id}`}
                    className="rounded-xl border border-slate-200 bg-white p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm">{m.display_title}</div>
                      <ReminderQuickButton entityType="document" entityId={m.id} title={m.display_title} variant="icon" />
                    </div>
                    {m.display_title !== m.title && (
                      <div className="text-[11px] text-muted-foreground mt-0.5 italic">
                        Исходный заголовок: {m.title}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {TYPE_LABEL[m.type_code] || m.type_code}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${file.cls}`}>
                        {file.label}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${ver.cls}`}>
                        {ver.label}
                      </span>
                      {m.ai_usage_policy === "not_allowed" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100">
                          AI запрещён
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1.5">
                      {m.material_kind === "source"
                        ? SOURCE_STATUS_LABEL[m.source_status] || m.source_status
                        : ORIGIN_LABEL[m.origin_kind] || m.origin_kind}
                      {m.material_kind === "source" && (
                        <>
                          {" · "}
                          {m.revision_label || "Редакция не установлена"}
                          {" · "}
                          {m.page_count > 0 ? `${m.page_count} стр.` : "Страницы не установлены"}
                          {" · "}
                          {m.chunk_count} фрагм.
                        </>
                      )}
                      {" · "}
                      {fmtDate(m.updated_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <button
            onClick={() => setShowLegacy((v) => !v)}
            className="text-sm font-medium text-violet-600 flex items-center gap-1.5 hover:text-violet-700"
          >
            <Icon name={showLegacy ? "ChevronDown" : "ChevronRight"} size={16} />
            Перенос старых записей ({legacy.length || 6})
          </button>
          {showLegacy && (
            <div className="mt-3 space-y-2">
              {legacy.map((l) => (
                <div key={l.legacy_id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-medium">
                    №{l.legacy_id} → {l.target_title || "—"}
                  </div>
                  {l.migration_note && (
                    <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      {l.migration_note}
                    </div>
                  )}
                </div>
              ))}
              <div className="text-[11px] text-muted-foreground px-1">
                Исходные записи сохранены без изменений, резервная копия создана.
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}