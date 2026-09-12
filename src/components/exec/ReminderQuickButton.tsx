import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { weeklyCycleApi, EntityType } from "@/lib/execWeeklyCycleApi";

interface Props {
  entityType: EntityType;
  entityId: number;
  title: string;
  variant?: "button" | "icon";
  onCreated?: () => void;
}

function atTime(daysFromNow: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Кнопка «Напомнить» для карточек объектов: поручение, инициатива, проект,
 * задача, веха, риск, проблема, решение, потребность, документ. Быстрые
 * варианты + произвольная дата. Вызывает существующий exec-cabinet API,
 * новых backend-функций не создаёт. */
export default function ReminderQuickButton({ entityType, entityId, title, variant = "icon", onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [customAt, setCustomAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const create = async (remindAt: string) => {
    setBusy(true);
    try {
      await weeklyCycleApi.saveReminder({
        title: `Напоминание: ${title}`,
        remind_at: remindAt,
        entity_type: entityType,
        entity_id: entityId,
      });
      setDone(true);
      onCreated?.();
      setTimeout(() => { setOpen(false); setDone(false); }, 900);
    } finally {
      setBusy(false);
    }
  };

  const quickOptions = [
    { label: "Сегодня вечером", value: atTime(0, 19) },
    { label: "Завтра", value: atTime(1, 9) },
    { label: "Через 3 дня", value: atTime(3, 9) },
    { label: "Через неделю", value: atTime(7, 9) },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "icon" ? (
          <button
            type="button"
            title="Напомнить"
            className="text-slate-400 hover:text-violet-600 transition-colors p-1"
          >
            <Icon name="BellPlus" fallback="Bell" size={14} />
          </button>
        ) : (
          <Button size="sm" variant="outline" type="button">
            <Icon name="BellPlus" fallback="Bell" size={13} className="mr-1.5" /> Напомнить
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        {done ? (
          <div className="text-xs text-emerald-700 flex items-center gap-1.5 py-2 px-1">
            <Icon name="Check" size={13} /> Напоминание создано
          </div>
        ) : (
          <div className="space-y-1">
            {quickOptions.map((o) => (
              <button
                key={o.label}
                disabled={busy}
                onClick={() => create(o.value)}
                className="w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-violet-50 hover:text-violet-700 transition-colors disabled:opacity-50"
              >
                {o.label}
              </button>
            ))}
            <div className="flex items-center gap-1.5 pt-1.5 mt-1 border-t border-slate-100">
              <Input
                type="datetime-local"
                value={customAt}
                onChange={(e) => setCustomAt(e.target.value)}
                className="h-7 text-xs"
              />
              <Button
                size="sm"
                className="h-7 px-2 text-xs flex-shrink-0"
                disabled={!customAt || busy}
                onClick={() => create(customAt)}
              >
                OK
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
