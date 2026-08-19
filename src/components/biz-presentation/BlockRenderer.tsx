import Icon from "@/components/ui/icon";
import type { Block } from "@/lib/bizPresentationsApi";
import { semColor, COVER_GRADIENTS } from "./theme";

export default function BlockRenderer({ block }: { block: Block }) {
  switch (block.kind) {
    case "text":
      return (
        <p className="text-base md:text-lg text-gray-600 leading-relaxed max-w-3xl mx-auto text-center">
          {block.text}
        </p>
      );

    case "bullets":
      return (
        <ul className="max-w-2xl mx-auto space-y-3 w-full">
          {(block.items || []).map((it, i) => (
            <li key={i} className="flex items-start gap-3 bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3">
              <span className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm md:text-base text-gray-700 leading-snug">{it}</span>
            </li>
          ))}
        </ul>
      );

    case "metrics":
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl mx-auto">
          {(block.metrics || []).map((m, i) => {
            const c = semColor(m.color);
            return (
              <div key={i} className={`rounded-2xl border ${c.border} ${c.bg} p-5 text-center`}>
                <p className={`text-3xl md:text-4xl font-extrabold ${c.text}`}>{m.value}</p>
                <p className="text-xs md:text-sm text-gray-500 mt-1.5 font-medium">{m.label}</p>
              </div>
            );
          })}
        </div>
      );

    case "cards":
      return (
        <div className="grid sm:grid-cols-2 gap-4 w-full max-w-4xl mx-auto">
          {(block.cards || []).map((c, i) => {
            const col = semColor(c.color);
            return (
              <div key={i} className={`rounded-2xl border ${col.border} bg-white shadow-sm p-5`}>
                <div className="flex items-start gap-3">
                  {c.icon && (
                    <span className={`w-10 h-10 rounded-xl ${col.iconBg} flex items-center justify-center flex-shrink-0`}>
                      <Icon name={c.icon} size={19} className="text-white" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm md:text-base font-bold text-gray-900 leading-snug">{c.title}</p>
                    {c.text && <p className="text-xs md:text-sm text-gray-500 mt-1.5 leading-relaxed">{c.text}</p>}
                    {c.status && (
                      <span className={`inline-block mt-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${col.border} ${col.bg} ${col.text}`}>
                        {c.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );

    case "steps":
      return (
        <div className="w-full max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-stretch gap-3">
            {(block.steps || []).map((s, i) => {
              const col = semColor(s.color);
              return (
                <div key={i} className="flex-1 flex items-center gap-2">
                  <div className={`flex-1 rounded-2xl border ${col.border} ${col.bg} p-4 text-center`}>
                    <span className={`inline-flex w-7 h-7 rounded-full ${col.solid} text-white items-center justify-center text-xs font-bold mb-2`}>
                      {i + 1}
                    </span>
                    <p className="text-sm font-bold text-gray-900 leading-snug">{s.title}</p>
                    {s.text && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{s.text}</p>}
                  </div>
                  {i < (block.steps?.length || 0) - 1 && (
                    <Icon name="ChevronRight" size={20} className="text-gray-300 hidden md:block flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );

    case "roles":
      return (
        <div className="grid sm:grid-cols-2 gap-4 w-full max-w-4xl mx-auto">
          {(block.roles || []).map((r, i) => {
            const col = semColor(r.color);
            return (
              <div key={i} className="rounded-3xl bg-white border border-gray-200 shadow-sm p-5 flex flex-col gap-3">
                <span className={`w-11 h-11 rounded-2xl ${col.iconBg} flex items-center justify-center`}>
                  <Icon name={r.icon || "User"} size={20} className="text-white" />
                </span>
                <div>
                  <p className="text-sm md:text-base font-bold text-gray-900 leading-snug">{r.title}</p>
                  {r.text && <p className="text-xs md:text-sm text-gray-500 mt-1.5 leading-relaxed">{r.text}</p>}
                </div>
              </div>
            );
          })}
        </div>
      );

    case "quote":
      return (
        <div className="max-w-2xl mx-auto text-center">
          <Icon name="Quote" size={28} className="text-violet-300 mx-auto mb-3" />
          <p className="text-lg md:text-xl font-semibold text-gray-800 leading-snug">{block.text}</p>
          {block.author && <p className="text-sm text-gray-400 mt-3">{block.author}</p>}
        </div>
      );

    case "banner": {
      const grad = COVER_GRADIENTS[block.color || "violet"] || COVER_GRADIENTS.violet;
      return (
        <div className={`w-full max-w-3xl mx-auto rounded-2xl bg-gradient-to-r ${grad} px-6 py-5 text-center shadow-lg`}>
          <p className="text-base md:text-lg font-bold text-white">{block.text}</p>
        </div>
      );
    }

    case "table":
      return (
        <div className="w-full max-w-4xl mx-auto overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {(block.headers || []).map((h, i) => (
                  <th key={i} className="text-left px-4 py-2.5 font-bold text-gray-600 text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(block.rows || []).map((row, ri) => (
                <tr key={ri} className={ri % 2 === 1 ? "bg-gray-50/50" : ""}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-4 py-2.5 text-gray-700 border-t border-gray-100">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return null;
  }
}
