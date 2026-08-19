import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { bizPresentationsApi, Presentation, COVER_COLORS } from "@/lib/bizPresentationsApi";
import { COVER_GRADIENTS } from "@/components/biz-presentation/theme";

export default function BizPresentationsHubPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<Presentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", subtitle: "", cover_color: "violet" });
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    bizPresentationsApi
      .list()
      .then((d) => setItems(d.items))
      .catch(() => toast({ title: "Не удалось загрузить презентации", variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const res = await bizPresentationsApi.create(form);
      toast({ title: "Презентация создана" });
      setShowAdd(false);
      setForm({ title: "", subtitle: "", cover_color: "violet" });
      navigate(`/admin/presentations/${res.id}`);
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (id: number) => {
    if (!confirm("Скрыть презентацию из хаба?")) return;
    try {
      await bizPresentationsApi.remove(id);
      toast({ title: "Презентация скрыта" });
      load();
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <header className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <Icon name="Presentation" size={20} className="text-violet-400" />
              Хаб презентаций
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Конструктор бизнес-презентаций: создавайте слайды, редактируйте контент и показывайте презентацию прямо в браузере
            </p>
          </div>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Icon name="Plus" size={15} />
            Новая презентация
          </button>
        </header>

        {showAdd && (
          <div className="mb-6 bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <input
              autoFocus
              placeholder="Название презентации *"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600"
            />
            <input
              placeholder="Подзаголовок"
              value={form.subtitle}
              onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600"
            />
            <div className="flex items-center gap-2">
              {COVER_COLORS.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setForm((f) => ({ ...f, cover_color: c.code }))}
                  title={c.label}
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${c.from} ${c.to} border-2 transition-all ${
                    form.cover_color === c.code ? "border-white scale-110" : "border-transparent opacity-70"
                  }`}
                />
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCreate}
                disabled={creating || !form.title.trim()}
                className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
              >
                {creating ? "Создаю…" : "Создать и открыть"}
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-gray-600">
            <Icon name="Presentation" size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Презентаций пока нет — создайте первую</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((p) => {
              const grad = COVER_GRADIENTS[p.cover_color] || COVER_GRADIENTS.violet;
              return (
                <div
                  key={p.id}
                  className="group rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden hover:border-gray-700 transition-colors"
                >
                  <button
                    onClick={() => navigate(`/admin/presentations/${p.id}`)}
                    className={`w-full h-28 bg-gradient-to-br ${grad} flex items-center justify-center relative`}
                  >
                    <Icon name={p.cover_icon || "Presentation"} size={32} className="text-white/90" />
                    {!p.is_published && (
                      <span className="absolute top-2 right-2 text-[10px] font-bold uppercase bg-black/30 text-white px-2 py-0.5 rounded-full">
                        Скрыта
                      </span>
                    )}
                  </button>
                  <div className="p-4">
                    <p className="text-sm font-semibold text-white truncate">{p.title}</p>
                    {p.subtitle && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.subtitle}</p>}
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[11px] text-gray-600">{p.slides_count ?? 0} слайдов</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => navigate(`/admin/presentations/${p.id}`)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-violet-400 hover:bg-gray-800 transition-colors"
                          title="Редактировать"
                        >
                          <Icon name="Pencil" size={14} />
                        </button>
                        <button
                          onClick={() => navigate(`/admin/presentations/${p.id}/present`)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-400 hover:bg-gray-800 transition-colors"
                          title="Показать"
                        >
                          <Icon name="Play" size={14} />
                        </button>
                        <button
                          onClick={() => handleArchive(p.id)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
                          title="Скрыть"
                        >
                          <Icon name="Trash2" size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
