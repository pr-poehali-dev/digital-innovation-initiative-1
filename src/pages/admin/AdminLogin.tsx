import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdmin } from "@/lib/admin-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";

export default function AdminLogin() {
  const { session, loading, login } = useAdmin();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate("/admin", { replace: true });
  }, [session, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await login(email, password);
    if (result.ok) {
      navigate("/admin", { replace: true });
    } else {
      setError(result.error || "Ошибка входа");
    }
    setSubmitting(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-orange-500 rounded-xl mb-4">
            <Icon name="Shield" size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold text-white">Супер-админ</h1>
          <p className="text-gray-500 text-sm mt-1">Траектория</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="bg-gray-900 border-gray-800 text-white placeholder:text-gray-600 h-11"
            />
          </div>
          <div className="relative">
            <Input
              type={showPwd ? "text" : "password"}
              placeholder="Пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="bg-gray-900 border-gray-800 text-white placeholder:text-gray-600 h-11 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPwd(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <Icon name={showPwd ? "EyeOff" : "Eye"} size={16} />
            </button>
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <Button
            type="submit"
            disabled={submitting || !email || !password}
            className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white font-medium"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Вход...
              </span>
            ) : "Войти"}
          </Button>
        </form>
      </div>
    </div>
  );
}
