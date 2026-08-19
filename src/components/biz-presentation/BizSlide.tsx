import Icon from "@/components/ui/icon";
import type { Slide } from "@/lib/bizPresentationsApi";
import { COVER_GRADIENTS } from "./theme";
import BlockRenderer from "./BlockRenderer";

export default function BizSlide({ slide, presTitle }: { slide: Slide; presTitle?: string }) {
  if (slide.layout === "cover") {
    const grad = COVER_GRADIENTS[slide.blocks?.[0]?.color || "violet"] || COVER_GRADIENTS.violet;
    return (
      <div className={`h-full w-full flex flex-col items-center justify-center text-center px-8 bg-gradient-to-br ${grad}`}>
        {presTitle && (
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/70 mb-4">{presTitle}</span>
        )}
        <h1 className="text-3xl md:text-6xl font-extrabold text-white leading-tight max-w-4xl" style={{ fontFamily: "'Montserrat',sans-serif" }}>
          {slide.title}
        </h1>
        {slide.subtitle && (
          <p className="text-base md:text-xl text-white/85 mt-5 max-w-2xl font-medium">{slide.subtitle}</p>
        )}
      </div>
    );
  }

  if (slide.layout === "closing") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-center px-8 bg-white">
        <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-fuchsia-600 flex items-center justify-center mb-5">
          <Icon name="Check" size={26} className="text-white" />
        </span>
        <h1 className="text-2xl md:text-4xl font-extrabold text-gray-900" style={{ fontFamily: "'Montserrat',sans-serif" }}>
          {slide.title}
        </h1>
        {slide.subtitle && <p className="text-sm md:text-lg text-gray-500 mt-3 max-w-xl">{slide.subtitle}</p>}
        <div className="mt-8 w-full max-w-3xl space-y-4">
          {(slide.blocks || []).map((b) => (
            <BlockRenderer key={b.id} block={b} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-gray-50" style={{ fontFamily: "'Rubik',sans-serif" }}>
      <div className="min-h-full flex flex-col items-center justify-center px-6 md:px-16 py-10 md:py-14">
        <div className="text-center mb-8 max-w-4xl">
          <h2 className="text-xl md:text-3xl font-extrabold text-gray-900 leading-tight" style={{ fontFamily: "'Montserrat',sans-serif" }}>
            {slide.title}
          </h2>
          {slide.subtitle && (
            <p className="text-sm md:text-base text-gray-500 mt-2.5 font-medium">{slide.subtitle}</p>
          )}
        </div>
        <div className="w-full flex flex-col items-center gap-6">
          {(slide.blocks || []).map((b) => (
            <BlockRenderer key={b.id} block={b} />
          ))}
        </div>
      </div>
    </div>
  );
}