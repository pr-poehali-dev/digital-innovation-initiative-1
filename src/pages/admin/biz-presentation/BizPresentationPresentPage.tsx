import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { bizPresentationsApi, Presentation, Slide } from "@/lib/bizPresentationsApi";
import BizDeck from "@/components/biz-presentation/BizDeck";

export default function BizPresentationPresentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    bizPresentationsApi
      .get(Number(id))
      .then((d) => {
        setPresentation(d.presentation);
        setSlides(d.slides);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!presentation) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white text-gray-400">
        Презентация не найдена
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{presentation.title} — Траектория</title>
      </Helmet>
      <BizDeck
        presentation={presentation}
        slides={slides}
        onExit={() => navigate(`/admin/presentations/${presentation.id}`)}
      />
    </>
  );
}
