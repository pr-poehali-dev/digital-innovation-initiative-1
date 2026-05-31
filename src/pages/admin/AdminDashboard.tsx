import AdminShell from "@/components/admin/AdminShell";
import Icon from "@/components/ui/icon";

const CARDS = [
  { label: "Пользователи", icon: "Users", href: "/admin/users", color: "text-blue-400" },
  { label: "Проекты", icon: "FolderOpen", href: "/admin/projects", color: "text-purple-400" },
  { label: "AI-операции", icon: "Sparkles", href: "/admin/ai-runs", color: "text-orange-400" },
  { label: "Кошелёк", icon: "Wallet", href: "/admin/wallet", color: "text-green-400" },
  { label: "Аудит", icon: "ClipboardList", href: "/admin/audit", color: "text-red-400" },
];

export default function AdminDashboard() {
  return (
    <AdminShell>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Дашборд</h1>
          <p className="text-gray-500 text-sm mt-1">Супер-админ панель управления</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl">
          {CARDS.map(card => (
            <a
              key={card.href}
              href={card.href}
              className="group flex flex-col gap-3 p-5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors"
            >
              <Icon name={card.icon} size={22} className={card.color} />
              <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                {card.label}
              </span>
            </a>
          ))}
        </div>

        <div className="mt-10 p-4 rounded-xl bg-gray-900 border border-gray-800 max-w-2xl">
          <div className="flex items-center gap-2 text-yellow-500 mb-2">
            <Icon name="Construction" size={16} />
            <span className="text-sm font-medium">Разделы в разработке</span>
          </div>
          <p className="text-gray-500 text-sm">
            Фаза 1 завершена: аутентификация и базовая структура. Разделы с данными появятся в Фазе 3–4.
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
