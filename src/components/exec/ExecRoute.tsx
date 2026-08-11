import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { useAdmin } from "@/lib/admin-context";
import { useAuth } from "@/lib/auth-context";
import { CabinetAccess } from "@/lib/execAccess";
import { controlApi } from "@/lib/execControlApi";

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-950">
    <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

export default function ExecRoute({ children }: { children: React.ReactNode }) {
  const { session, loading: adminLoading } = useAdmin();
  const { user, loading: authLoading } = useAuth();
  const [access, setAccess] = useState<CabinetAccess | null>(null);
  const [checking, setChecking] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (adminLoading || authLoading) return;
    if (session) {
      setAccess({ email: session.actor_email, role: "head", can_confirm: true });
      setChecking(false);
      return;
    }
    if (!user) {
      setChecking(false);
      return;
    }
    controlApi
      .whoami()
      .then(setAccess)
      .catch(() => setDenied(true))
      .finally(() => setChecking(false));
  }, [session, user, adminLoading, authLoading]);

  if (adminLoading || authLoading || checking) return <Spinner />;

  if (!session && !user) return <Navigate to="/login" replace />;

  if (denied || (!access && user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 px-6">
        <div className="max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mx-auto mb-5">
            <Icon name="Lock" size={24} className="text-gray-600" />
          </div>
          <h1 className="text-lg font-semibold text-white mb-2">
            Кабинет руководителя недоступен
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            Ваша учётная запись не включена в список лиц, допущенных к кабинету. Обратитесь к
            руководителю Группы сопровождения и продвижения инициатив.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-300 hover:border-gray-700 text-sm transition-colors"
          >
            <Icon name="ArrowLeft" size={14} />
            На главную
          </Link>
        </div>
      </div>
    );
  }

  if (!access) return <Spinner />;

  return <>{children}</>;
}