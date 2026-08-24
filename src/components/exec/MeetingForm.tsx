import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Meeting, controlApi } from "@/lib/execControlApi";
import { PersonRef } from "@/lib/execCabinetApi";

interface Props {
  meeting?: Meeting;
  persons: PersonRef[];
  initiatives: { id: number; code: string | null; title: string }[];
  onClose: () => void;
  onSaved: (id: number) => void;
}

export default function MeetingForm({ meeting, persons, initiatives, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(meeting?.title || "");
  const [meetingAt, setMeetingAt] = useState(
    meeting?.meeting_at ? meeting.meeting_at.slice(0, 16) : "",
  );
  const [location, setLocation] = useState(meeting?.location || "");
  const [agenda, setAgenda] = useState(meeting?.agenda || "");
  const [participantIds, setParticipantIds] = useState<number[]>(
    meeting?.participants?.map((p) => p.id) || [],
  );
  const [initiativeIds, setInitiativeIds] = useState<number[]>(
    meeting?.initiatives?.map((i) => i.id) || [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSave = title.trim().length > 0 && meetingAt;

  const save = async () => {
    if (!canSave) {
      setError("Укажите тему и дату встречи");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const r = await controlApi.saveMeeting({
        ...(meeting ? { id: meeting.id } : {}),
        title: title.trim(),
        meeting_at: meetingAt,
        location: location || null,
        agenda: agenda || null,
        participant_ids: participantIds,
        initiative_ids: initiativeIds,
      });
      onSaved(r.id);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const toggle = (list: number[], set: (v: number[]) => void, id: number) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-xl w-full max-w-lg my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Icon name="CalendarClock" size={17} className="text-violet-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              {meeting ? "Изменить встречу" : "Новая встреча"}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors">
            <Icon name="X" size={18} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-xs text-slate-500 mb-1.5 block">
              Тема <span className="text-violet-600">*</span>
            </span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500 mb-1.5 block">
                Дата и время <span className="text-violet-600">*</span>
              </span>
              <input
                type="datetime-local"
                value={meetingAt}
                onChange={(e) => setMeetingAt(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors"
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 mb-1.5 block">Место / формат</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Онлайн, каб. 401…"
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm placeholder:text-slate-400 outline-none focus:border-violet-600 transition-colors"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-slate-500 mb-1.5 block">Повестка</span>
            <textarea
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-900 text-sm outline-none focus:border-violet-600 transition-colors resize-none"
            />
          </label>

          <div>
            <span className="text-xs text-slate-500 mb-1.5 block">Участники</span>
            <div className="flex flex-wrap gap-1.5">
              {persons.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(participantIds, setParticipantIds, p.id)}
                  className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                    participantIds.includes(p.id)
                      ? "bg-violet-100 border-violet-300 text-violet-700"
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {p.display_name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs text-slate-500 mb-1.5 block">Связанные инициативы</span>
            <div className="flex flex-wrap gap-1.5">
              {initiatives.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => toggle(initiativeIds, setInitiativeIds, i.id)}
                  className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                    initiativeIds.includes(i.id)
                      ? "bg-violet-100 border-violet-300 text-violet-700"
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {i.title.length > 30 ? i.title.slice(0, 30) + "…" : i.title}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 p-5 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={save}
            disabled={saving || !canSave}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            {saving && (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </footer>
      </div>
    </div>
  );
}
