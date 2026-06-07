import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { authApi } from "@/lib/api";
import Icon from "@/components/ui/icon";
import SeoMeta from "@/components/SeoMeta";

const LOGO_URL = "https://cdn.poehali.dev/projects/74e2bb00-8b75-428a-b2fe-9c02b6a39d64/files/0a6d2e9d-2156-49ee-a4b8-7baaa8811800.jpg";

type Mode = "login" | "register" | "reset";

export default function AuthPage() {
  const { login, register, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [tempPassword, setTempPassword] = useState("");

  useEffect(() => {
    if (user) navigate("/cabinet", { replace: true });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResetMsg("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else if (mode === "register") {
        if (!name.trim()) { setError("Введите имя"); setLoading(false); return; }
        await register(email, password, name);
      } else if (mode === "reset") {
        const data = await authApi.resetPassword(email);
        if (data.temp_password) {
          setTempPassword(data.temp_password);
          setResetMsg("Готово! Скопируйте временный пароль и используйте его для входа. После входа смените на постоянный.");
        } else {
          setResetMsg(data.message || "Запрос принят");
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<Mode, string> = {
    login: "Войти в кабинет",
    register: "Создать аккаунт",
    reset: "Восстановить пароль",
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-8">
      <SeoMeta noindex />
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
            {titles[mode]}
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
                autoComplete="email"
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>

            {mode !== "reset" && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-semibold text-slate-700">Пароль</label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => { setMode("reset"); setError(""); setResetMsg(""); }}
                      className="text-xs text-slate-500 hover:text-slate-900 font-medium"
                    >
                      Забыли?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 pr-10 text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1.5"
                    tabIndex={-1}
                    aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  >
                    <Icon name={showPassword ? "EyeOff" : "Eye"} size={18} />
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-3 py-2.5 rounded-lg border border-red-200">
                {error}
              </div>
            )}

            {resetMsg && (
              <div className="bg-green-50 text-green-800 text-sm px-3 py-2.5 rounded-lg border border-green-200 space-y-2">
                <p>{resetMsg}</p>
                {tempPassword && (
                  <div className="bg-white border border-green-300 rounded-lg p-2.5 flex items-center justify-between gap-2">
                    <code className="font-mono text-sm text-slate-900 break-all">{tempPassword}</code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(tempPassword)}
                      className="text-xs bg-slate-800 text-white px-2 py-1 rounded flex-shrink-0"
                    >
                      Копировать
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {loading ? "Загрузка..." : mode === "login" ? "Войти" : mode === "register" ? "Зарегистрироваться" : "Получить временный пароль"}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-slate-500 space-y-2">
            {mode === "login" && (
              <p>
                Нет аккаунта?{" "}
                <button onClick={() => { setMode("register"); setError(""); }} className="text-slate-900 hover:underline font-semibold">
                  Создать
                </button>
              </p>
            )}
            {mode === "register" && (
              <p>
                Уже есть аккаунт?{" "}
                <button onClick={() => { setMode("login"); setError(""); }} className="text-slate-900 hover:underline font-semibold">
                  Войти
                </button>
              </p>
            )}
            {mode === "reset" && (
              <p>
                Вспомнили пароль?{" "}
                <button onClick={() => { setMode("login"); setError(""); setResetMsg(""); setTempPassword(""); }} className="text-slate-900 hover:underline font-semibold">
                  Войти
                </button>
              </p>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Защищённое хранилище · Все данные шифруются
        </p>
      </div>
    </div>
  );
}