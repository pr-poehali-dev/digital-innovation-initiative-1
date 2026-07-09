import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";

const TEMPLATE_EXTRACT = "source_ref,page_no,source_section_code,function_text,confidence,is_function,category,directions,source_snippet,notes\n";

export function downloadExtractTemplate() {
  const blob = new Blob([TEMPLATE_EXTRACT], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "functions_extract_sheet.csv";
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  thinManagements?: { code: string; name: string; own_count: number }[];
  onUpload?: () => void;
  onShowUnassigned?: () => void;
  variant?: "banner" | "empty";
}

export default function SourceCoverageBanner({ thinManagements = [], onUpload, onShowUnassigned, variant = "banner" }: Props) {
  const sections = thinManagements.map((m) => m.code).join(" и ") || "4.1 и 4.2";

  if (variant === "empty") {
    return (
      <div className="border border-dashed border-slate-200 rounded-lg p-8 text-center">
        <Icon name="SearchCheck" size={32} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-600 font-medium mb-1">Пересечения пока не найдены.</p>
        <p className="text-xs text-slate-400 mb-1">
          Это не значит, что дублей нет — возможная причина в неполной загрузке источников
          {thinManagements.length > 0 ? ` по разделам ${sections}` : ""}.
        </p>
        <p className="text-xs text-slate-400 mb-3">
          Отчёт строится по функциям, привязанным к дереву. Добавьте недостающие страницы — и пересечения появятся.
        </p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {onUpload && (
            <Button variant="default" size="sm" onClick={onUpload}>
              <Icon name="Upload" size={14} className="mr-1.5" /> Загрузить страницы
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={downloadExtractTemplate}>
            <Icon name="Download" size={14} className="mr-1.5" /> Скачать шаблон
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-blue-200 bg-blue-50/60 rounded-lg p-3">
      <div className="flex items-start gap-2.5">
        <Icon name="Info" size={18} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-blue-900">
            Загрузка неполная: по разделам <span className="font-medium">{sections}</span> отсутствуют полные страницы.
          </p>
          <p className="text-xs text-blue-700/80 mt-0.5">
            Часть функций может быть не извлечена, а отчёт «Пересечения функций» пока неполный.
          </p>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {onUpload && (
              <Button variant="default" size="sm" className="h-7 text-xs" onClick={onUpload}>
                <Icon name="Upload" size={13} className="mr-1" /> Загрузить страницы {sections}
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs bg-white" onClick={downloadExtractTemplate}>
              <Icon name="Download" size={13} className="mr-1" /> Скачать шаблон
            </Button>
            {onShowUnassigned && (
              <button onClick={onShowUnassigned} className="text-xs text-blue-700 underline underline-offset-2 hover:text-blue-900">
                Показать несопоставленные
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
