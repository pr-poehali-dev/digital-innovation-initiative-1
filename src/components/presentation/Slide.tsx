import { motion } from 'framer-motion';
import Icon from '@/components/ui/icon';
import { CABINET_THEME } from './theme';
import type { SlideData } from './slides-data';
import { BulletList, GroupCards, StatusColumns, Lead } from './SlideBlocks';
import { EcosystemLoop, Pipeline, LearningLoopDiagram, GrowthMapDiagram, ControlTower, CabinetsLink } from './diagrams';

function SlideTitle({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <motion.h2 className="mx-auto max-w-4xl text-center text-2xl font-extrabold leading-tight text-white md:text-4xl"
      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
      {children}
      {accent && <div className="mx-auto mt-3 h-1 w-16 rounded-full" style={{ background: accent }} />}
    </motion.h2>
  );
}

export default function Slide({ data }: { data: SlideData }) {
  const t = data.cabinet ? CABINET_THEME[data.cabinet] : null;
  const accent = t?.accent || '#3B82F6';

  const Header = () => (
    <div className="mb-6 flex items-center justify-center gap-2">
      {t && <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: `${accent}22`, color: accent }}>{t.name}</span>}
      <span className="text-xs font-medium uppercase tracking-widest text-white/40">{data.section}</span>
    </div>
  );

  // ---- Специальные полноэкранные типы ----
  if (data.kind === 'title' || data.kind === 'final') {
    const isFinal = data.kind === 'final';
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}>
          <div className="mb-6 flex items-center justify-center gap-2">
            {(['work', 'learning', 'professional'] as const).map((k) => (
              <span key={k} className="h-2.5 w-10 rounded-full" style={{ background: CABINET_THEME[k].accent }} />
            ))}
          </div>
          <h1 className="bg-gradient-to-r from-blue-400 via-violet-400 to-teal-300 bg-clip-text text-5xl font-black text-transparent md:text-7xl">
            {data.title}
          </h1>
          {data.subtitle && <p className="mx-auto mt-6 max-w-2xl text-xl font-medium text-white/85 md:text-2xl">{data.subtitle}</p>}
          {data.lead && <p className="mx-auto mt-4 max-w-xl text-base text-white/55 md:text-lg">{data.lead}</p>}
          {isFinal && (
            <div className="mt-8 flex items-center justify-center gap-3 text-white/50">
              <Icon name="RefreshCw" size={18} />
              <span className="text-sm">Работа → Обучение → Компетенции → Рост</span>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center px-6 py-10 md:px-14">
      <Header />
      <SlideTitle accent={accent}>{data.title}</SlideTitle>
      <div className="mt-8 flex flex-col items-center gap-6">
        {data.lead && <Lead accent={data.kind === 'aiRole' || data.kind === 'aiMap' ? CABINET_THEME.ai.accent : undefined}>{data.lead}</Lead>}

        {/* Диаграммы */}
        {data.kind === 'ecosystemLoop' && data.steps && <EcosystemLoop steps={data.steps} />}
        {data.kind === 'workPipeline' && data.steps && <Pipeline steps={data.steps} accent={accent} />}
        {data.kind === 'aiRole' && data.steps && <Pipeline steps={data.steps} accent={CABINET_THEME.ai.accent} />}
        {data.kind === 'learningLoop' && data.steps && <LearningLoopDiagram steps={data.steps} accent={accent} />}
        {data.kind === 'growthMap' && data.steps && <GrowthMapDiagram steps={data.steps} accent={accent} />}
        {data.kind === 'cabinetsLink' && data.groups && <CabinetsLink groups={data.groups} />}
        {data.kind === 'adminTower' && data.bullets && <ControlTower items={data.bullets} accent={accent} />}

        {/* Группы-карточки */}
        {(data.kind === 'whatIs' || data.kind === 'platformMap' || data.kind === 'mission' || data.kind === 'cabinetCompose' || data.kind === 'roles') && data.groups && (
          <GroupCards groups={data.groups} defaultCabinet={data.cabinet} />
        )}

        {/* Колонки-статусы */}
        {(data.kind === 'problem' || data.kind === 'statusZones' || data.kind === 'roadmap' || data.kind === 'valueTwoCol' ||
          data.kind === 'hqDiff' || data.kind === 'planDiff' || data.kind === 'roadmapDiff') && data.columns && (
          <StatusColumns columns={data.columns} />
        )}

        {/* Буллеты (после диаграммы или отдельно) */}
        {data.bullets && data.kind !== 'adminTower' && (
          <BulletList items={data.bullets} accent={data.kind === 'aiMap' ? CABINET_THEME.ai.accent : accent} />
        )}

        {/* Drivers */}
        {data.kind === 'drivers' && !data.bullets && null}
      </div>
    </div>
  );
}
