import { useState } from "react";
import Icon from "@/components/ui/icon";
import { WizardStageGuide } from "@/config/processModelWizardGuide";
import { processModelApi } from "@/lib/execProcessModelApi";

/**
 * Правая колонка раздела «Процессное управление» — методический помощник.
 * НЕ генеративный: текст зашит в конфиг, действия — детерминированные вызовы
 * backend (проверки, создание заметки «требует уточнения»). Никаких обращений
 * к внешнему ИИ.
 */
export default function WizardAssistant({
  stage,
  scopeId,
  onNavigate,
}: {
  stage: WizardStageGuide;
  scopeId: number | null;
  onNavigate: (path: string) => void;
}) {
  const [creatingNote, setCreatingNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);

  const createNote = async () => {
    if (!noteText.trim() || !scopeId) return;
    await processModelApi.saveClarificationNote({
      scope_id: scopeId,
      entity_type: stage.code,
      question: noteText.trim(),
    });
    setNoteText("");
    setCreatingNote(false);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2500);
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-4 sticky top-4 h-fit">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
          <Icon name={stage.icon} size={14} className="text-violet-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{stage.title}</p>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Зачем этот шаг</p>
        <p className="text-xs text-slate-600 leading-relaxed">{stage.why}</p>
      </div>

      <div>
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">Что сделать сейчас</p>
        <ul className="space-y-1.5">
          {stage.whatToDoNow.map((t, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
              <Icon name="ArrowRight" size={12} className="text-violet-500 flex-shrink-0 mt-0.5" />
              <span className="leading-snug">{t}</span>
            </li>
          ))}
        </ul>
      </div>

      {stage.example && (
        <div className="rounded-lg bg-white border border-slate-200 p-2.5">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1">Пример</p>
          <p className="text-xs text-slate-600 leading-relaxed italic">{stage.example}</p>
        </div>
      )}

      {stage.route && (
        <button
          onClick={() => onNavigate(stage.route!)}
          className="w-full px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition-colors flex items-center justify-center gap-1.5"
        >
          Открыть раздел
          <Icon name="ArrowRight" size={13} />
        </button>
      )}

      {!stage.available && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-100 border border-slate-200">
          <Icon name="Construction" size={13} className="text-slate-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Этот раздел появится в следующей итерации разработки контура.
          </p>
        </div>
      )}

      {scopeId && (
        <div className="pt-2 border-t border-violet-200/60 space-y-2">
          {!creatingNote ? (
            <button
              onClick={() => setCreatingNote(true)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 text-xs hover:border-violet-300 hover:text-violet-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <Icon name="HelpCircle" size={12} />
              Создать вопрос на уточнение
            </button>
          ) : (
            <div className="space-y-1.5">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
                placeholder="Что именно требует уточнения?"
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-xs outline-none focus:border-violet-500 resize-none"
              />
              <div className="flex gap-1.5">
                <button onClick={createNote} disabled={!noteText.trim()}
                  className="flex-1 text-xs px-2 py-1 rounded-md bg-violet-600 text-white disabled:opacity-40">
                  Сохранить
                </button>
                <button onClick={() => { setCreatingNote(false); setNoteText(""); }}
                  className="text-xs px-2 py-1 text-slate-500">Отмена</button>
              </div>
            </div>
          )}
          {noteSaved && <p className="text-[11px] text-green-600">Заметка сохранена</p>}
        </div>
      )}

      {stage.tip && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
          <Icon name="Lightbulb" size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-relaxed">{stage.tip}</p>
        </div>
      )}
    </div>
  );
}
