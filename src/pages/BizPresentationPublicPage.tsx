import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { bizPresentationsApi, Presentation, Slide } from "@/lib/bizPresentationsApi";
import BizDeck from "@/components/biz-presentation/BizDeck";

export default function BizPresentationPublicPage() {
  const { slug } = useParams();
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    bizPresentationsApi
      .publicGet(slug || "")
      .then((d) => {
        setPresentation(d.presentation);
        setSlides(d.slides);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !presentation) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white text-gray-400 text-sm">
        Презентация не найдена
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{presentation.title} — Траектория</title>
        {presentation.subtitle && <meta name="description" content={presentation.subtitle} />}
      </Helmet>
      <BizDeck presentation={presentation} slides={slides} />
    </>
  );
}
