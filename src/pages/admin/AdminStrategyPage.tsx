import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function AdminStrategyPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/admin/hq", { replace: true });
  }, [navigate]);
  return null;
}
