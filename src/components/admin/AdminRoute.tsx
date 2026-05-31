import { Navigate } from "react-router-dom";
import { useAdmin } from "@/lib/admin-context";

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAdmin();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!session) return <Navigate to="/admin/login" replace />;

  return <>{children}</>;
}
