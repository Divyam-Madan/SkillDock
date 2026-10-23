import type { Job, Candidate } from "@workspace/db";

export interface ScoreBreakdown {
  compositeScore: number;
  semanticScore: number;
  experienceScore: number;
  educationScore: number;
  activityScore: number;
  trajectoryScore: number;
  matchedSkills: string[];
  missingSkills: string[];
}

export type CandidateScoringProfile = Pick<
  Candidate,
  | "id"
  | "name"
  | "email"
  | "currentTitle"
  | "currentCompany"
  | "yearsExperience"
  | "educationLevel"
  | "skills"
  | "resumeText"
  | "location"
  | "linkedinUrl"
  | "activityScore"
>;

const WEIGHTS = {
  semantic: 0.35,
  experience: 0.25,
  education: 0.15,
  activity: 0.15,
  trajectory: 0.10,
};

const EDUCATION_TIERS: Record<string, number> = {
  phd: 5,
  doctorate: 5,
  masters: 4,
  mba: 4,
  bachelors: 3,
  bachelor: 3,
  "b.s.": 3,
  "b.a.": 3,
  associate: 2,
  diploma: 2,
  bootcamp: 1,
  "self-taught": 1,
  none: 0,
};

const AI_RETRIEVAL_EVIDENCE = [
  {
    label: "Embeddings-based retrieval",
    weight: 1.15,
    terms: ["embedding", "embeddings", "sentence transformer", "sentence-transformers", "bge", "e5", "semantic search", "dense retrieval", "retrieval", "rag"],
  },
  {
    label: "Vector databases",
    weight: 1.05,
    terms: ["vector database", "vector db", "pinecone", "weaviate", "qdrant", "milvus", "faiss", "opensearch", "elasticsearch", "ann index", "nearest neighbor"],
  },
  {
    label: "Hybrid search",
    weight: 0.9,
    terms: ["hybrid search", "bm25", "keyword retrieval", "sparse retrieval", "reranking", "re-ranking", "search infrastructure"],
  },
  {
    label: "Ranking systems",
    weight: 1.2,
    terms: ["ranking system", "ranker", "learning to rank", "learning-to-rank", "recommendation system", "recommender", "candidate matching", "search ranking"],
  },
  {
    label: "Evaluation frameworks",
    weight: 1.1,
    terms: ["ndcg", "mrr", "map", "offline evaluation", "online evaluation", "a/b test", "ab test", "offline benchmark", "relevance", "recruiter feedback"],
  },
  {
    label: "Production ML systems",
    weight: 1.15,
    terms: ["production ml", "deployed", "real users", "model serving", "ml pipeline", "feature pipeline", "monitoring", "drift", "index refresh", "quality regression"],
  },
  {
    label: "Python",
    weight: 0.8,
    terms: ["python", "pytorch", "tensorflow", "scikit", "fastapi", "flask"],
  },
  {
    label: "LLMs",
    weight: 0.8,
    terms: ["llm", "llms", "large language model", "fine tuning", "fine-tuning", "lora", "qlora", "peft", "prompting"],
  },
];

const PRODUCT_ENGINEERING_TERMS = [
  "product company",
  "product engineering",
  "shipped",
  "owned",
  "production",
  "real users",
  "scale",
  "startup",
  "founding",
  "end-to-end",
];

const NEGATIVE_TITLE_TERMS = [
  "marketing",
  "content",
  "sales",
  "hr manager",
  "recruiter",
  "designer",
  "finance",
  "accountant",
  "customer support",
  "operations",
];

const POSITIVE_TITLE_TERMS = [
  "ai engineer",
  "ml engineer",
  "machine learning",
  "data scientist",
  "search engineer",
  "ranking",
  "recommendation",
  "backend engineer",
  "data engineer",
  "software engineer",
  "applied scientist",
];

function normalizeSkill(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#.]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function candidateDocument(candidate: CandidateScoringProfile): string {
  return [
    candidate.currentTitle ?? "",
    candidate.currentCompany ?? "",
    candidate.educationLevel ?? "",
    candidate.location ?? "",
    ...(candidate.skills ?? []),
    candidate.resumeText ?? "",
  ].join(" ");
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function scoreSkillMatch(
  job: Job,
  candidate: CandidateScoringProfile,
  requiredSkills: string[],
  preferredSkills: string[],
  required: string[],
  preferred: string[],
  evidenceGroups: typeof AI_RETRIEVAL_EVIDENCE,
  maxEvidenceScore: number,
  targetTokens: Map<string, number>,
  totalTargetWeight: number,
): { score: number; matched: string[]; missing: string[]; documentLower: string } {
  const rawCandidateSkills = asStringArray(candidate.skills);
  const candidateSkills = rawCandidateSkills.map(normalizeSkill);
  const doc = candidateDocument(candidate);
  const docLower = doc.toLowerCase();
  const resumeTokens = new Set(tokenize(doc));

  const hasSkill = (skill: string) =>
    candidateSkills.some((cs) => cs.includes(skill) || skill.includes(cs)) ||
    resumeTokens.has(skill) ||
    skill.split(" ").every((word) => resumeTokens.has(word));

  const matched: string[] = [];
  const missing: string[] = [];

  for (const skill of requiredSkills) {
    if (hasSkill(normalizeSkill(skill))) matched.push(skill);
    else missing.push(skill);
  }
  for (const skill of preferredSkills) {
    if (hasSkill(normalizeSkill(skill)) && !matched.includes(skill)) matched.push(skill);
  }

  let evidenceScore = 0;
  for (const group of evidenceGroups) {
    if (includesAny(docLower, group.terms)) {
      evidenceScore += group.weight;
      if (!matched.includes(group.label)) matched.push(group.label);
    } else if (requiredSkills.includes(group.label) && !missing.includes(group.label)) {
      missing.push(group.label);
    }
  }

  const normalizedEvidence = maxEvidenceScore > 0 ? evidenceScore / maxEvidenceScore : 0;
  const productSignal = includesAny(docLower, PRODUCT_ENGINEERING_TERMS) ? 0.08 : 0;

  const requiredHit = required.length > 0 ? matched.filter((skill) => required.includes(normalizeSkill(skill))).length / required.length : 0.5;
  const preferredBonus = preferred.length > 0 ? Math.min(matched.filter((skill) => preferred.includes(normalizeSkill(skill))).length / preferred.length * 0.3, 0.3) : 0;

  let matchedTargetWeight = 0;
  for (const [token, weight] of targetTokens) {
    if (resumeTokens.has(token)) matchedTargetWeight += weight;
  }
  const resumeSim = totalTargetWeight > 0 ? matchedTargetWeight / totalTargetWeight : 0;

  const score = Math.min(1, requiredHit * 0.25 + preferredBonus + resumeSim * 0.25 + normalizedEvidence * 0.42 + productSignal);
  return { score, matched, missing, documentLower: docLower };
}

function scoreExperience(job: Job, candidate: CandidateScoringProfile, jdText: string): number {
  const candidateYears = candidate.yearsExperience ?? 0;
  const required = job.minExperience ?? 0;

  if (required === 0) return 0.75 + Math.min(candidateYears / 20, 0.25);

  if (candidateYears >= required) {
    const excess = candidateYears - required;
    const base = Math.min(0.7 + excess * 0.03, 1.0);
    if (jdText.includes("5") && jdText.includes("9") && candidateYears > 12) return Math.max(0.75, base - 0.12);
    return base;
  } else {
    return Math.max(0, (candidateYears / required) * 0.7);
  }
}

function scoreEducation(job: Job, candidate: CandidateScoringProfile): number {
  const eduReq = (job.educationRequirement ?? "").toLowerCase();
  const candidateEdu = (candidate.educationLevel ?? "").toLowerCase();

  const candidateTier = Object.entries(EDUCATION_TIERS).reduce((best, [key, tier]) => {
    if (candidateEdu.includes(key)) return Math.max(best, tier);
    return best;
  }, 0);

  if (!eduReq) return 0.6 + candidateTier * 0.08;

  const requiredTier = Object.entries(EDUCATION_TIERS).reduce((best, [key, tier]) => {
    if (eduReq.includes(key)) return Math.max(best, tier);
    return best;
  }, 2);

  if (candidateTier >= requiredTier) {
    return Math.min(0.7 + (candidateTier - requiredTier) * 0.1, 1.0);
  } else {
    return Math.max(0.2, candidateTier / (requiredTier + 1));
  }
}

function scoreActivity(candidate: CandidateScoringProfile): number {
  if (candidate.activityScore != null) {
    return Math.min(candidate.activityScore / 100, 1);
  }
  // Infer from profile completeness
  const fields = [candidate.email, candidate.currentTitle, candidate.currentCompany, candidate.skills?.length, candidate.resumeText, candidate.location, candidate.linkedinUrl];
  const filled = fields.filter(Boolean).length;
  return 0.3 + (filled / fields.length) * 0.7;
}

function scoreTrajectory(job: Job, candidate: CandidateScoringProfile, doc: string): number {
  const title = (candidate.currentTitle ?? "").toLowerCase();
  const domain = (job.domain ?? "").toLowerCase();
  const seniority = (job.seniorityLevel ?? "").toLowerCase();
  let score = 0.5;

  const seniorTerms = ["senior", "staff", "principal", "lead", "director", "vp", "head"];
  const juniorTerms = ["junior", "associate", "entry", "intern"];

  if (seniority.includes("senior") || seniority.includes("staff") || seniority.includes("lead")) {
    if (seniorTerms.some((t) => title.includes(t))) score += 0.3;
    else if (juniorTerms.some((t) => title.includes(t))) score -= 0.2;
  } else if (seniority.includes("junior") || seniority.includes("entry")) {
    if (juniorTerms.some((t) => title.includes(t))) score += 0.3;
    else if (seniorTerms.some((t) => title.includes(t))) score += 0.1;
  } else {
    score += 0.1;
  }

  if (domain && (title.includes(domain) || (candidate.resumeText ?? "").toLowerCase().includes(domain))) {
    score += 0.2;
  }

  if (POSITIVE_TITLE_TERMS.some((t) => title.includes(t))) score += 0.18;
  if (NEGATIVE_TITLE_TERMS.some((t) => title.includes(t))) score -= 0.35;
  if (includesAny(doc, PRODUCT_ENGINEERING_TERMS)) score += 0.1;
  if (includesAny(doc, ["consulting firm", "services company", "it services"]) && !includesAny(doc, ["product", "real users", "production"])) score -= 0.08;
  if (includesAny(doc, ["pure research", "academic lab", "research-only"])) score -= 0.2;

  return Math.max(0, Math.min(1, score));
}

export function createCandidateScorer(job: Job): (candidate: CandidateScoringProfile) => ScoreBreakdown {
  const requiredSkills = asStringArray(job.requiredSkills);
  const preferredSkills = asStringArray(job.preferredSkills);
  const required = requiredSkills.map(normalizeSkill);
  const preferred = preferredSkills.map(normalizeSkill);
  const jdText = `${job.title} ${job.rawText}`.toLowerCase();
  const roleText = `${job.title} ${job.rawText} ${job.domain ?? ""}`.toLowerCase();
  const evidenceGroups = roleText.includes("retrieval") || roleText.includes("ranking") || roleText.includes("ai engineer")
    ? AI_RETRIEVAL_EVIDENCE
    : [];
  const maxEvidenceScore = evidenceGroups.reduce((total, group) => total + group.weight, 0);
  const boostSet = new Set([...requiredSkills, ...preferredSkills].map(normalizeSkill));
  const targetTokens = new Map<string, number>();
  for (const token of new Set(tokenize([job.rawText, ...requiredSkills, ...preferredSkills].join(" ")))) {
    targetTokens.set(token, boostSet.has(token) ? 3 : 1);
  }
  const totalTargetWeight = [...targetTokens.values()].reduce((total, weight) => total + weight, 0);

  return (candidate) => {
    const { score: semanticRaw, matched, missing, documentLower } = scoreSkillMatch(
      job,
      candidate,
      requiredSkills,
      preferredSkills,
      required,
      preferred,
      evidenceGroups,
      maxEvidenceScore,
      targetTokens,
      totalTargetWeight,
    );
    const experienceRaw = scoreExperience(job, candidate, jdText);
    const educationRaw = scoreEducation(job, candidate);
    const activityRaw = scoreActivity(candidate);
    const trajectoryRaw = scoreTrajectory(job, candidate, documentLower);

    const composite =
      semanticRaw * WEIGHTS.semantic +
      experienceRaw * WEIGHTS.experience +
      educationRaw * WEIGHTS.education +
      activityRaw * WEIGHTS.activity +
      trajectoryRaw * WEIGHTS.trajectory;

    return {
      compositeScore: Math.round(composite * 100 * 10) / 10,
      semanticScore: Math.round(semanticRaw * 100 * 10) / 10,
      experienceScore: Math.round(experienceRaw * 100 * 10) / 10,
      educationScore: Math.round(educationRaw * 100 * 10) / 10,
      activityScore: Math.round(activityRaw * 100 * 10) / 10,
      trajectoryScore: Math.round(trajectoryRaw * 100 * 10) / 10,
      matchedSkills: matched,
      missingSkills: missing,
    };
  };
}

export function scoreCandidate(job: Job, candidate: CandidateScoringProfile): ScoreBreakdown {
  return createCandidateScorer(job)(candidate);
}
