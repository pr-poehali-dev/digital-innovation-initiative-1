import { motion } from 'framer-motion';
import Icon from '@/components/ui/icon';
import { CABINET_THEME, STATUS_STYLES, type CabinetKey } from './theme';

export function BulletList({ items, accent }: { items: string[]; accent?: string }) {
  return (
    <div className="mx-auto grid max-w-2xl gap-2.5 text-left">
      {items.map((it, i) => (
        <motion.div key={i} className="flex items-start gap-3 rounded-lg bg-white/5 px-4 py-2.5"
          initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.07 }}>
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: accent || '#3B82F6' }}>
            <Icon name="Check" size={12} />
          </span>
          <span className="text-[15px] leading-snug text-white/90">{it}</span>
        </motion.div>
      ))}
    </div>
  );
}

export function GroupCards({ groups, defaultCabinet }: { groups: { title: string; items: string[]; cabinet?: CabinetKey }[]; defaultCabinet?: CabinetKey }) {
  return (
    <div className={`mx-auto grid max-w-4xl gap-4 ${groups.length <= 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
      {groups.map((g, i) => {
        const key = g.cabinet || defaultCabinet;
        const t = key ? CABINET_THEME[key] : null;
        const accent = t?.accent || '#3B82F6';
        return (
          <motion.div key={i} className="rounded-2xl border p-5 text-left"
            style={{ borderColor: `${accent}44`, background: `${accent}10` }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.1 }}>
            <div className="mb-3 h-1 w-10 rounded-full" style={{ background: accent }} />
            <div className="text-[15px] font-bold text-white">{g.title}</div>
            <ul className="mt-2 space-y-1.5">
              {g.items.map((it, j) => (
                <li key={j} className="flex items-start gap-2 text-[13px] leading-snug text-white/75">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: accent }} />
                  {it}
                </li>
              ))}
            </ul>
          </motion.div>
        );
      })}
    </div>
  );
}

export function StatusColumns({ columns }: { columns: { title: string; items: string[]; tone?: 'done' | 'current' | 'next' }[] }) {
  return (
    <div className={`mx-auto grid max-w-5xl gap-4 ${columns.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
      {columns.map((col, i) => {
        const s = col.tone ? STATUS_STYLES[col.tone] : null;
        const dot = s?.dot || '#60A5FA';
        return (
          <motion.div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.12 }}>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
              <span className="text-[15px] font-bold text-white">{col.title}</span>
            </div>
            <ul className="space-y-2">
              {col.items.map((it, j) => (
                <li key={j} className="flex items-start gap-2 text-[13px] leading-snug text-white/80">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
                  {it}
                </li>
              ))}
            </ul>
          </motion.div>
        );
      })}
    </div>
  );
}

export function Lead({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <motion.p className="mx-auto max-w-3xl text-center text-lg font-medium leading-relaxed text-white/85 md:text-xl"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      {accent && <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: accent }} />}
      {children}
    </motion.p>
  );
}
