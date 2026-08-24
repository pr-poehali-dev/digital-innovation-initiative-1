import { useState } from "react";
import Icon from "@/components/ui/icon";
import { TextArea, TextField } from "@/components/exec/ExecForm";
import { DATA_KIND_LABEL, DeckSlide, deckApi } from "@/lib/execCenterDeckApi";

/** Панель редактирования слайда: заголовок, тезис, текстовые выводы,
 * заметки докладчика. Числовые показатели не редактируются здесь —
 * они приходят из данных кабинета. */
export default function SlideEditorPanel({
  centerId,
  slide,
  onSaved,
}: {
  centerId: number;
  slide: DeckSlide;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(slide.title_override || "");
  const [thesis, setThesis] = useState(slide.thesis_text || "");
  const [narrative, setNarrative] = useState(slide.narrative_text || "");
  const [notes, setNotes] = useState(slide.speaker_notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedFlag, setSavedFlag] = useState(false);

  const dirty =
    title !== (slide.title_override || "") ||
    thesis !== (slide.thesis_text || "") ||
    narrative !== (slide.narrative_text || "") ||
    notes !== (slide.speaker_notes || "");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await deckApi.saveSlide({
        center_id: centerId,
        slide_key: slide.key,
        title_override: title || null,
        thesis_text: thesis || null,
        narrative_text: narrative || null,
        speaker_notes: notes || null,
      });
      setSavedFlag(true);
      setTimeout(() => setSavedFlag(false), 1500);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const kindLabel = DATA_KIND_LABEL[slide.data_kind];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">{slide.catalog_title}</p>
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border mt-1 ${kindLabel.cls}`}
          >
            {kindLabel.title}
          </span>
        </div>
        {!slide.is_ready && (
          <span className="text-[11px] text-amber-600 flex items-center gap-1">
            <Icon name="TriangleAlert" size={12} />
            данных недостаточно
          </span>
        )}
      </div>

      <TextField
        label="Заголовок слайда"
        value={title}
        onChange={setTitle}
        placeholder={slide.catalog_title}
        hint="Оставьте пустым, чтобы использовать заголовок по умолчанию"
      />
      <TextArea
        label="Основной управленческий тезис"
        value={thesis}
        onChange={setThesis}
        rows={2}
        placeholder="Главная мысль слайда одной фразой"
      />
      <TextArea
        label="Текстовые выводы"
        value={narrative}
        onChange={setNarrative}
        rows={4}
        placeholder="Развёрнутый вывод под цифрами и графиками"
      />
      <TextArea
        label="Комментарий докладчика"
        value={notes}
        onChange={setNotes}
        rows={2}
        placeholder="Заметки для выступления, не показываются на слайде"
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={save}
        disabled={saving || !dirty}
        className="w-full px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
      >
        {savedFlag ? (
          <>
            <Icon name="Check" size={14} />
            Сохранено
          </>
        ) : saving ? (
          "Сохраняю…"
        ) : (
          "Сохранить"
        )}
      </button>
    </div>
  );
}
