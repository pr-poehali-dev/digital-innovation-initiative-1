import { useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import {
  DOC_TYPE_LABEL,
  KnowledgeDetail,
  fileToBase64,
  knowledgeApi,
} from "@/lib/execKnowledgeApi";
import { Modal, Section, SelectField, TextArea, TextField } from "./ExecForm";

const ACCEPT = ".pdf,.docx,.pptx,.txt,.md";

export default function KnowledgeForm({
  item,
  onClose,
  onSaved,
}: {
  item?: KnowledgeDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!item;
  const [mode, setMode] = useState<"file" | "text">(editing ? "text" : "file");
  const [f, setF] = useState({
    title: item?.title || "",
    doc_type: item?.doc_type || "rule",
    summary: item?.summary || "",
    body: item?.body || "",
    priority: String(item?.priority ?? 50),
  });
  const [useInAi, setUseInAi] = useState(item?.use_in_ai ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    const ext = chosen.name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "docx", "pptx", "txt", "md"].includes(ext)) {
      setError("Поддерживаются PDF, DOCX, PPTX, TXT");
      return;
    }
    if (chosen.size > 20 * 1024 * 1024) {
      setError("Файл больше 20 МБ");
      return;
    }
    setError("");
    setFile(chosen);
    if (!f.title.trim()) {
      setF((p) => ({ ...p, title: chosen.name.replace(/\.[^.]+$/, "") }));
    }
  };

  const save = async () => {
    if (mode === "file" && !editing) {
      if (!file) {
        setError("Выберите файл");
        return;
      }
      setSaving(true);
      setError("");
      try {
        const b64 = await fileToBase64(file);
        await knowledgeApi.upload({
          filename: file.name,
          file_data: b64,
          title: f.title.trim() || file.name,
          doc_type: f.doc_type,
          summary: f.summary,
          use_in_ai: useInAi,
          priority: Number(f.priority) || 50,
        });
        onSaved();
      } catch (e) {
        setError((e as Error).message);
        setSaving(false);
      }
      return;
    }

    if (!f.title.trim()) {
      setError("Укажите название");
      return;
    }
    if (!f.body.trim()) {
      setError("Впишите текст правила или выдержку из регламента");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await knowledgeApi.saveNote({
        ...(item ? { id: item.id } : {}),
        title: f.title.trim(),
        doc_type: f.doc_type,
        summary: f.summary,
        body: f.body,
        use_in_ai: useInAi,
        priority: Number(f.priority) || 50,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? "Документ базы знаний" : "Добавить в базу знаний"}
      subtitle="AI будет опираться на это при планировании и советах"
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      saveLabel={editing ? "Сохранить" : "Добавить"}
      wide
    >
      {!editing && (
        <div className="flex items-center gap-1 border-b border-slate-200 -mt-1">
          {[
            { id: "file", label: "Загрузить файл", icon: "Upload" },
            { id: "text", label: "Вписать текстом", icon: "PenLine" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id as "file" | "text")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                mode === t.id
                  ? "border-violet-600 text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {mode === "file" && !editing && (
        <Section title="Файл">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            onChange={pickFile}
            className="hidden"
            id="knowledge-file"
          />
          <label
            htmlFor="knowledge-file"
            className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-8 px-4 cursor-pointer transition-colors ${
              file
                ? "border-violet-300 bg-violet-50/50"
                : "border-slate-300 hover:border-violet-300 hover:bg-slate-50"
            }`}
          >
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center">
              <Icon
                name={file ? "FileCheck" : "Upload"}
                size={20}
                className={file ? "text-violet-600" : "text-slate-500"}
              />
            </div>
            {file ? (
              <>
                <p className="text-sm font-medium text-slate-900">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {(file.size / 1024).toFixed(0)} КБ · нажмите, чтобы заменить
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-900">Выберите документ</p>
                <p className="text-xs text-slate-500">PDF, DOCX, PPTX, TXT — до 20 МБ</p>
              </>
            )}
          </label>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Текст будет извлечён автоматически, включая таблицы — матрицы ответственности
            распознаются построчно.
          </p>
        </Section>
      )}

      {(mode === "text" || editing) && (
        <Section title="Содержание">
          <TextArea
            label="Текст правила, регламента или вводной"
            value={f.body}
            onChange={set("body")}
            rows={10}
            hint="Можно вставить выдержку из документа — AI будет ей следовать"
          />
        </Section>
      )}

      <Section title="Описание">
        <TextField
          label="Название"
          value={f.title}
          onChange={set("title")}
          placeholder="Например: Матрица стейкхолдеров по этапам"
          required
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Тип документа"
            value={f.doc_type}
            onChange={set("doc_type")}
            options={Object.entries(DOC_TYPE_LABEL).map(([k, v]) => ({ value: k, label: v }))}
          />
          <SelectField
            label="Приоритет для AI"
            value={f.priority}
            onChange={set("priority")}
            options={[
              { value: "90", label: "Высокий — учитывать в первую очередь" },
              { value: "50", label: "Обычный" },
              { value: "20", label: "Низкий — справочно" },
            ]}
          />
        </div>
        <TextArea
          label="Краткое пояснение"
          value={f.summary}
          onChange={set("summary")}
          rows={2}
          hint="Зачем этот документ и когда применяется"
        />
      </Section>

      <label className="flex items-start gap-2.5 cursor-pointer group">
        <span
          onClick={(e) => {
            e.preventDefault();
            setUseInAi(!useInAi);
          }}
          className={`w-[18px] h-[18px] rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
            useInAi
              ? "bg-violet-600 border-violet-600"
              : "border-slate-300 group-hover:border-slate-400"
          }`}
        >
          {useInAi && <Icon name="Check" size={12} className="text-white" />}
        </span>
        <span className="min-w-0">
          <span className="text-sm text-slate-700 block leading-snug">
            Учитывать при работе AI
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            AI будет опираться на этот документ, когда строит планы и даёт советы
          </span>
        </span>
      </label>
    </Modal>
  );
}
