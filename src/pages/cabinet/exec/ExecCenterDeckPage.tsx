import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { ErrorBox, Loading } from "@/components/exec/ExecUI";
import {
  DATA_KIND_LABEL,
  DeckSlide,
  SLIDE_GROUP_LABEL,
  SlideGroup,
  deckApi,
} from "@/lib/execCenterDeckApi";
import { DashboardData, ModelData, centerApi } from "@/lib/execCenterApi";
import SlideEditorPanel from "@/components/exec/deck/SlideEditorPanel";
import SlideRenderer, { SlideContext } from "@/components/exec/deck/SlideRenderer";

export default function ExecCenterDeckPage() {
  const nav = useNavigate();
  const [model, setModel] = useState<ModelData | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [slides, setSlides] = useState<DeckSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    setError("");
    Promise.all([deckApi.deck(), centerApi.model(), centerApi.dashboard()])
      .then(([d, m, db]) => {
        setSlides(d.slides);
        setModel(m);
        setDashboard(db);
        setActiveKey((cur) => cur || d.slides[0]?.key || null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const centerId = model?.center?.id;
  const activeSlide = slides.find((s) => s.key === activeKey) || null;

  const expertValues = useMemo(() => [], []); // экспертные значения используются напрямую из полей центра

  const ctx: SlideContext | null =
    model && dashboard
      ? { model, dashboard, expertValues, onGoto: (p: string) => nav(p) }
      : null;

  const readyCount = slides.filter((s) => s.is_ready).length;
  const includedCount = slides.filter((s) => s.is_included).length;

  const toggleIncluded = async (s: DeckSlide) => {
    if (!centerId) return;
    setSlides((prev) => prev.map((x) => (x.key === s.key ? { ...x, is_included: !x.is_included } : x)));
    await deckApi.saveSlide({ center_id: centerId, slide_key: s.key, is_included: !s.is_included });
  };

  const dragOverKey = useRef<string | null>(null);

  const onDrop = async (targetKey: string) => {
    if (!centerId || !dragKey || dragKey === targetKey) {
      setDragKey(null);
      return;
    }
    const list = [...slides];
    const from = list.findIndex((s) => s.key === dragKey);
    const to = list.findIndex((s) => s.key === targetKey);
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    setSlides(list);
    setDragKey(null);
    await deckApi.reorderSlides(
      centerId,
      list.map((s) => s.key),
    );
  };

  if (loading) {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }
  if (error) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-10">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      </Layout>
    );
  }
  if (!model?.center) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Icon name="Presentation" size={32} className="text-slate-300 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-900">Центр ещё не создан</h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Презентация строится на паспорте Центра — сначала создайте его.
          </p>
          <button
            onClick={() => nav("/cabinet/exec/center")}
            className="mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors"
          >
            Создать Центр
          </button>
        </div>
      </Layout>
    );
  }

  const groups: SlideGroup[] = ["intro", "current", "target", "conclusion"];

  return (
    <Layout>
      <div className="max-w-[1500px] mx-auto px-4 py-6">
        <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Презентация Центра</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Материалы для защиты собираются из данных кабинета: {readyCount} из {slides.length}{" "}
              слайдов готовы, {includedCount} включено в показ
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => nav("/cabinet/exec/model")}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="ArrowLeft" size={15} />
              Модель Центра
            </button>
            <button
              onClick={() => nav("/cabinet/exec/deck/present")}
              className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors inline-flex items-center gap-1.5"
            >
              <Icon name="Play" size={15} />
              Показать
            </button>
          </div>
        </header>

        {readyCount < slides.length && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 mb-5 flex items-start gap-2">
            <Icon name="Info" size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              {slides.length - readyCount} слайдов пока без достаточных данных — они отмечены
              жёлтым в списке и не подставляют нули как факты. Заполните нужные разделы кабинета
              или отключите такие слайды из показа.
            </p>
          </div>
        )}

        <div className="grid lg:grid-cols-[280px_1fr_320px] gap-4">
          {/* Список слайдов */}
          <div className="space-y-4">
            {groups.map((g) => {
              const inGroup = slides.filter((s) => s.group === g);
              if (!inGroup.length) return null;
              return (
                <div key={g}>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5 px-1">
                    {SLIDE_GROUP_LABEL[g]}
                  </p>
                  <div className="space-y-1">
                    {inGroup.map((s) => (
                      <div
                        key={s.key}
                        draggable
                        onDragStart={() => setDragKey(s.key)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          dragOverKey.current = s.key;
                        }}
                        onDrop={() => onDrop(s.key)}
                        onClick={() => setActiveKey(s.key)}
                        className={`group flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition-colors ${
                          activeKey === s.key
                            ? "border-violet-400 bg-violet-50"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        } ${!s.is_included ? "opacity-50" : ""}`}
                      >
                        <Icon name="GripVertical" size={13} className="text-slate-300 flex-shrink-0 cursor-grab" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-800 truncate">
                            {s.title_override || s.catalog_title}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {!s.is_ready && (
                              <Icon name="TriangleAlert" size={10} className="text-amber-500" />
                            )}
                            <span
                              className={`text-[9px] px-1 rounded border ${DATA_KIND_LABEL[s.data_kind].cls}`}
                            >
                              {DATA_KIND_LABEL[s.data_kind].title}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleIncluded(s);
                          }}
                          title={s.is_included ? "Исключить из показа" : "Включить в показ"}
                          className="flex-shrink-0"
                        >
                          <Icon
                            name={s.is_included ? "Eye" : "EyeOff"}
                            size={14}
                            className={s.is_included ? "text-slate-400 hover:text-violet-600" : "text-slate-300"}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Предпросмотр слайда */}
          <div>
            {activeSlide && ctx ? (
              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm" style={{ aspectRatio: "16/9" }}>
                <SlideRenderer slide={activeSlide} ctx={ctx} />
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center" style={{ aspectRatio: "16/9" }}>
                <p className="text-sm text-slate-400">Выберите слайд слева</p>
              </div>
            )}
          </div>

          {/* Редактор */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            {activeSlide && centerId ? (
              <SlideEditorPanel
                centerId={centerId}
                slide={activeSlide}
                onSaved={reload}
              />
            ) : (
              <p className="text-sm text-slate-400">Выберите слайд для редактирования</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
