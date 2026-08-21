import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { DictValue } from "@/lib/execCabinetApi";

const inputCls =
  "w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm placeholder:text-slate-400 focus:border-violet-600 outline-none transition-colors";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 mb-1.5 block">
        {label}
        {required && <span className="text-violet-600 ml-1">*</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
      {hint && <span className="text-[11px] text-slate-400 mt-1 block">{hint}</span>}
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 mb-1.5 block">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`${inputCls} resize-y leading-relaxed`}
      />
      {hint && <span className="text-[11px] text-slate-400 mt-1 block">{hint}</span>}
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "не выбрано",
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 mb-1.5 block">
        {label}
        {required && <span className="text-violet-600 ml-1">*</span>}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="text-[11px] text-slate-400 mt-1 block">{hint}</span>}
    </label>
  );
}

export function DictSelect({
  label,
  value,
  onChange,
  values,
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  values: DictValue[];
  required?: boolean;
  hint?: string;
}) {
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      required={required}
      hint={hint}
      options={(values || []).map((v) => ({ value: v.code, label: v.title }))}
    />
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 mb-1.5 block">{label}</span>
      <input
        type="date"
        value={value ? value.slice(0, 10) : ""}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} `}
      />
    </label>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer group">
      <span
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        className={`w-[18px] h-[18px] rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
          checked
            ? "bg-violet-600 border-violet-600"
            : "border-slate-200 group-hover:border-slate-400"
        }`}
      >
        {checked && <Icon name="Check" size={12} className="text-slate-900" />}
      </span>
      <span className="min-w-0">
        <span className="text-sm text-slate-700 block leading-snug">{label}</span>
        {hint && <span className="text-[11px] text-slate-400 block mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  onSave,
  saving,
  saveLabel = "Сохранить",
  canSave = true,
  error,
  wide,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
  canSave?: boolean;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/75 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`bg-white border border-slate-200 rounded-xl w-full my-8 ${
          wide ? "max-w-4xl" : "max-w-2xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 p-5 border-b border-slate-200 sticky top-0 bg-white rounded-t-xl z-10">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors">
            <Icon name="X" size={18} />
          </button>
        </header>

        <div className="p-5 space-y-4">{children}</div>

        {error && (
          <div className="mx-5 mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <footer className="flex items-center justify-end gap-2 p-5 border-t border-slate-200 sticky bottom-0 bg-white rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={onSave}
            disabled={saving || !canSave}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            {saving && (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {saving ? "Сохраняю…" : saveLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-violet-600/90 uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}

const VERIFICATION_OPTIONS = [
  { code: "user_draft", title: "Черновик пользователя" },
  { code: "in_review", title: "На проверке" },
  { code: "confirmed", title: "Подтверждено владельцем" },
  { code: "approved", title: "Утверждено" },
  { code: "accepted_by_exception", title: "Принято по исключению" },
  { code: "needs_update", title: "Требует актуализации" },
  { code: "archived", title: "Архив" },
];

export function VerificationSelect({
  value,
  onChange,
  saving,
}: {
  value: string;
  onChange: (v: string) => void;
  saving?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = VERIFICATION_OPTIONS.find((o) => o.code === value);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 hover:border-slate-400 transition-colors disabled:opacity-50"
      >
        {saving && (
          <span className="w-3 h-3 border border-slate-300 border-t-violet-600 rounded-full animate-spin" />
        )}
        {current?.title || "Статус"}
        <Icon name="ChevronDown" size={12} className="text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-xl z-40 py-1">
            {VERIFICATION_OPTIONS.map((o) => (
              <button
                key={o.code}
                onClick={() => {
                  onChange(o.code);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  o.code === value
                    ? "bg-violet-100 text-violet-700"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {o.title}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
