const STYLES = ["академический", "деловой", "формальный", "краткий"];

interface Props {
  title: string;
  topic: string;
  goal: string;
  audience: string;
  style: string;
  slideCount: string;
  instructions: string;
  onTitleChange: (v: string) => void;
  onTopicChange: (v: string) => void;
  onGoalChange: (v: string) => void;
  onAudienceChange: (v: string) => void;
  onStyleChange: (v: string) => void;
  onSlideCountChange: (v: string) => void;
  onInstructionsChange: (v: string) => void;
}

export default function TaskParamsFields({
  title, topic, goal, audience, style, slideCount, instructions,
  onTitleChange, onTopicChange, onGoalChange, onAudienceChange,
  onStyleChange, onSlideCountChange, onInstructionsChange,
}: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">Параметры задания</p>
      <div>
        <label className="text-sm text-muted-foreground block mb-1.5">Название задания *</label>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Например: Презентация по управлению проектами"
          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white]"
        />
      </div>
      <div>
        <label className="text-sm text-muted-foreground block mb-1.5">Тема *</label>
        <input
          value={topic}
          onChange={(e) => onTopicChange(e.target.value)}
          placeholder="О чём должен быть результат?"
          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white]"
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-muted-foreground block mb-1.5">Цель</label>
          <input
            value={goal}
            onChange={(e) => onGoalChange(e.target.value)}
            placeholder="Что должно получиться?"
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white]"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1.5">Аудитория</label>
          <input
            value={audience}
            onChange={(e) => onAudienceChange(e.target.value)}
            placeholder="Для кого?"
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white]"
          />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-muted-foreground block mb-1.5">Стиль изложения</label>
          <select
            value={style}
            onChange={(e) => onStyleChange(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <option value="">Не указан</option>
            {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1.5">Число слайдов</label>
          <input
            type="number"
            value={slideCount}
            onChange={(e) => onSlideCountChange(e.target.value)}
            placeholder="Например: 12"
            min={1}
            max={50}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white]"
          />
        </div>
      </div>
      <div>
        <label className="text-sm text-muted-foreground block mb-1.5">Дополнительные указания</label>
        <textarea
          value={instructions}
          onChange={(e) => onInstructionsChange(e.target.value)}
          placeholder="Любые дополнительные требования к результату..."
          rows={3}
          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
        />
      </div>
    </div>
  );
}
