const MAP_URL = "https://functions.poehali.dev/d54f275a-1abc-4018-82e9-0d27e4a041b5";

function sessionHdr() {
  const sid = localStorage.getItem("session_id") || "";
  return {
    "Content-Type": "application/json",
    ...(sid ? { "X-Session-Id": sid } : {}),
  };
}

export type CompetencySource = {
  kind: string;
  label: string;
  is_verified: boolean;
  date: string | null;
  evidence_id?: number;
  description?: string | null;
};

export type CompetencyEntry = {
  id: number;
  code: string;
  name: string;
  description: string;
  score: number;
  confidence: "none" | "low" | "medium" | "high";
  current_level: number;
  is_verified: boolean;
  evidence_count: number;
  level_descriptor: string;
  level_descriptors: Record<string, string>;
  sources: CompetencySource[];
};

export type CompetencyDomain = {
  id: number;
  code: string;
  name: string;
  competencies: CompetencyEntry[];
};

export type CompetencyMapSummary = {
  total_competencies: number;
  domains_covered: number;
  verified_count: number;
  high_confidence_count: number;
  has_data: boolean;
  top_competencies: { id: number; name: string; confidence: string; score: number }[];
};

export type CompetencyMapResult = {
  domains: CompetencyDomain[];
  summary: CompetencyMapSummary;
};

export const competencyMapApi = {
  getMe: (): Promise<CompetencyMapResult> =>
    fetch(`${MAP_URL}/?action=competency_map_get_me`, { headers: sessionHdr() })
      .then(r => r.json()),
};
