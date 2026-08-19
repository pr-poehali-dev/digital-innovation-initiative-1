import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import {
  bizPresentationsApi,
  Presentation,
  Slide,
  SlideLayout,
  Block,
  BlockKind,
  LAYOUT_LABEL,
  COVER_COLORS,
} from "@/lib/bizPresentationsApi";
import BizSlide from "@/components/biz-presentation/BizSlide";
import BlockEditor from "@/components/biz-presentation/BlockEditor";

const LAYOUTS: SlideLayout[] = ["cover", "content", "metrics", "process", "roles", "quote", "closing"];
const BLOCK_KINDS: { kind: BlockKind; label: string; icon: string }[] = [
  { kind: "text", label: "Текст", icon: "AlignLeft" },
  { kind: "bullets", label: "Список", icon: "List" },
  { kind: "metrics", label: "Метрики", icon: "Gauge" },
  { kind: "cards", label: "Карточки", icon: "LayoutGrid" },
  { kind: "steps", label: "Шаги", icon: "GitBranch" },
  { kind: "roles", label: "Роли", icon: "Users" },
  { kind: "quote", label: "Цитата", icon: "Quote" },
  { kind: "banner", label: "Баннер", icon: "Megaphone" },
  { kind: "table", label: "Таблица", icon: "Table" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyBlock(kind: BlockKind): Block {
  const base = { id: uid(), kind };
  switch (kind) {
    case "bullets": return { ...base, items: [""] };
    case "metrics": return { ...base, metrics: [{ value: "", label: "" }] };
    case "cards": return { ...base, cards: [{ title: "", color: "violet" }] };
    case "steps": return { ...base, steps: [{ title: "", color: "violet" }] };
    case "roles": return { ...base, roles: [{ title: "", color: "violet" }] };
    case "table": return { ...base, headers: ["Колонка 1", "Колонка 2"], rows: [["", ""]] };
    default: return base;
  }
}

export default function BizPresentationEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingPres, setEditingPres] = useState(false);
  const [presForm, setPresForm] = useState({ title: "", subtitle: "", cover_color: "violet" });

  const load = useCallback(() => {
    setLoading(true);
    bizPresentationsApi
      .get(Number(id))
      .then((d) => {
        setPresentation(d.presentation);
        setSlides(d.slides);
        setPresForm({
          title: d.presentation.title,
          subtitle: d.presentation.subtitle || "",
          cover_color: d.presentation.cover_color,
        });
        if (d.slides.length > 0 && activeId === null) setActiveId(d.slides[0].id);
      })
      .catch(() => toast({ title: "Не удалось загрузить презентацию", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id, toast, activeId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const active = slides.find((s) => s.id === activeId) || null;

  const savePresMeta = async () => {
    if (!presentation) return;
    try {
      await bizPresentationsApi.update({ id: presentation.id, ...presForm });
      toast({ title: "Сохранено" });
      setEditingPres(false);
      load();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  };

  const addSlide = async () => {
    if (!presentation) return;
    try {
      const res = await bizPresentationsApi.slideAdd({
        presentation_id: presentation.id,
        layout: "content",
        title: "Новый слайд",
      });
      await load();
      setActiveId(res.id);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  };

  const removeSlide = async (sid: number) => {
    if (!confirm("Удалить слайд?")) return;
    try {
      await bizPresentationsApi.slideDelete(sid);
      if (activeId === sid) setActiveId(null);
      load();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  };

  const moveSlide = async (sid: number, dir: -1 | 1) => {
    const idx = slides.findIndex((s) => s.id === sid);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= slides.length) return;
    const next = [...slides];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setSlides(next);
    try {
      await bizPresentationsApi.slideReorder(next.map((s) => s.id));
    } catch {
      load();
    }
  };

  const [localSlide, setLocalSlide] = useState<Slide | null>(null);
  useEffect(() => setLocalSlide(active), [active]);

  const saveSlide = async () => {
    if (!localSlide) return;
    setSaving(true);
    try {
      await bizPresentationsApi.slideUpdate({
        id: localSlide.id,
        layout: localSlide.layout,
        title: localSlide.title,
        subtitle: localSlide.subtitle,
        blocks: localSlide.blocks,
      });
      toast({ title: "Слайд сохранён" });
      load();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addBlock = (kind: BlockKind) => {
    if (!localSlide) return;
    setLocalSlide({ ...localSlide, blocks: [...(localSlide.blocks || []), emptyBlock(kind)] });
  };

  const updateBlock = (bid: string, b: Block) => {
    if (!localSlide) return;
    setLocalSlide({
      ...localSlide,
      blocks: (localSlide.blocks || []).map((x) => (x.id === bid ? b : x)),
    });
  };

  const removeBlock = (bid: string) => {
    if (!localSlide) return;
    setLocalSlide({ ...localSlide, blocks: (localSlide.blocks || []).filter((x) => x.id !== bid) });
  };

  if (loading || !presentation) {
    return (
      <AdminShell>
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden flex-col">
        {/* Верхняя панель */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-800 bg-gray-950">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/admin/presentations" className="text-gray-500 hover:text-white transition-colors flex-shrink-0">
              <Icon name="ArrowLeft" size={18} />
            </Link>
            {editingPres ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={presForm.title}
                  onChange={(e) => setPresForm((f) => ({ ...f, title: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-600"
                />
                <input
                  value={presForm.subtitle}
                  onChange={(e) => setPresForm((f) => ({ ...f, subtitle: e.target.value }))}
                  placeholder="Подзаголовок"
                  className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-300 focus:outline-none focus:border-violet-600"
                />
                {COVER_COLORS.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => setPresForm((f) => ({ ...f, cover_color: c.code }))}
                    className={`w-5 h-5 rounded-full bg-gradient-to-br ${c.from} ${c.to} border-2 ${
                      presForm.cover_color === c.code ? "border-white" : "border-transparent"
                    }`}
                  />
                ))}
                <button onClick={savePresMeta} className="text-emerald-400 hover:text-emerald-300">
                  <Icon name="Check" size={16} />
                </button>
                <button onClick={() => setEditingPres(false)} className="text-gray-500 hover:text-white">
                  <Icon name="X" size={16} />
                </button>
              </div>
            ) : (
              <button onClick={() => setEditingPres(true)} className="flex items-center gap-2 min-w-0 group">
                <span className="text-sm font-semibold text-white truncate">{presentation.title}</span>
                <Icon name="Pencil" size={12} className="text-gray-600 group-hover:text-gray-400 flex-shrink-0" />
              </button>
            )}
          </div>
          <button
            onClick={() => navigate(`/admin/presentations/${presentation.id}/present`)}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            <Icon name="Play" size={13} />
            Показать
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Список слайдов */}
          <div className="w-56 flex-shrink-0 border-r border-gray-800 flex flex-col overflow-hidden bg-gray-950">
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {slides.map((s, i) => (
                <div
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className={`group cursor-pointer rounded-lg border px-2.5 py-2 transition-colors ${
                    activeId === s.id
                      ? "bg-violet-900/25 border-violet-600"
                      : "border-gray-800 hover:border-gray-700 bg-gray-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-mono text-gray-600">{i + 1}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button onClick={(e) => { e.stopPropagation(); moveSlide(s.id, -1); }} className="text-gray-500 hover:text-white">
                        <Icon name="ChevronUp" size={11} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); moveSlide(s.id, 1); }} className="text-gray-500 hover:text-white">
                        <Icon name="ChevronDown" size={11} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); removeSlide(s.id); }} className="text-gray-500 hover:text-red-400">
                        <Icon name="Trash2" size={11} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-200 truncate mt-0.5">{s.title || "Без названия"}</p>
                  <span className="text-[10px] text-gray-600">{LAYOUT_LABEL[s.layout]}</span>
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-gray-800">
              <button
                onClick={addSlide}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors"
              >
                <Icon name="Plus" size={13} />
                Слайд
              </button>
            </div>
          </div>

          {/* Редактор блоков */}
          <div className="w-80 flex-shrink-0 border-r border-gray-800 overflow-y-auto p-3 space-y-3 bg-gray-950">
            {localSlide ? (
              <>
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-[11px] text-gray-500 mb-1 block font-medium">Тип слайда</span>
                    <select
                      value={localSlide.layout}
                      onChange={(e) => setLocalSlide({ ...localSlide, layout: e.target.value as SlideLayout })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none"
                    >
                      {LAYOUTS.map((l) => (
                        <option key={l} value={l}>{LAYOUT_LABEL[l]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-gray-500 mb-1 block font-medium">Заголовок</span>
                    <input
                      value={localSlide.title || ""}
                      onChange={(e) => setLocalSlide({ ...localSlide, title: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-violet-600"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-gray-500 mb-1 block font-medium">Подзаголовок</span>
                    <input
                      value={localSlide.subtitle || ""}
                      onChange={(e) => setLocalSlide({ ...localSlide, subtitle: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-violet-600"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  {(localSlide.blocks || []).map((b) => (
                    <BlockEditor
                      key={b.id}
                      block={b}
                      onChange={(nb) => updateBlock(b.id, nb)}
                      onRemove={() => removeBlock(b.id)}
                    />
                  ))}
                </div>

                <div>
                  <p className="text-[11px] text-gray-500 mb-1.5 font-medium">Добавить блок</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {BLOCK_KINDS.map((bk) => (
                      <button
                        key={bk.kind}
                        onClick={() => addBlock(bk.kind)}
                        className="flex flex-col items-center gap-1 py-2 rounded-lg border border-gray-800 hover:border-violet-600 hover:bg-violet-900/10 text-gray-400 hover:text-violet-300 transition-colors"
                      >
                        <Icon name={bk.icon} size={14} />
                        <span className="text-[9px]">{bk.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={saveSlide}
                  disabled={saving}
                  className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Icon name="Save" size={13} />
                  {saving ? "Сохраняю…" : "Сохранить слайд"}
                </button>
              </>
            ) : (
              <p className="text-xs text-gray-600 text-center py-8">Выберите слайд слева или создайте новый</p>
            )}
          </div>

          {/* Превью */}
          <div className="flex-1 overflow-hidden bg-gray-900/40 flex items-center justify-center p-6">
            {localSlide ? (
              <div className="w-full h-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl border border-gray-800">
                <BizSlide slide={localSlide} presTitle={presentation.title} />
              </div>
            ) : (
              <p className="text-sm text-gray-600">Нет слайда для превью</p>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
