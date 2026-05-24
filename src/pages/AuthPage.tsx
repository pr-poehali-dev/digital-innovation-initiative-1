import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

const LOGO_URL = "https://cdn.poehali.dev/projects/74e2bb00-8b75-428a-b2fe-9c02b6a39d64/files/0a6d2e9d-2156-49ee-a4b8-7baaa8811800.jpg";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        if (!name.trim()) { setError("Введите имя"); setLoading(false); return; }
        await register(email, password, name);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img
            src={LOGO_URL}
            alt="DocMind AI"
            className="w-24 h-24 rounded-2xl shadow-lg object-cover mb-3"
          />
          <span className="text-2xl font-bold text-slate-800">DocMind AI</span>
          <span className="text-sm text-slate-500 mt-0.5">AI-кабинет для презентаций</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-semibold mb-6 text-center text-slate-800">
            {mode === "login" ? "Войти в кабинет" : "Создать аккаунт"}
          </h1>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">Имя</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Иван Иванов"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-3 py-2.5 rounded-lg border border-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {loading ? "Загрузка..." : mode === "login" ? "Войти" : "Зарегистрироваться"}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-slate-500">
            {mode === "login" ? (
              <>Нет аккаунта?{" "}
                <button onClick={() => setMode("register")} className="text-orange-500 hover:text-orange-600 font-semibold">
                  Создать
                </button>
              </>
            ) : (
              <>Уже есть аккаунт?{" "}
                <button onClick={() => setMode("login")} className="text-orange-500 hover:text-orange-600 font-semibold">
                  Войти
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}