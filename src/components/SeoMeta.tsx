import { Helmet } from "react-helmet-async";

type Props = {
  noindex?: boolean;
  title?: string;
  description?: string;
  canonical?: string;
};

export default function SeoMeta({ noindex = false, title, description, canonical }: Props) {
  return (
    <Helmet>
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      {title && <title>{title}</title>}
      {description && <meta name="description" content={description} />}
      {canonical && <link rel="canonical" href={canonical} />}
      {!noindex && !canonical && <link rel="canonical" href={typeof window !== "undefined" ? window.location.href : ""} />}
    </Helmet>
  );
}
