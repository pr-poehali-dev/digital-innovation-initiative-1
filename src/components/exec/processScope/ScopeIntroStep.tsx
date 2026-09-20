import Icon from "@/components/ui/icon";
import { ProcessModelScope } from "@/lib/execProcessScopeApi";

export default function ScopeIntroStep({
  scope,
  onStart,
}: {
  scope: ProcessModelScope;
  onStart: () => void;
}) {
  const alreadyStarted = scope.wizard_status !== "not_started";

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Этап 1. Границы Блока ВК</h3>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          Это первый шаг обучающего мастера процессного управления. Здесь мы не рисуем процессы
          и не строим схемы — мы формируем паспорт границ модели: какие подразделения входят в
          Блок ВК, зачем он существует, что входит и не входит в модель, и какими документами это
          подтверждено.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {[
          { icon: "Building2", title: "Состав", desc: "Подтвердите или скорректируйте список подразделений" },
          { icon: "Target", title: "Назначение", desc: "Опишите, зачем существует Блок ВК" },
          { icon: "FileText", title: "Документы", desc: "Загрузите положения с метаданными вручную" },
          { icon: "ListChecks", title: "Проверка", desc: "Увидите, чего не хватает, перед подтверждением" },
        ].map((s) => (
          <div key={s.title} className="rounded-lg border border-slate-200 p-3 flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Icon name={s.icon} size={15} className="text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">{s.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-start gap-2">
        <Icon name="ShieldCheck" size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          Помощник в этой версии — методический, не генеративный: подсказки и проверки заранее
          заданы и работают без передачи данных внешней модели. Содержимое загруженных документов
          не отправляется в YandexGPT или Yandex Vision.
        </p>
      </div>

      <button
        onClick={onStart}
        className="px-5 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors flex items-center gap-2"
      >
        {alreadyStarted ? "Продолжить черновик" : "Начать"}
        <Icon name="ArrowRight" size={15} />
      </button>
    </div>
  );
}
