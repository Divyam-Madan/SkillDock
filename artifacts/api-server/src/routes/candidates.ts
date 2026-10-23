import { Router } from "express";
import { db, candidatesTable, pool } from "@workspace/db";
import { eq, ilike, or, sql } from "drizzle-orm";
import {
  GetCandidateParams,
  CreateCandidateBody,
  ListCandidatesQueryParams,
} from "@workspace/api-zod";

const router = Router();
const candidateListSelection = {
  id: candidatesTable.id,
  name: candidatesTable.name,
  email: candidatesTable.email,
  currentTitle: candidatesTable.currentTitle,
  currentCompany: candidatesTable.currentCompany,
  yearsExperience: candidatesTable.yearsExperience,
  educationLevel: candidatesTable.educationLevel,
  skills: candidatesTable.skills,
  location: candidatesTable.location,
  linkedinUrl: candidatesTable.linkedinUrl,
  activityScore: candidatesTable.activityScore,
  createdAt: candidatesTable.createdAt,
};

type CandidateStats = {
  total: number;
  avgExperience: number;
  educationBreakdown: Array<{ label: string; count: number }>;
  topSkills: Array<{ label: string; count: number }>;
};

let candidateStatsCache: { expiresAt: number; value: CandidateStats } | null = null;

router.get("/stats", async (req, res) => {
  if (candidateStatsCache && candidateStatsCache.expiresAt > Date.now()) {
    res.json(candidateStatsCache.value);
    return;
  }

  try {
    const [summary, education, skills] = await Promise.all([
      pool.query<{ total: number; avg_experience: number | null }>(
        "select count(*)::int as total, avg(years_experience)::float as avg_experience from candidates",
      ),
      pool.query<{ label: string; count: number }>(
        `
          select coalesce(education_level, 'Unknown') as label, count(*)::int as count
          from candidates
          group by coalesce(education_level, 'Unknown')
          order by count desc
          limit 6
        `,
      ),
      pool.query<{ label: string; count: number }>(
        `
          select skill.value as label, count(*)::int as count
          from candidates
          cross join lateral jsonb_array_elements_text(coalesce(skills, '[]'::jsonb)) as skill(value)
          group by skill.value
          order by count desc
          limit 10
        `,
      ),
    ]);

    const total = Number(summary.rows[0]?.total ?? 0);
    const avgExperience = Number(summary.rows[0]?.avg_experience ?? 0);
    const educationBreakdown = education.rows;
    const topSkills = skills.rows;

    const value = { total, avgExperience: Math.round(avgExperience * 10) / 10, educationBreakdown, topSkills };
    candidateStatsCache = { value, expiresAt: Date.now() + 60_000 };
    res.json(value);
  } catch (err) {
    req.log.error({ err }, "Failed to get candidate stats");
    res.status(500).json({ error: "Failed to get candidate stats" });
  }
});

router.get("/", async (req, res) => {
  const query = ListCandidatesQueryParams.safeParse(req.query);
  const limit = query.success ? query.data.limit ?? 50 : 50;
  const offset = query.success ? query.data.offset ?? 0 : 0;
  const searchTerm = query.success ? query.data.search : undefined;
  try {
    let candidates;
    if (searchTerm) {
      const search = `%${searchTerm}%`;
      candidates = await db
        .select(candidateListSelection)
        .from(candidatesTable)
        .where(
          or(
            ilike(candidatesTable.name, search),
            ilike(sql`coalesce(${candidatesTable.currentTitle}, '')`, search),
            ilike(sql`coalesce(${candidatesTable.currentCompany}, '')`, search),
          ),
        )
        .limit(limit + 1)
        .offset(offset);
    } else {
      candidates = await db.select(candidateListSelection).from(candidatesTable)
        .orderBy(candidatesTable.id)
        .limit(limit + 1)
        .offset(offset);
    }
    const hasMore = candidates.length > limit;
    res.json({
      candidates: candidates.slice(0, limit).map(serializeCandidate),
      hasMore,
      limit,
      offset,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list candidates");
    res.status(500).json({ error: "Failed to list candidates" });
  }
});

router.post("/", async (req, res) => {
  const parsed = CreateCandidateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const [candidate] = await db
      .insert(candidatesTable)
      .values({
        ...parsed.data,
        skills: parsed.data.skills ?? [],
      })
      .returning();
    candidateStatsCache = null;
    res.status(201).json(serializeCandidate(candidate));
  } catch (err) {
    req.log.error({ err }, "Failed to create candidate");
    res.status(500).json({ error: "Failed to create candidate" });
  }
});

router.get("/:id", async (req, res) => {
  const params = GetCandidateParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, params.data.id));
    if (!candidate) { res.status(404).json({ error: "Candidate not found" }); return; }
    res.json(serializeCandidate(candidate));
  } catch (err) {
    req.log.error({ err }, "Failed to get candidate");
    res.status(500).json({ error: "Failed to get candidate" });
  }
});

function serializeCandidate<T extends { skills: unknown; createdAt: Date }>(c: T) {
  return {
    ...c,
    skills: (c.skills as string[]) ?? [],
    createdAt: c.createdAt.toISOString(),
  };
}

export default router;
