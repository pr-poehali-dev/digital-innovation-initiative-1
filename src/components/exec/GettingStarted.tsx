import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import QuickStartForm from "./QuickStartForm";

interface StepDef {
  n: number;
  title: string;
  why: string;
  action: string;
  href: string;
  done: boolean;
}

export default function GettingStarted({
  counts,
  onHide,
}: {
  counts: {
    initiatives: number;
    milestones: number;
    issues: number;
    risks: number;
    decisions: number;
  };
  onHide?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [quickStart, setQuickStart] = useState(false);
  const navigate = useNavigate();

  const steps: StepDef[] = [
    {
      n: 1,
      title: "Завести инициативу",
      why: "Инициатива — это то, что вы продвигаете: проект, изменение, задача уровня департамента. Всё остальное крепится к ней.",
      action: "Быстрый старт",
      href: "/cabinet/exec/initiatives",
      done: counts.initiatives > 0,
    },
    {
      n: 2,
      title: "Разложить на контрольные точки",
      why: "Точка — проверяемый результат с датой: «согласовано», «утверждено», «запущено». По ним видно, движется работа или стоит.",
      action: "Добавить точку",
      href: "/cabinet/exec/control",
      done: counts.milestones > 0,
    },
    {
      n: 3,
      title: "Зафиксировать проблемы и риски",
      why: "Проблема — то, что уже мешает. Риск — то, что может помешать. Если проблема блокирует работу, отметьте это — она поднимется наверх.",
      action: "Завести проблему",
      href: "/cabinet/exec/control",
      done: counts.issues > 0 || counts.risks > 0,
    },
    {
      n: 4,
      title: "Назначить действия и эскалации",
      why: "Действие — конкретный шаг с ответственным и сроком. Эскалация — передача вопроса выше, когда своими силами не решается.",
      action: "Перейти к контролю",
      href: "/cabinet/exec/control",
      done: counts.decisions > 0,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <div className="rounded-xl border border-violet-600/25 bg-gradient-to-br from-violet-600/8 to-transparent overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-violet-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
            <Icon name="Compass" size={18} className="text-violet-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">
              {allDone ? "Кабинет настроен" : "С чего начать"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {allDone
                ? "Все основные разделы заполнены"
                : `Шаг ${doneCount + 1} из ${steps.length} — четыре действия, чтобы кабинет начал показывать картину`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1">
            {steps.map((s) => (
              <div
                key={s.n}
                className={`w-8 h-1 rounded-full ${s.done ? "bg-violet-600" : "bg-slate-100"}`}
              />
            ))}
          </div>
          <Icon
            name={open ? "ChevronUp" : "ChevronDown"}
            size={16}
            className="text-slate-500"
          />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {steps.map((s) => (
            <div
              key={s.n}
              className={`flex items-start gap-3 p-3 rounded-lg border ${
                s.done
                  ? "border-green-500/20 bg-green-500/5"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-medium ${
                  s.done
                    ? "bg-green-500/20 text-green-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {s.done ? <Icon name="Check" size={13} /> : s.n}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-900 font-medium">{s.title}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{s.why}</p>
              </div>
              {!s.done && s.n === 1 && (
                <button
                  onClick={() => setQuickStart(true)}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1.5"
                >
                  <Icon name="Zap" size={12} />
                  {s.action}
                </button>
              )}
              {!s.done && s.n !== 1 && (
                <Link
                  to={s.href}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0"
                >
                  {s.action}
                </Link>
              )}
            </div>
          ))}

          <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <Icon name="Lightbulb" size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-500 leading-relaxed">
              <span className="text-slate-700">Результат работы кабинета</span> — этот экран.
              Он собирает всё, что требует вашего решения: что блокирует работу, где сорваны
              сроки, какие вопросы ждут вас. Чем полнее заведены данные, тем точнее картина.
            </p>
          </div>

          {allDone && onHide && (
            <button
              onClick={onHide}
              className="w-full py-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300 text-xs transition-colors"
            >
              Скрыть подсказку
            </button>
          )}
        </div>
      )}

      {quickStart && (
        <QuickStartForm
          onClose={() => setQuickStart(false)}
          onDone={(id) => navigate(`/cabinet/exec/initiatives/${id}`)}
        />
      )}
    </div>
  );
}