import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { execApi, DecisionRequestRegistryItem } from "@/lib/execCabinetApi";
import { Empty, ErrorBox, Loading, Metric, fmtDate } from "@/components/exec/ExecUI";
import ConvertToActionForm from "@/components/exec/ConvertToActionForm";

const TYPE_LABEL: Record<string, string> = {
  decision: "Управленческое решение",
  data_clarification: "Уточнение данных",
};
const TYPE_CLS: Record<string, string> = {
  decision: "bg-amber-100 text-amber-700 border-amber-300",
  data_clarification: "bg-blue-100 text-blue-700 border-blue-300",
};
const PRIORITY_LABEL: Record<string, string> = { low: "Низкий", medium: "Средний", high: "Высокий" };
const PRIORITY_CLS: Record<string, string> = {
  low: "text-slate-500", medium: "text-amber-600", high: "text-red-600",
};

/**
 * Единый реестр вопросов по всем инициативам портфеля — управленческие
 * решения и уточнения данных вперемешку с признаком типа. Ничего не
 * направляется автоматически: все вопросы создаются как черновики
 * (dispatch_status='draft_not_sent') и требуют явного действия
 * пользователя — преобразования в поручение с подтверждением адресата,
 * срока и ожидаемого результата.
 */
export default function ExecDecisionRequestsRegistryPage() {
  const [items, setItems] = useState<DecisionRequestRegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [convertItem, setConvertItem] = useState<DecisionRequestRegistryItem | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    execApi.decisionRequestsRegistry()
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(
    () => (typeFilter === "all" ? items : items.filter((i) => i.question_type === typeFilter)),
    [items, typeFilter],
  );

  const decisionCount = items.filter((i) => i.question_type === "decision").length;
  const clarificationCount = items.filter((i) => i.question_type === "data_clarification").length;
  const notSentCount = items.filter((i) => i.dispatch_status === "draft_not_sent").length;
  const convertedCount = items.filter((i) => i.dispatch_status === "converted").length;

  if (loading) return <Layout><div className="p-6"><Loading /></div></Layout>;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Icon name="ListChecks" size={20} className="text-violet-600" />
            Реестр вопросов по портфелю
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Все вопросы созданы как черновики и никому не направлены. Проверьте формулировки, затем
            преобразуйте выбранные вопросы в поручения с подтверждённым адресатом и сроком.
          </p>
        </div>

        {error && <ErrorBox message={error} onRetry={load} />}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Всего вопросов" value={items.length} icon="ListChecks" />
          <Metric label="Управленческих решений" value={decisionCount} icon="Gavel" tone="warning" />
          <Metric label="Уточнений данных" value={clarificationCount} icon="HelpCircle" />
          <Metric label="Не направлено / преобразовано" value={`${notSentCount} / ${convertedCount}`} icon="Send" />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {[
            { id: "all", label: "Все" },
            { id: "decision", label: "Решения" },
            { id: "data_clarification", label: "Уточнения данных" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTypeFilter(t.id)}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                typeFilter === t.id ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Empty text="Вопросов не найдено" icon="ListChecks" />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                    <th className="py-2 px-3 font-medium">Инициатива</th>
                    <th className="py-2 px-3 font-medium">Вопрос</th>
                    <th className="py-2 px-3 font-medium">Тип</th>
                    <th className="py-2 px-3 font-medium">Подразделение</th>
                    <th className="py-2 px-3 font-medium">Адресат</th>
                    <th className="py-2 px-3 font-medium">Приоритет</th>
                    <th className="py-2 px-3 font-medium">Срок</th>
                    <th className="py-2 px-3 font-medium">Статус</th>
                    <th className="py-2 px-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((it) => (
                    <tr key={it.id} className="align-top">
                      <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                        {it.initiative_code ? `${it.initiative_code} · ` : ""}{it.initiative_title}
                      </td>
                      <td className="py-2.5 px-3 text-sm text-slate-800 max-w-md">
                        <p>{it.question}</p>
                        {it.source_note && (
                          <p className="text-[11px] text-slate-400 mt-1">Источник: {it.source_note}</p>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${TYPE_CLS[it.question_type]}`}>
                          {TYPE_LABEL[it.question_type] || it.question_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-600">{it.customer_org_unit_name || "—"}</td>
                      <td className="py-2.5 px-3 text-xs text-slate-600">
                        {it.addressee_name ? (
                          <>
                            {it.addressee_name}
                            {it.addressee_position && <span className="block text-slate-400">{it.addressee_position}</span>}
                          </>
                        ) : (
                          <span className="text-slate-400 italic">не подтверждён</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        {it.priority ? (
                          <span className={`font-medium ${PRIORITY_CLS[it.priority]}`}>{PRIORITY_LABEL[it.priority]}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-500">
                        {it.due_at ? fmtDate(it.due_at) : <span className="text-slate-400">не установлен</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        {it.dispatch_status === "converted" ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-300">
                            преобразован в поручение
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-300">
                            черновик — не направлено
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {it.dispatch_status !== "converted" && (
                          <button
                            onClick={() => setConvertItem(it)}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors whitespace-nowrap"
                          >
                            В поручение
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {convertItem && (
        <ConvertToActionForm
          item={convertItem}
          onClose={() => setConvertItem(null)}
          onDone={() => { setConvertItem(null); load(); }}
        />
      )}
    </Layout>
  );
}
