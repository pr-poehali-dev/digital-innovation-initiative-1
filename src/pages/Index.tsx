import SoftwareDevelopmentWebsite from "@/components/SoftwareDevelopmentWebsite"

const LOGOS = [
  {
    id: "A",
    url: "https://cdn.poehali.dev/projects/74e2bb00-8b75-428a-b2fe-9c02b6a39d64/files/0a6d2e9d-2156-49ee-a4b8-7baaa8811800.jpg",
    label: "Вариант А",
    desc: "Ворон в цилиндре с пером — живописный стиль",
  },
  {
    id: "B",
    url: "https://cdn.poehali.dev/projects/74e2bb00-8b75-428a-b2fe-9c02b6a39d64/files/498af34b-ca9b-400d-a1dc-92405a364879.jpg",
    label: "Вариант Б",
    desc: "Ворон-джентльмен с книгой — гравюрный стиль",
  },
]

const Index = () => {
  return (
    <>
      {/* Секция выбора логотипа */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-2xl p-4">
        <p className="text-center text-sm font-semibold text-slate-700 mb-3">🎨 Выбери логотип для приложения — напиши мне «Вариант А» или «Вариант Б»</p>
        <div className="flex gap-4 justify-center max-w-lg mx-auto">
          {LOGOS.map((logo) => (
            <div key={logo.id} className="flex-1 text-center">
              <img
                src={logo.url}
                alt={logo.label}
                className="w-full aspect-square object-cover rounded-2xl border-2 border-slate-200 hover:border-slate-500 transition-colors cursor-pointer shadow-sm"
              />
              <p className="mt-2 text-sm font-bold text-slate-800">{logo.label}</p>
              <p className="text-xs text-slate-500">{logo.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Отступ снизу чтобы контент не перекрывался */}
      <div className="pb-48">
        <SoftwareDevelopmentWebsite />
      </div>
    </>
  )
}

export default Index