import { motion } from 'framer-motion';
import Icon from '@/components/ui/icon';
import { CABINET_THEME, type CabinetKey } from './theme';

// Круговая экосистемная схема (общий цикл продукта)
export function EcosystemLoop({ steps }: { steps: string[] }) {
  const n = steps.length;
  const R = 210;
  const cx = 260;
  const cy = 260;
  const colors = ['#3B82F6', '#8B5CF6', '#14B8A6', '#38BDF8', '#34D399', '#F59E0B'];
  return (
    <div className="relative mx-auto" style={{ width: 520, height: 520, maxWidth: '100%' }}>
      <svg viewBox="0 0 520 520" className="absolute inset-0 h-full w-full">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={2} strokeDasharray="6 8" />
        {steps.map((_, i) => {
          const a1 = (i / n) * Math.PI * 2 - Math.PI / 2;
          const a2 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
          const x1 = cx + Math.cos(a1) * R;
          const y1 = cy + Math.sin(a1) * R;
          const x2 = cx + Math.cos(a2) * R;
          const y2 = cy + Math.sin(a2) * R;
          return (
            <motion.path key={i} d={`M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`}
              fill="none" stroke={colors[i % colors.length]} strokeWidth={3} strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 0.9 }}
              transition={{ delay: 0.3 + i * 0.25, duration: 0.6 }} />
          );
        })}
      </svg>
      {steps.map((s, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        return (
          <motion.div key={i} className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: x, top: y }}
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.4 + i * 0.25, type: 'spring', stiffness: 200 }}>
            <div className="flex flex-col items-center gap-1">
              <div className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white shadow-lg"
                style={{ background: colors[i % colors.length] }}>{i + 1}</div>
              <div className="w-28 rounded-md bg-white/5 px-2 py-1 text-center text-[11px] font-medium leading-tight text-white/90 backdrop-blur">{s}</div>
            </div>
          </motion.div>
        );
      })}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="text-lg font-bold text-white">Траектория</div>
        <div className="text-xs text-white/50">замкнутый цикл</div>
      </div>
    </div>
  );
}

// Горизонтальный конвейер (Рабочий кабинет)
export function Pipeline({ steps, accent }: { steps: string[]; accent: string }) {
  return (
    <div className="flex flex-wrap items-stretch justify-center gap-2">
      {steps.map((s, i) => (
        <motion.div key={i} className="flex items-center gap-2"
          initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 + i * 0.08 }}>
          <div className="flex min-h-[64px] w-[120px] flex-col justify-center rounded-xl border px-3 py-2 text-center text-[12px] font-medium leading-tight text-white/90"
            style={{ borderColor: `${accent}55`, background: `${accent}18` }}>
            <span className="mb-1 text-[10px] font-bold" style={{ color: accent }}>{String(i + 1).padStart(2, '0')}</span>
            {s}
          </div>
          {i < steps.length - 1 && (
            <Icon name="ChevronRight" size={16} className="shrink-0 text-white/30" />
          )}
        </motion.div>
      ))}
    </div>
  );
}

// Цикл обучения (learning loop)
export function LearningLoopDiagram({ steps, accent }: { steps: string[]; accent: string }) {
  const n = steps.length;
  const R = 180;
  const cx = 220;
  const cy = 220;
  return (
    <div className="relative mx-auto" style={{ width: 440, height: 440, maxWidth: '100%' }}>
      <svg viewBox="0 0 440 440" className="absolute inset-0 h-full w-full">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={`${accent}44`} strokeWidth={2.5} />
        <motion.circle cx={cx} cy={cy} r={R} fill="none" stroke={accent} strokeWidth={3} strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4 }}
          style={{ strokeDasharray: 2 * Math.PI * R }} />
      </svg>
      {steps.map((s, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        return (
          <motion.div key={i} className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: x, top: y }} initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ delay: 0.3 + i * 0.18, type: 'spring', stiffness: 200 }}>
            <div className="flex flex-col items-center gap-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white shadow"
                style={{ background: accent }}>{i + 1}</div>
              <div className="w-24 rounded bg-white/5 px-1.5 py-1 text-center text-[10px] font-medium leading-tight text-white/90">{s}</div>
            </div>
          </motion.div>
        );
      })}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <Icon name="RefreshCw" size={22} style={{ color: accent }} className="mx-auto" />
        <div className="mt-1 text-xs font-semibold text-white/70">Цикл обучения</div>
      </div>
    </div>
  );
}

// Growth map / evidence graph (профессиональный кабинет)
export function GrowthMapDiagram({ steps, accent }: { steps: string[]; accent: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {steps.map((s, i) => (
        <motion.div key={i} className="flex w-full max-w-md flex-col items-center"
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.12 }}>
          <div className="w-full rounded-xl border px-4 py-3 text-center text-sm font-medium text-white/90"
            style={{ borderColor: `${accent}55`, background: `${accent}14`, width: i === 0 ? '100%' : `${100 - i * 12}%` }}>
            {i === 0 && <div className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: accent }}>Источники</div>}
            {s}
          </div>
          {i < steps.length - 1 && <Icon name="ChevronDown" size={16} className="my-0.5 text-white/30" />}
        </motion.div>
      ))}
    </div>
  );
}

// Control tower (суперадминка) — панель управления
export function ControlTower({ items, accent }: { items: string[]; accent: string }) {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((s, i) => (
        <motion.div key={i} className="rounded-xl border px-4 py-4 text-sm font-medium text-white/90"
          style={{ borderColor: `${accent}44`, background: `${accent}12` }}
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.07 }}>
          <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${accent}30` }}>
            <Icon name="Gauge" size={16} style={{ color: accent }} />
          </div>
          {s}
        </motion.div>
      ))}
    </div>
  );
}

// Три связанных блока кабинетов
export function CabinetsLink({ groups }: { groups: { title: string; items: string[]; cabinet?: CabinetKey }[] }) {
  return (
    <div className="flex flex-col items-stretch justify-center gap-3 md:flex-row md:items-center">
      {groups.map((g, i) => {
        const t = g.cabinet ? CABINET_THEME[g.cabinet] : CABINET_THEME.work;
        return (
          <div key={i} className="flex flex-1 items-center gap-3">
            <motion.div className="flex-1 rounded-2xl border p-5"
              style={{ borderColor: `${t.accent}55`, background: `${t.accent}14` }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.15 }}>
              <div className="text-base font-bold text-white">{g.title}</div>
              <div className="mt-2 text-sm text-white/70">{g.items[0]}</div>
            </motion.div>
            {i < groups.length - 1 && (
              <Icon name="ArrowRight" size={22} className="hidden shrink-0 text-white/30 md:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}
