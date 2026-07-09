import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { readPostImportResult, clearPostImportResult, type ImportResult } from "@/components/dept/postImportResult";
import { downloadExtractTemplate } from "@/components/dept/SourceCoverageBanner";

interface Props {
  projectId: number;
  onOpenTree?: () => void;
  onShowUnassigned?: () => void;
}

export default function PostImportBanner({ projectId, onOpenTree, onShowUnassigned }: Props) {
  const [result, setResult] = useState<ImportResult | null>(() => readPostImportResult(projectId));

  if (!result) return null;

  const dismiss = () => {
    clearPostImportResult(projectId);
    setResult(null);
  };

  const isEmpty = result.created === 0;

  return (
    <div className={`rounded-lg p-3 border ${isEmpty ? "border-slate-200 bg-slate-50" : "border-emerald-200 bg-emerald-50/70"}`}>
      <div className="flex items-start gap-2.5">
        <Icon
          name={isEmpty ? "Info" : "CheckCircle2"}
          size={18}
          className={`mt-0.5 shrink-0 ${isEmpty ? "text-slate-500" : "text-emerald-600"}`}
        />
        <div className="flex-1 min-w-0">
          {isEmpty ? (
            <p className="text-sm text-slate-700">
              Дозагрузка завершена: новых функций не найдено. Проверьте качество страниц или заполнение шаблона.
            </p>
          ) : (
            <p className="text-sm text-emerald-900">
              Дозагрузка завершена. Добавлено <span className="font-semibold">{result.created}</span>,
              автоматически привязано <span className="font-semibold">{result.auto_linked}</span>,
              без привязки <span className="font-semibold">{result.left_unmatched}</span>.
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {!isEmpty && onOpenTree && (
              <Button variant="default" size="sm" className="h-7 text-xs" onClick={onOpenTree}>
                <Icon name="Network" size={13} className="mr-1" /> Открыть дерево
              </Button>
            )}
            {result.left_unmatched > 0 && onShowUnassigned && (
              <Button variant="outline" size="sm" className="h-7 text-xs bg-white" onClick={onShowUnassigned}>
                <Icon name="AlertTriangle" size={13} className="mr-1" /> Показать несопоставленные
              </Button>
            )}
            {isEmpty && (
              <Button variant="outline" size="sm" className="h-7 text-xs bg-white" onClick={downloadExtractTemplate}>
                <Icon name="Download" size={13} className="mr-1" /> Скачать шаблон
              </Button>
            )}
          </div>
        </div>
        <button onClick={dismiss} className="text-slate-400 hover:text-slate-600 shrink-0" title="Скрыть">
          <Icon name="X" size={16} />
        </button>
      </div>
    </div>
  );
}
