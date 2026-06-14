import { useRef } from "react";
import Icon from "@/components/ui/icon";
import HelpPanel from "@/components/HelpPanel";

interface InfluenceMap {
  structure_from?: string[];
  content_from?: string[];
  methodology_from?: string[];
  format_from?: string[];
  background_from?: string[];
  ignored?: string[];
  ai_additions?: string[];
  conflicts_resolved?: string[];
}

interface VisualPlanItem {
  slide_index: number;
  slide_title: string;
  visual_type: string;
  render_mode: string;
  source_prompt: string;
  source_doc_name?: string;
  source_type?: string;
  generation_status: string;
  asset_url?: string;
  warnings?: string[];
}

interface RunResult {
  id: number;
  version: number;
  content?: string;
  status: string;
  created_by: string;
  revisions: { instruction: string; created_at: string }[];
  influence_map?: InfluenceMap | null;
  visual_plan?: VisualPlanItem[];
  visual_warnings?: string[];
}

interface Props {
  activeRun: RunResult | null;
  loadingRun: boolean;
  exporting: boolean;
  exportError: string;
  generating: boolean;
  genError: string;
  revision: string;
  selectedBlock: string | null;
  reRenderingVisual: number | null;
  editingVisualPrompt: Record<number, string>;
  uploadingVisual: number | null;
  restoringVisual: number | null;
  onCopy: () => void;
  onExportPptx: () => void;
  onExportDocx: () => void;
  onSelectBlock: (block: string) => void;
  onGenerate: (isRevision: boolean) => void;
  onRevisionChange: (v: string) => void;
  onRenderVisual: (slideIndex: number) => void;
  onVisualUpload: (slideIndex: number, file: File) => void;
  onRestoreAi: (slideIndex: number) => void;
  onEditingVisualPromptChange: (updater: (prev: Record<number, string>) => Record<number, string>) => void;
  contentRef: React.RefObject<HTMLDivElement>;
}

function splitContentIntoBlocks(content: string): string[] {
  if (!content) return [];
  const blocks: string[] = [];
  const parts = content.split(/\n\n+/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed) blocks.push(trimmed);
  }
  return blocks;
}

export default function RunViewer({
  activeRun,
  loadingRun,
  exporting,
  exportError,
  generating,
  genError,
  revision,
  selectedBlock,
  reRenderingVisual,
  editingVisualPrompt,
  uploadingVisual,
  restoringVisual,
  onCopy,
  onExportPptx,
  onExportDocx,
  onSelectBlock,
  onGenerate,
  onRevisionChange,
  onRenderVisual,
  onVisualUpload,
  onRestoreAi,
  onEditingVisualPromptChange,
  contentRef,
}: Props) {
  const statusColor: Record<string, string> = {
    done: "bg-green-100 text-green-700",
    pending_render: "bg-blue-100 text-blue-700",
    failed: "bg-red-100 text-red-700",
    pending: "bg-slate-100 text-slate-600",
    rendered: "bg-green-100 text-green-700",
    user_override: "bg-violet-100 text-violet-700",
    image_pending: "bg-amber-100 text-amber-700",
  };
  const statusLabel: Record<string, string> = {
    done: "✅ Готово",
    pending_render: "⚙️ При экспорте",
    rendered: "✅ Отрисован",
    failed: "❌ Ошибка",
    pending: "⏳ Ожидает",
    user_override: "👤 Заменено пользователем",
    image_pending: "🕐 Картинка не готова",
  };
  const typeIcon: Record<string, string> = {
    image: "🖼", diagram: "📊", timeline: "📅",
    process: "🔄", comparison: "⚖️", matrix: "🔲",
    orgchart: "🏢", cycle: "♻️",
  };
  const sourceLabel: Record<string, string> = {
    task_instruction: "Инструкция задания",
    doc_instruction: "Инструкция к документу",
    pptx_text: "Текст PPTX",
    pptx_notes: "Notes PPTX",
    docx: "DOCX",
    pdf: "PDF",
    text: "Документ",
  };
  const layoutLabel: Record<string, string> = {
    title_text_left_visual_right: "Текст слева / Визуал справа",
    title_text_top_timeline_bottom: "Текст сверху / Таймлайн снизу",
  };

  return (
    <>
      {(activeRun || loadingRun) && (
        <HelpPanel
          title="Что делать с результатом"
          summary="Просматривайте результат, кликайте на абзацы, задавайте ревизии и экспортируйте в нужном формате."
          steps={[
            { num: 1, title: "Прочитайте результат", description: "Текст ниже. Кликните на любой абзац — AI объяснит почему так написал и что использовал." },
            { num: 2, title: "Уточните или переработайте", description: "Поле «Ревизия» внизу — напишите что изменить, AI переработает только это. Или нажмите «Запустить AI» для полной перегенерации." },
            { num: 3, title: "Экспортируйте результат", description: "Кнопки PPTX и DOCX в шапке блока. Можно также скопировать текст кнопкой «Копировать»." },
          ]}
          sections={[
            {
              title: "Ревизия и версии",
              icon: "RefreshCw",
              subsections: [
                { title: "Ревизия", content: "Пишите конкретно: «Добавь слайд про риски», «Перепиши введение в деловом стиле». AI трогает только то, что попросили." },
                { title: "Перегенерация", content: "«Запустить AI» — создаётся новая версия. Старая сохраняется." },
                { title: "История версий", content: "Кнопки v1, v2... слева — переключение между версиями." },
              ],
            },
            {
              title: "Визуалы — для презентаций",
              icon: "LayoutTemplate",
              subsections: [
                { title: "Блок «Визуалы»", content: "Появляется если в задании были [[process:...]] или [КАРТИНКА:...]. Схемы, диаграммы, таймлайны." },
                { title: "⬆ Загрузить своё", content: "PNG/JPG/SVG встанет в то же место на слайде. Layout не сломается." },
                { title: "↩ Вернуть AI-версию", content: "Появляется если вы заменили visual своим файлом — откатывает к AI-варианту." },
                { title: "⚠ Визуалы и Google Slides", content: "Если визуалы не отображаются — откройте в PowerPoint. Google Slides не всегда поддерживает встроенные схемы." },
              ],
            },
            {
              title: "Статусы выполнения",
              icon: "Activity",
              subsections: [
                { title: "⏳ Ожидает / Выполняется", content: "AI работает. Страница обновится автоматически." },
                { title: "✅ Готово", content: "Результат доступен для просмотра, ревизии и экспорта." },
                { title: "❌ Ошибка", content: "Что-то пошло не так. Нажмите «Запустить AI» чтобы попробовать ещё раз." },
              ],
            },
          ]}
          tips={[
            { kind: "tip", text: "Кликайте на абзацы — увидите объяснение и кнопку «Улучшить» для точечной доработки." },
            { kind: "tip", text: "Для презентаций: скачайте PPTX и проверьте через «Аудит» — AI найдёт несоответствия с критериями." },
            { kind: "warning", text: "Ревизия работает лучше когда инструкция конкретная. «Сделай лучше» — плохо. «Добавь примеры в третий раздел» — хорошо." },
          ]}
        />
      )}

      {(activeRun || loadingRun) && (
        <div ref={contentRef} className="border rounded-2xl bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Icon name="Sparkles" size={16} className="text-orange-500" />
              <span className="text-sm font-medium">
                {loadingRun ? "Загрузка..." : `Версия ${activeRun?.version}`}
              </span>
              {activeRun?.status === "done" && (
                <span className="text-xs bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400 px-2 py-0.5 rounded-full">Готово</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onCopy}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon name="Copy" size={13} />
                Скопировать
              </button>
              <button
                onClick={onExportPptx}
                disabled={exporting || loadingRun}
                className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <Icon name="Download" size={13} />
                PPTX
              </button>
              <button
                onClick={onExportDocx}
                disabled={exporting || loadingRun}
                className="flex items-center gap-1.5 text-xs bg-blue-700 hover:bg-blue-800 text-white px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <Icon name="FileText" size={13} />
                DOCX
              </button>
            </div>
          </div>

          {loadingRun ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={`h-4 bg-muted animate-pulse rounded ${i === 4 ? "w-2/3" : ""}`} />
              ))}
            </div>
          ) : activeRun?.content ? (
            <div className="p-5">
              {activeRun.influence_map && (
                <div className="mb-4 border border-slate-200 rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <Icon name="Map" size={14} />
                    Карта влияния документов
                  </p>
                  <div className="space-y-1.5 text-xs">
                    {activeRun.influence_map.structure_from && activeRun.influence_map.structure_from.length > 0 && (
                      <div className="flex gap-2">
                        <span className="font-medium text-purple-700 min-w-[100px]">📜 Структура:</span>
                        <span className="text-slate-700">{activeRun.influence_map.structure_from.join(", ")}</span>
                      </div>
                    )}
                    {activeRun.influence_map.content_from && activeRun.influence_map.content_from.length > 0 && (
                      <div className="flex gap-2">
                        <span className="font-medium text-green-700 min-w-[100px]">📚 Контент:</span>
                        <span className="text-slate-700">{activeRun.influence_map.content_from.join(", ")}</span>
                      </div>
                    )}
                    {activeRun.influence_map.format_from && activeRun.influence_map.format_from.length > 0 && (
                      <div className="flex gap-2">
                        <span className="font-medium text-blue-700 min-w-[100px]">🎨 Формат:</span>
                        <span className="text-slate-700">{activeRun.influence_map.format_from.join(", ")}</span>
                      </div>
                    )}
                    {activeRun.influence_map.methodology_from && activeRun.influence_map.methodology_from.length > 0 && (
                      <div className="flex gap-2">
                        <span className="font-medium text-cyan-700 min-w-[100px]">🧭 Методика:</span>
                        <span className="text-slate-700">{activeRun.influence_map.methodology_from.join(", ")}</span>
                      </div>
                    )}
                    {activeRun.influence_map.ai_additions && activeRun.influence_map.ai_additions.length > 0 && (
                      <div className="flex gap-2">
                        <span className="font-medium text-slate-600 min-w-[100px]">🤖 От AI:</span>
                        <span className="text-slate-700">{activeRun.influence_map.ai_additions.join("; ")}</span>
                      </div>
                    )}
                    {activeRun.influence_map.ignored && activeRun.influence_map.ignored.length > 0 && (
                      <div className="flex gap-2">
                        <span className="font-medium text-amber-700 min-w-[100px]">⚠️ Пропущено:</span>
                        <span className="text-slate-700">{activeRun.influence_map.ignored.join(", ")}</span>
                      </div>
                    )}
                    {activeRun.influence_map.conflicts_resolved && activeRun.influence_map.conflicts_resolved.length > 0 && (
                      <div className="flex gap-2">
                        <span className="font-medium text-red-700 min-w-[100px]">⚖️ Конфликты:</span>
                        <span className="text-slate-700">{activeRun.influence_map.conflicts_resolved.join("; ")}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
                <Icon name="MousePointerClick" size={12} />
                Кликни на любой блок — AI объяснит откуда взято и даст переписать
              </p>
              <div className="space-y-2.5">
                {splitContentIntoBlocks(activeRun.content).map((block, i) => (
                  <div
                    key={i}
                    onClick={() => onSelectBlock(block)}
                    className={`whitespace-pre-wrap text-sm leading-relaxed font-sans cursor-pointer p-2.5 rounded-lg border transition-colors ${
                      selectedBlock === block
                        ? "border-slate-800 bg-slate-50"
                        : "border-transparent hover:border-slate-200 hover:bg-slate-50/50"
                    }`}
                  >
                    {block}
                  </div>
                ))}
              </div>

              {activeRun.visual_plan && activeRun.visual_plan.length > 0 && (
                <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
                    <Icon name="LayoutTemplate" size={15} className="text-slate-600" />
                    <span className="text-sm font-semibold text-slate-800">
                      Визуалы ({activeRun.visual_plan.length})
                    </span>
                    <span className="text-xs text-slate-500 ml-1">— вставятся в PPTX при экспорте</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {activeRun.visual_plan.map((vp) => {
                      const isUserOverride = vp.generation_status === "user_override" ||
                        (vp as Record<string, unknown>).active_asset_kind === "user_uploaded";
                      const canRestoreAi = !!(vp as Record<string, unknown>).can_restore_ai;
                      const isEditing = vp.slide_index in editingVisualPrompt;
                      const activeUrl = (vp as Record<string, unknown>).user_override_url as string
                        || (vp as Record<string, unknown>).active_asset_url as string
                        || vp.asset_url;

                      return (
                        <div key={vp.slide_index} className={`px-4 py-3 space-y-2 ${isUserOverride ? "bg-violet-50/40" : ""}`}>
                          <div className="flex items-start gap-2 flex-wrap">
                            <span className="text-base">{typeIcon[vp.visual_type] || "🎨"}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-xs font-semibold text-slate-700">
                                  Слайд {vp.slide_index}
                                </span>
                                <span className="text-xs text-slate-500 truncate max-w-[180px]">
                                  {vp.slide_title}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[vp.generation_status] || "bg-slate-100 text-slate-600"}`}>
                                  {statusLabel[vp.generation_status] || vp.generation_status}
                                </span>
                                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">
                                  {vp.visual_type}
                                </span>
                              </div>
                              {(vp as Record<string, unknown>).layout_mode && (
                                <p className="text-xs text-slate-400 mb-0.5">
                                  📐 {layoutLabel[(vp as Record<string, unknown>).layout_mode as string] || (vp as Record<string, unknown>).layout_mode as string}
                                </p>
                              )}
                              <p className="text-xs text-slate-500 mb-0.5">
                                📌 {sourceLabel[vp.source_type || ""] || vp.source_type}
                                {vp.source_doc_name ? ` · ${vp.source_doc_name}` : ""}
                              </p>
                              {!isEditing ? (
                                <p className="text-xs text-slate-700 italic">«{vp.source_prompt}»</p>
                              ) : (
                                <textarea
                                  value={editingVisualPrompt[vp.slide_index]}
                                  onChange={(e) => onEditingVisualPromptChange((p) => ({ ...p, [vp.slide_index]: e.target.value }))}
                                  rows={2}
                                  className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white resize-none mt-1"
                                />
                              )}
                              {vp.warnings && vp.warnings.length > 0 && (
                                <p className="text-xs text-red-500 mt-1">⚠️ {vp.warnings[0]}</p>
                              )}
                              {activeUrl && (
                                <a href={activeUrl} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:text-blue-800 underline mt-1 inline-block">
                                  {isUserOverride ? "Открыть мой файл ↗" : "Открыть ↗"}
                                </a>
                              )}
                            </div>

                            <div className="flex flex-col gap-1 flex-shrink-0">
                              {!isEditing ? (
                                <button
                                  onClick={() => onEditingVisualPromptChange((p) => ({ ...p, [vp.slide_index]: vp.source_prompt }))}
                                  className="text-xs border border-slate-200 hover:border-slate-400 text-slate-600 px-2 py-1 rounded-md"
                                >
                                  Изменить
                                </button>
                              ) : (
                                <button
                                  onClick={() => onEditingVisualPromptChange((p) => { const n = { ...p }; delete n[vp.slide_index]; return n; })}
                                  className="text-xs border border-slate-200 text-slate-500 px-2 py-1 rounded-md"
                                >
                                  Отмена
                                </button>
                              )}

                              {!isUserOverride && (
                                <button
                                  onClick={() => onRenderVisual(vp.slide_index)}
                                  disabled={reRenderingVisual === vp.slide_index}
                                  className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded-md disabled:opacity-50"
                                >
                                  {reRenderingVisual === vp.slide_index ? "..." : "↺ Перегенерировать"}
                                </button>
                              )}

                              <label className={`text-xs border px-2 py-1 rounded-md text-center cursor-pointer transition-colors
                                ${uploadingVisual === vp.slide_index
                                  ? "border-slate-200 text-slate-400 pointer-events-none"
                                  : "border-violet-300 text-violet-700 hover:bg-violet-50"}`}>
                                {uploadingVisual === vp.slide_index ? "Загружаю..." : "⬆ Загрузить своё"}
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                                  className="hidden"
                                  disabled={uploadingVisual === vp.slide_index}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) onVisualUpload(vp.slide_index, f);
                                    e.target.value = "";
                                  }}
                                />
                              </label>

                              {isUserOverride && canRestoreAi && (
                                <button
                                  onClick={() => onRestoreAi(vp.slide_index)}
                                  disabled={restoringVisual === vp.slide_index}
                                  className="text-xs border border-slate-200 text-slate-500 hover:text-slate-800 px-2 py-1 rounded-md disabled:opacity-50"
                                >
                                  {restoringVisual === vp.slide_index ? "..." : "↩ AI-версия"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {activeRun.visual_warnings && activeRun.visual_warnings.length > 0 && (
                    <div className="bg-amber-50 border-t border-amber-200 px-4 py-2">
                      <p className="text-xs text-amber-700 font-medium mb-1">⚠️ Предупреждения визуалов:</p>
                      {activeRun.visual_warnings.map((w, i) => (
                        <p key={i} className="text-xs text-amber-600">• {w}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {exportError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {exportError}
        </div>
      )}

      {activeRun && !loadingRun && (
        <div className="border rounded-2xl p-4 bg-card">
          <p className="text-sm font-semibold mb-3">Доработать результат</p>
          <p className="text-xs text-muted-foreground mb-3">
            Напишите что изменить — AI создаст новую версию
          </p>
          <textarea
            value={revision}
            onChange={(e) => onRevisionChange(e.target.value)}
            placeholder="Например: сократи до 8 слайдов, усили деловой стиль, добавь акцент на риски..."
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none mb-3"
          />
          {genError && <p className="text-red-500 text-sm mb-3">{genError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => onGenerate(false)}
              disabled={generating}
              className="flex items-center gap-2 border rounded-lg px-4 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Icon name="RotateCcw" size={14} />
              Повторить
            </button>
            <button
              onClick={() => onGenerate(true)}
              disabled={generating || !revision.trim()}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Icon name="Sparkles" size={14} />
              {generating ? "Генерирую..." : "Доработать"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}