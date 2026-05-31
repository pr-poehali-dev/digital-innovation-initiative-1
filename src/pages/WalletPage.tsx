import { useState } from "react";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";

const TARIFFS = [
  { icon: "FileText", label: "Генерация презентации", price: 25, color: "text-orange-500", bg: "bg-orange-50" },
  { icon: "Sparkles", label: "AI-анализ документа", price: 15, color: "text-purple-500", bg: "bg-purple-50" },
  { icon: "Image", label: "Создание обложки", price: 10, color: "text-blue-500", bg: "bg-blue-50" },
  { icon: "MessageSquare", label: "Чат с документом", price: 5, color: "text-green-500", bg: "bg-green-50" },
  { icon: "Search", label: "Поиск по документам", price: 3, color: "text-teal-500", bg: "bg-teal-50" },
  { icon: "ListChecks", label: "Краткое содержание", price: 7, color: "text-indigo-500", bg: "bg-indigo-50" },
  { icon: "BarChart2", label: "Аудит структуры", price: 8, color: "text-rose-500", bg: "bg-rose-50" },
  { icon: "Lightbulb", label: "AI-рекомендации", price: 4, color: "text-yellow-500", bg: "bg-yellow-50" },
  { icon: "Wand2", label: "Доработка слайда", price: 6, color: "text-pink-500", bg: "bg-pink-50" },
];

const QUICK_AMOUNTS = [100, 300, 500, 1000, 3000];

const MOCK_TRANSACTIONS = [
  { id: 1, icon: "FileText", label: "Генерация презентации", date: "26 мая, 14:32", amount: -25 },
  { id: 2, icon: "MessageSquare", label: "Чат с документом", date: "26 мая, 13:10", amount: -5 },
  { id: 3, icon: "Wallet", label: "Пополнение баланса", date: "25 мая, 10:00", amount: 500 },
  { id: 4, icon: "Sparkles", label: "AI-анализ документа", date: "24 мая, 18:45", amount: -15 },
  { id: 5, icon: "Image", label: "Создание обложки", date: "24 мая, 18:30", amount: -10 },
  { id: 6, icon: "BarChart2", label: "Аудит структуры", date: "23 мая, 09:12", amount: -8 },
  { id: 7, icon: "Wallet", label: "Пополнение баланса", date: "20 мая, 11:00", amount: 300 },
];

const MOCK_BALANCE = 309;

export default function WalletPage() {
  const [balance] = useState(MOCK_BALANCE);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [amount, setAmount] = useState("500");
  const [payMethod, setPayMethod] = useState<"card" | "sbp">("card");

  const totalTopUp = MOCK_TRANSACTIONS.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalSpent = Math.abs(MOCK_TRANSACTIONS.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
  const totalOps = MOCK_TRANSACTIONS.filter(t => t.amount < 0).length;

  // Расходы по категориям
  const categoryTotals = TARIFFS.map(t => ({
    ...t,
    total: MOCK_TRANSACTIONS.filter(tx => tx.label === t.label && tx.amount < 0).reduce((s, tx) => s + Math.abs(tx.amount), 0),
  })).filter(t => t.total > 0).sort((a, b) => b.total - a.total);

  const maxTotal = Math.max(...categoryTotals.map(c => c.total), 1);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Как работает кошелёк */}
        <div className="rounded-2xl border bg-card overflow-hidden">
          <button
            onClick={() => setShowHowItWorks(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2 text-emerald-600 font-medium">
              <Icon name="Wallet" size={18} />
              Как работает кошелёк
            </div>
            <Icon name={showHowItWorks ? "ChevronUp" : "ChevronDown"} size={18} className="text-muted-foreground" />
          </button>

          {showHowItWorks && (
            <div className="px-4 pb-4 space-y-4 border-t pt-4">
              <div>
                <p className="font-semibold text-base mb-1">Для чего нужен кошелёк?</p>
                <p className="text-sm text-muted-foreground">Кошелёк — единый баланс для всех AI-функций DocMind AI. Пополняете один раз, а средства списываются автоматически при использовании AI-инструментов.</p>
              </div>

              <div>
                <p className="font-semibold text-base mb-2">На что тратятся средства?</p>
                <div className="grid grid-cols-2 gap-2">
                  {TARIFFS.map(t => (
                    <div key={t.label} className="flex items-center gap-2 text-sm py-1 border-b border-dashed border-muted">
                      <span className={`${t.color} ${t.bg} p-1 rounded`}>
                        <Icon name={t.icon} size={13} />
                      </span>
                      <span className="text-muted-foreground flex-1">{t.label}</span>
                      <span className="font-medium whitespace-nowrap">{t.price} руб</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-semibold text-base mb-2">Как пополнить?</p>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Нажмите «Пополнить» на карточке баланса</li>
                  <li>Введите сумму (от 50 руб)</li>
                  <li>Выберите способ: банковская карта или СБП</li>
                  <li>Оплатите — средства зачислятся автоматически</li>
                </ol>
                <p className="text-sm text-muted-foreground mt-2">Баланс личный — вы сами управляете своими AI-запросами.</p>
              </div>
            </div>
          )}
        </div>

        {/* Карточка баланса */}
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-400 text-white p-5 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 rounded-full bg-white/10 translate-x-8 -translate-y-8" />
          <div className="absolute right-8 bottom-0 w-20 h-20 rounded-full bg-white/10 translate-y-6" />
          <p className="text-emerald-100 text-sm mb-1">Текущий баланс</p>
          <p className="text-4xl font-bold mb-4">{balance.toFixed(2)} <span className="text-2xl font-medium">руб</span></p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowTopUp(v => !v)}
              className="flex items-center gap-2 bg-white text-emerald-600 font-semibold px-4 py-2 rounded-xl text-sm hover:bg-emerald-50 transition-colors"
            >
              <Icon name="Plus" size={16} />
              Пополнить
            </button>
            <button className="flex items-center gap-2 bg-white/20 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-white/30 transition-colors">
              <Icon name="History" size={16} />
              История
            </button>
          </div>
        </div>

        {/* Форма пополнения */}
        {showTopUp && (
          <div className="rounded-2xl border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2 font-semibold">
              <Icon name="ArrowUpCircle" size={18} className="text-emerald-500" />
              Пополнить баланс
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Сумма (руб), минимум 50</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="500"
                className="w-full border rounded-xl px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map(a => (
                <button
                  key={a}
                  onClick={() => setAmount(String(a))}
                  className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                    amount === String(a)
                      ? "bg-emerald-500 text-white border-emerald-500"
                      : "hover:border-emerald-400 hover:text-emerald-600"
                  }`}
                >
                  {a} руб
                </button>
              ))}
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Способ оплаты</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPayMethod("card")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                    payMethod === "card"
                      ? "bg-emerald-500 text-white border-emerald-500"
                      : "hover:border-emerald-400"
                  }`}
                >
                  <Icon name="CreditCard" size={16} />
                  Картой
                </button>
                <button
                  onClick={() => setPayMethod("sbp")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                    payMethod === "sbp"
                      ? "bg-emerald-500 text-white border-emerald-500"
                      : "hover:border-emerald-400"
                  }`}
                >
                  <Icon name="Smartphone" size={16} />
                  СБП
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2.5 rounded-xl transition-colors">
                <Icon name="Lock" size={16} />
                Оплатить
              </button>
              <button
                onClick={() => setShowTopUp(false)}
                className="px-4 py-2.5 rounded-xl border font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Отмена
              </button>
            </div>
            <p className="text-xs text-muted-foreground text-center">Безопасная оплата через ЮKassa. После оплаты средства поступят автоматически.</p>
          </div>
        )}

        {/* На что тратится баланс */}
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            <Icon name="Zap" size={18} className="text-yellow-500" />
            На что тратится баланс?
          </div>
          <div className="divide-y">
            {TARIFFS.map(t => (
              <div key={t.label} className="flex items-center gap-3 py-2.5">
                <span className={`${t.bg} ${t.color} p-2 rounded-xl`}>
                  <Icon name={t.icon} size={18} />
                </span>
                <span className="flex-1 text-sm">{t.label}</span>
                <span className="text-sm font-semibold bg-muted px-2.5 py-1 rounded-full">{t.price} руб</span>
              </div>
            ))}
          </div>
        </div>

        {/* Статистика */}
        <div className="rounded-2xl border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 font-semibold">
            <Icon name="BarChart2" size={18} className="text-blue-500" />
            Статистика
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-green-600 font-bold text-xl">+{totalTopUp}</p>
              <p className="text-xs text-muted-foreground mt-0.5">пополнено</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-red-500 font-bold text-xl">-{totalSpent}</p>
              <p className="text-xs text-muted-foreground mt-0.5">потрачено</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-blue-600 font-bold text-xl">{totalOps}</p>
              <p className="text-xs text-muted-foreground mt-0.5">операций</p>
            </div>
          </div>

          {categoryTotals.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Расходы по категориям</p>
              <div className="space-y-2">
                {categoryTotals.map(c => (
                  <div key={c.label} className="flex items-center gap-2 text-sm">
                    <span className="w-36 truncate text-muted-foreground">{c.label}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-400 rounded-full"
                        style={{ width: `${(c.total / maxTotal) * 100}%` }}
                      />
                    </div>
                    <span className="w-14 text-right font-medium">{c.total} руб</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Последние операции */}
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold">Последние операции</p>
            <button className="text-sm text-emerald-600 hover:underline flex items-center gap-1">
              Все <Icon name="ChevronRight" size={14} />
            </button>
          </div>
          <div className="divide-y">
            {MOCK_TRANSACTIONS.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 py-3">
                <span className={`p-2 rounded-xl ${tx.amount > 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                  <Icon name={tx.icon} size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tx.label}</p>
                  <p className="text-xs text-muted-foreground">{tx.date}</p>
                </div>
                <span className={`font-semibold text-sm ${tx.amount > 0 ? "text-green-600" : "text-red-500"}`}>
                  {tx.amount > 0 ? "+" : ""}{tx.amount} руб
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  );
}