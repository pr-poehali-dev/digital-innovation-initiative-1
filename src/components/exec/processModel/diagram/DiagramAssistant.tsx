import { useState } from "react";
import Icon from "@/components/ui/icon";
import { DIAGRAM_WIZARD_STEPS, getDiagramStep } from "@/config/diagramWizardGuide";
import { DiagramValidation } from "@/lib/execProcessModelApi";

/** Методический помощник внутри редактора схем — детерминированный, весь
 * текст зашит в конфиг, проверка — вызов backend validate (без ИИ). */
export default function DiagramAssistant({
  validation,
  onValidate,
  validating,
  onCreateClarification,
  onClose,
}: {
  diagramId: number;
  validation: DiagramValidation | null;
  onValidate: () => void;
  validating: boolean;
  onCreateClarification: (question: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(1);
  const guide = getDiagramStep(step);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const createNote = () => {
    if (!noteText.trim()) return;
    onCreateClarification(noteText.trim());
    setNoteText("");
    setAddingNote(false);
  };

  return (
    <div className="w-[280px] flex-shrink-0 border-l border-violet-200 bg-violet-50/40 h-full overflow-y-auto">
      <div className="flex items-center justify-between gap-2 p-3.5 border-b border-violet-200 sticky top-0 bg-violet-50/90 backdrop-blur z-10">
        <div className="flex items-center gap-2">
          <Icon name="Compass" size={15} className="text-violet-600" />
          <p className="text-sm font-semibold text-slate-900">Помощник схемы</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><Icon name="X" size={15} /></button>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="flex items-center gap-1">
          {DIAGRAM_WIZARD_STEPS.map((s) => (
            <button key={s.step} onClick={() => setStep(s.step)}
              className={`flex-1 h-1.5 rounded-full transition-colors ${s.step <= step ? "bg-violet-500" : "bg-slate-200"}`}
              title={s.title} />
          ))}
        </div>
        <p className="text-[11px] text-slate-500">Шаг {step} из {DIAGRAM_WIZARD_STEPS.length}. {guide.title}</p>

        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">Зачем это нужно</p>
          <p className="text-xs text-slate-600 leading-relaxed">{guide.why}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">Что сделать</p>
          <ul className="space-y-1.5">
            {guide.whatToDoNow.map((t, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                <Icon name="ArrowRight" size={11} className="text-violet-500 flex-shrink-0 mt-0.5" />
                <span className="leading-snug">{t}</span>
              </li>
            ))}
          </ul>
        </div>
        {guide.example && (
          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1">Пример</p>
            <p className="text-xs text-slate-600 italic leading-relaxed">{guide.example}</p>
          </div>
        )}

        <div className="flex gap-1.5">
          <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}
            className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40">Назад</button>
          <button onClick={() => setStep((s) => Math.min(DIAGRAM_WIZARD_STEPS.length, s + 1))} disabled={step === DIAGRAM_WIZARD_STEPS.length}
            className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-violet-600 text-white disabled:opacity-40">Что делать дальше?</button>
        </div>

        <button onClick={onValidate} disabled={validating}
          className="w-full px-3 py-2 rounded-lg border border-violet-300 bg-white text-violet-700 text-xs font-medium hover:bg-violet-50 disabled:opacity-50 flex items-center justify-center gap-1.5">
          {validating ? <span className="w-3 h-3 border border-violet-300 border-t-violet-600 rounded-full animate-spin" /> : <Icon name="ListChecks" size={12} />}
          Проверить схему
        </button>

        {validation && (
          <div className="space-y-2">
            {validation.errors.length === 0 && validation.warnings.length === 0 && (
              <div className="flex items-center gap-1.5 text-xs text-green-700"><Icon name="CheckCircle2" size={13} />Ошибок и предупреждений не найдено</div>
            )}
            {validation.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-red-600 uppercase tracking-wide">Ошибки ({validation.errors.length})</p>
                {validation.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
                    <Icon name="XCircle" size={12} className="flex-shrink-0 mt-0.5" />
                    <span>{e.message}</span>
                  </div>
                ))}
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-amber-600 uppercase tracking-wide">Предупреждения ({validation.warnings.length})</p>
                {validation.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                    <Icon name="AlertTriangle" size={12} className="flex-shrink-0 mt-0.5" />
                    <span>{w.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-violet-200/60">
          {!addingNote ? (
            <button onClick={() => setAddingNote(true)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 text-xs hover:border-violet-300 hover:text-violet-700 flex items-center justify-center gap-1.5">
              <Icon name="HelpCircle" size={12} />
              Создать вопрос на уточнение
            </button>
          ) : (
            <div className="space-y-1.5">
              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2}
                placeholder="Что требует уточнения?"
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-xs outline-none focus:border-violet-500 resize-none" />
              <div className="flex gap-1.5">
                <button onClick={createNote} disabled={!noteText.trim()} className="flex-1 text-xs px-2 py-1 rounded-md bg-violet-600 text-white disabled:opacity-40">Сохранить</button>
                <button onClick={() => { setAddingNote(false); setNoteText(""); }} className="text-xs px-2 py-1 text-slate-500">Отмена</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}