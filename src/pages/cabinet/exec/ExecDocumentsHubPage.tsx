import { useState } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import PageGuide from "@/components/exec/PageGuide";
import { execPageGuides } from "@/config/execPageGuides";
import DocTemplatesTab from "@/components/exec/documents/DocTemplatesTab";
import DocVersionsTab from "@/components/exec/documents/DocVersionsTab";
import PackagesTab from "@/components/exec/documents/PackagesTab";
import DocumentsHistoryTab from "@/components/exec/documents/DocumentsHistoryTab";

type SubTab = "templates" | "drafts" | "published" | "packages" | "history";

const TABS: { id: SubTab; title: string; icon: string }[] = [
  { id: "templates", title: "Шаблоны", icon: "FileStack" },
  { id: "drafts", title: "Черновики", icon: "FilePlus2" },
  { id: "published", title: "Опубликованные версии", icon: "FileCheck" },
  { id: "packages", title: "Руководительские пакеты", icon: "Package" },
  { id: "history", title: "История", icon: "History" },
];

/** Раздел «Управленческие документы»: реестр шаблонов, формирование
 * черновиков из существующих контуров данных, публикация неизменяемых
 * версий с SHA-256, руководительский пакет. Повестка/протокол
 * публикуются со страницы конкретной встречи (расширение exec_meeting).
 * Backend — расширение exec-reports и exec-control, новую cloud function
 * не создаёт. */
export default function ExecDocumentsHubPage() {
  const [tab, setTab] = useState<SubTab>("templates");
  const [pendingTemplateId, setPendingTemplateId] = useState<number | null>(null);

  const goToDraft = (templateId: number) => {
    setPendingTemplateId(templateId);
    setTab("drafts");
  };

  return (
    <Layout>
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900">Управленческие документы</h1>
            <p className="text-sm text-slate-500 mt-1">
              Шаблон → черновик → предупреждения → публикация → неизменяемая версия → HTML/DOCX/XLSX
            </p>
          </div>
        </header>

        <div className="mb-5">
          <PageGuide {...execPageGuides.documentsHub} />
        </div>

        <div className="border-b border-slate-200 mb-5 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors inline-flex items-center gap-1.5 ${
                  tab === t.id
                    ? "border-violet-600 text-violet-700 font-medium"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon name={t.icon} size={14} />
                {t.title}
              </button>
            ))}
          </div>
        </div>

        {tab === "templates" && <DocTemplatesTab onCreateDraft={goToDraft} />}
        {tab === "drafts" && (
          <DocVersionsTab status="draft" initialTemplateId={pendingTemplateId} onOpen={() => setPendingTemplateId(null)} />
        )}
        {tab === "published" && <DocVersionsTab status="published" onOpen={() => {}} />}
        {tab === "packages" && <PackagesTab />}
        {tab === "history" && <DocumentsHistoryTab />}
      </div>
    </Layout>
  );
}