import { Link } from "react-router-dom";
import Icon from "@/components/ui/icon";

interface LegalLayoutProps {
  title: string;
  children: React.ReactNode;
}

const LOGO_URL = "https://cdn.poehali.dev/projects/74e2bb00-8b75-428a-b2fe-9c02b6a39d64/files/0a6d2e9d-2156-49ee-a4b8-7baaa8811800.jpg";

const LEGAL_LINKS = [
  { to: "/legal/privacy", label: "Политика конфиденциальности" },
  { to: "/legal/terms", label: "Пользовательское соглашение" },
  { to: "/legal/offer", label: "Оферта" },
  { to: "/legal/refund", label: "Возврат средств" },
  { to: "/legal/consent", label: "Согласие на обработку ПДн" },
];

export default function LegalLayout({ title, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <img src={LOGO_URL} alt="DocMind AI" className="w-8 h-8 rounded-lg object-cover" />
            <span className="font-bold text-lg">DocMind AI</span>
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-muted-foreground">Юридические документы</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-10 flex gap-10">
        {/* Sidebar nav */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <div className="sticky top-24 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Документы</p>
            {LEGAL_LINKS.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  window.location.pathname === link.to
                    ? "bg-slate-100 text-slate-900 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-4 mt-4 border-t text-xs text-muted-foreground space-y-0.5">
              <p className="font-medium text-foreground">ИП Кузьменко А.В.</p>
              <p>ОГРНИП: 325774600908955</p>
              <p>ИНН: 231805728780</p>
              <a href="mailto:ip.kuzmenkoav@yandex.ru" className="block mt-1 hover:text-foreground transition-colors">
                ip.kuzmenkoav@yandex.ru
              </a>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0">
          {/* Mobile back */}
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 lg:hidden">
            <Icon name="ArrowLeft" size={14} />
            На главную
          </Link>

          <article className="prose prose-slate max-w-none
            prose-headings:font-semibold prose-headings:text-foreground
            prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-3
            prose-p:text-muted-foreground prose-p:leading-relaxed
            prose-li:text-muted-foreground
            prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
            prose-strong:text-foreground
          ">
            <h1 className="text-2xl font-bold text-foreground mb-2">{title}</h1>
            {children}
          </article>

          {/* Mobile legal links */}
          <div className="mt-10 pt-6 border-t lg:hidden">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Другие документы</p>
            <div className="flex flex-wrap gap-2">
              {LEGAL_LINKS.map(link => (
                <Link key={link.to} to={link.to} className="text-sm text-muted-foreground hover:text-foreground underline">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
