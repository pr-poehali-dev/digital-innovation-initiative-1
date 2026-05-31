import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import Icon from "@/components/ui/icon";
import { walletApi } from "@/lib/api";

const PRESETS = [500, 1000, 3000, 5000];

type Transaction = {
  id: number;
  amount_kopecks: number;
  amount_rub: number;
  type: "topup" | "debit" | "refund" | "adjustment";
  status: string;
  source: string | null;
  description: string | null;
  created_at: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });
}

function TxRow({ tx }: { tx: Transaction }) {
  const isTopup = tx.type === "topup" || tx.type === "refund";
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isTopup ? "bg-emerald-50" : "bg-violet-50"}`}>
        <Icon name={isTopup ? "ArrowDownLeft" : "Sparkles"} size={16} className={isTopup ? "text-emerald-500" : "text-violet-500"} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">
          {tx.description || (isTopup ? "Пополнение" : "Списание")}
        </div>
        <div className="text-xs text-slate-400">{formatDate(tx.created_at)}</div>
      </div>
      <div className={`text-sm font-semibold tabular-nums flex-shrink-0 ${isTopup ? "text-emerald-600" : "text-slate-700"}`}>
        {isTopup ? "+" : "−"}{Math.abs(tx.amount_rub).toFixed(0)} ₽
      </div>
    </div>
  );
}

export default function WalletPage() {
  const [searchParams] = useSearchParams();

  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTopUp, setShowTopUp] = useState(false);
  const [amount, setAmount] = useState("500");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  // Polling статуса платежа после возврата с ЮKassa
  const [pollingPaymentId, setPollingPaymentId] = useState<number | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "succeeded" | "failed" | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [bal, txs] = await Promise.all([
        walletApi.getBalance(),
        walletApi.getTransactions(20, 0),
      ]);
      setBalance((bal as { balance_rub: number }).balance_rub);
      setTransactions((txs as { transactions: Transaction[] }).transactions || []);
    } catch {
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Обработка возврата с ЮKassa (return_url содержит payment_id)
  useEffect(() => {
    const pid = searchParams.get("payment_id");
    if (pid) {
      setPollingPaymentId(Number(pid));
      setPaymentStatus("pending");
    }
  }, [searchParams]);

  // Polling статуса платежа (каждые 3 сек, не более 20 попыток)
  useEffect(() => {
    if (!pollingPaymentId || paymentStatus !== "pending") return;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts++;
      try {
        const res = await walletApi.getPaymentStatus(pollingPaymentId) as { status: string; webhook_processed: boolean };
        if (res.status === "succeeded" && res.webhook_processed) {
          setPaymentStatus("succeeded");
          clearInterval(timer);
          loadData();
        } else if (res.status === "cancelled" || res.status === "failed") {
          setPaymentStatus("failed");
          clearInterval(timer);
        }
      } catch { /* ignore */ }
      if (attempts >= 20) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [pollingPaymentId, paymentStatus, loadData]);

  const handleTopup = async () => {
    const rub = parseInt(amount, 10);
    if (isNaN(rub) || rub < 10) { setPayError("Минимальная сумма — 10 ₽"); return; }
    if (rub > 100000) { setPayError("Максимальная сумма — 100 000 ₽"); return; }
    setPaying(true);
    setPayError("");
    try {
      const res = await walletApi.createTopup(rub) as { confirmation_url: string; payment_id: number };
      if (res.confirmation_url) {
        window.location.href = res.confirmation_url;
      }
    } catch (e: unknown) {
      setPayError(e instanceof Error ? e.message : "Ошибка при создании платежа");
      setPaying(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Уведомление о статусе платежа */}
        {paymentStatus === "pending" && pollingPaymentId && (
          <div className="rounded-2xl bg-violet-50 border border-violet-200 px-4 py-3 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div className="text-sm text-violet-700 font-medium">Ожидаем подтверждения платежа от банка…</div>
          </div>
        )}
        {paymentStatus === "succeeded" && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
            <Icon name="CheckCircle" size={18} className="text-emerald-500 flex-shrink-0" />
            <div className="text-sm text-emerald-700 font-medium">Баланс успешно пополнен!</div>
          </div>
        )}
        {paymentStatus === "failed" && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-3">
            <Icon name="XCircle" size={18} className="text-red-500 flex-shrink-0" />
            <div className="text-sm text-red-700 font-medium">Платёж не был завершён.</div>
          </div>
        )}

        {/* Карточка баланса */}
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-400 text-white p-5 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 rounded-full bg-white/10 translate-x-8 -translate-y-8" />
          <div className="absolute right-8 bottom-0 w-20 h-20 rounded-full bg-white/10 translate-y-6" />
          <p className="text-emerald-100 text-sm mb-1">Текущий баланс</p>
          {loading ? (
            <div className="h-10 w-32 bg-white/20 rounded-xl animate-pulse mb-4" />
          ) : (
            <p className="text-4xl font-bold mb-4">
              {(balance ?? 0).toFixed(2)} <span className="text-2xl font-medium">₽</span>
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setShowTopUp(v => !v)}
              className="flex items-center gap-2 bg-white text-emerald-600 font-semibold px-4 py-2 rounded-xl text-sm hover:bg-emerald-50 transition-colors"
            >
              <Icon name="Plus" size={16} />
              Пополнить
            </button>
          </div>
        </div>

        {/* Форма пополнения */}
        {showTopUp && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Icon name="ArrowUpCircle" size={18} className="text-emerald-500" />
              Пополнить баланс
            </div>

            <div className="flex flex-wrap gap-2">
              {PRESETS.map(a => (
                <button
                  key={a}
                  onClick={() => setAmount(String(a))}
                  className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                    amount === String(a)
                      ? "bg-emerald-500 text-white border-emerald-500"
                      : "border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-600"
                  }`}
                >
                  {a} ₽
                </button>
              ))}
            </div>

            <div>
              <label className="text-sm text-slate-500 mb-1 block">Или введите сумму (от 10 ₽)</label>
              <input
                type="number"
                value={amount}
                onChange={e => { setAmount(e.target.value); setPayError(""); }}
                min={10}
                max={100000}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {payError && (
              <p className="text-sm text-red-500">{payError}</p>
            )}

            <button
              onClick={handleTopup}
              disabled={paying}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {paying ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Переход к оплате…</>
              ) : (
                <><Icon name="CreditCard" size={16} /> Оплатить {amount ? `${amount} ₽` : ""} через ЮKassa</>
              )}
            </button>

            <p className="text-xs text-slate-400 text-center">
              Оплата через ЮKassa · Банковские карты · Безопасная передача данных
            </p>
          </div>
        )}

        {/* Тарифы на AI */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="Sparkles" size={16} className="text-violet-500" />
            <span className="font-semibold text-slate-800 text-sm">На что тратится баланс</span>
          </div>
          <div className="space-y-2">
            {[
              { label: "Генерация презентации", price: 25, icon: "FileText" },
              { label: "AI-анализ документа", price: 15, icon: "Sparkles" },
              { label: "Доработка слайда", price: 6, icon: "Wand2" },
              { label: "Аудит структуры", price: 8, icon: "BarChart2" },
              { label: "Чат с документом", price: 5, icon: "MessageSquare" },
            ].map(t => (
              <div key={t.label} className="flex items-center gap-2 text-sm">
                <Icon name={t.icon} size={14} className="text-slate-400 flex-shrink-0" />
                <span className="text-slate-600 flex-1">{t.label}</span>
                <span className="font-medium text-slate-800">{t.price} ₽</span>
              </div>
            ))}
          </div>
        </div>

        {/* История транзакций */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="History" size={16} className="text-slate-500" />
            <span className="font-semibold text-slate-800 text-sm">История операций</span>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8">
              <Icon name="ReceiptText" size={32} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Операций пока нет</p>
              <p className="text-xs text-slate-300 mt-1">Пополните баланс, чтобы начать пользоваться AI</p>
            </div>
          ) : (
            <div>
              {transactions.map(tx => <TxRow key={tx.id} tx={tx} />)}
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}
