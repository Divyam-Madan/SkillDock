import { Router } from "express";
import {
  db,
  pool,
  jobsTable,
  candidatesTable,
  rankingRunsTable,
  rankingResultsTable,
  type Job,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { parseJobDescription, generateRationale } from "../lib/openai";
import { createCandidateScorer } from "../lib/scorer";

const router = Router();
const QUICK_RANK_POOL_LIMIT = 10000;

router.post("/", async (req, res) => {
  const parsed = parseRankRequest(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const { jdText, topN } = parsed;

  try {
    const parsedJD = await parseJobDescription(jdText);
    const ephemeralJob = buildEphemeralJob(jdText, parsedJD);
    const [job] = await db
      .insert(jobsTable)
      .values({
        title: ephemeralJob.title,
        rawText: ephemeralJob.rawText,
        requiredSkills: ephemeralJob.requiredSkills ?? [],
        preferredSkills: ephemeralJob.preferredSkills ?? [],
        minExperience: ephemeralJob.minExperience,
        educationRequirement: ephemeralJob.educationRequirement,
        domain: ephemeralJob.domain,
        seniorityLevel: ephemeralJob.seniorityLevel,
      })
      .returning();

    const [run] = await db
      .insert(rankingRunsTable)
      .values({ jobId: job.id, status: "running", topN, minScore: 0 })
      .returning();

    const totalCandidatesResult = await pool.query<{ count: string }>("select count(*) as count from candidates");
    const totalCandidates = Number(totalCandidatesResult.rows[0]?.count ?? 0);
    const candidates = await db.select().from(candidatesTable).limit(QUICK_RANK_POOL_LIMIT);
    const scoreCandidate = createCandidateScorer(job);

    const scored = candidates
      .map((candidate) => ({
        candidate,
        score: scoreCandidate(candidate),
      }))
      .sort((a, b) => {
        const scoreDiff = b.score.compositeScore - a.score.compositeScore;
        if (scoreDiff !== 0) return scoreDiff;
        return a.candidate.id - b.candidate.id;
      })
      .slice(0, topN);

    const rationalePromises = scored.map(({ candidate, score }) =>
      generateRationale(
        job.title,
        job.requiredSkills ?? [],
        {
          name: candidate.name,
          currentTitle: candidate.currentTitle,
          yearsExperience: candidate.yearsExperience,
          skills: candidate.skills ?? [],
        },
        {
          compositeScore: score.compositeScore,
          matchedSkills: score.matchedSkills,
          missingSkills: score.missingSkills,
        },
      ).catch(() => `${candidate.name} scored ${score.compositeScore}/100 for this role.`),
    );

    const rationales = await Promise.all(rationalePromises);
    const resultRows = scored.map(({ candidate, score }, index) => ({
      rankingId: run.id,
      candidateId: candidate.id,
      rank: index + 1,
      compositeScore: score.compositeScore,
      semanticScore: score.semanticScore,
      experienceScore: score.experienceScore,
      educationScore: score.educationScore,
      activityScore: score.activityScore,
      trajectoryScore: score.trajectoryScore,
      rationale: rationales[index],
      matchedSkills: score.matchedSkills,
      missingSkills: score.missingSkills,
    }));

    if (resultRows.length > 0) {
      await db.insert(rankingResultsTable).values(resultRows);
    }

    await db
      .update(rankingRunsTable)
      .set({
        status: "completed",
        totalCandidates,
        shortlistedCount: scored.length,
        completedAt: new Date(),
      })
      .where(eq(rankingRunsTable.id, run.id));

    res.json({
      ranking_id: run.id,
      job: {
        title: job.title,
        required_skills: job.requiredSkills ?? [],
        preferred_skills: job.preferredSkills ?? [],
        min_experience: job.minExperience,
        education_requirement: job.educationRequirement,
        domain: job.domain,
        seniority_level: job.seniorityLevel,
      },
      candidates: scored.map(({ candidate, score }, index) => ({
        candidate_id: candidate.email?.replace("@redrob.local", "").toUpperCase() ?? String(candidate.id),
        internal_id: candidate.id,
        rank: index + 1,
        name: candidate.name,
        current_title: candidate.currentTitle,
        current_company: candidate.currentCompany,
        composite_score: score.compositeScore,
        scores: {
          semantic: score.semanticScore,
          experience: score.experienceScore,
          education: score.educationScore,
          activity: score.activityScore,
          trajectory: score.trajectoryScore,
        },
        rationale: rationales[index],
        matched_skills: score.matchedSkills,
        missing_skills: score.missingSkills,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to rank candidates");
    res.status(500).json({ error: "Failed to rank candidates" });
  }
});

function parseRankRequest(body: unknown): { ok: true; jdText: string; topN: number } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be an object." };
  }

  const raw = body as Record<string, unknown>;
  if (typeof raw["jd_text"] !== "string" || raw["jd_text"].trim().length < 20) {
    return { ok: false, error: "jd_text must be a string with at least 20 characters." };
  }

  const topN = raw["top_n"] == null ? 10 : Number(raw["top_n"]);
  if (!Number.isInteger(topN) || topN < 1 || topN > 100) {
    return { ok: false, error: "top_n must be an integer between 1 and 100." };
  }

  return { ok: true, jdText: raw["jd_text"], topN };
}

function buildEphemeralJob(rawText: string, parsedJD: Awaited<ReturnType<typeof parseJobDescription>>): Job {
  return {
    id: 0,
    title: inferTitle(rawText),
    rawText,
    requiredSkills: parsedJD.requiredSkills,
    preferredSkills: parsedJD.preferredSkills,
    minExperience: parsedJD.minExperience,
    educationRequirement: parsedJD.educationRequirement,
    domain: parsedJD.domain,
    seniorityLevel: parsedJD.seniorityLevel,
    createdAt: new Date(),
  };
}

function inferTitle(rawText: string): string {
  const titleLine = rawText
    .split(/\r?\n/)
    .find((line) => /job description|role|title/i.test(line) && line.trim().length < 140);

  if (!titleLine) return "CandidateIQ Ranking Request";

  return titleLine
    .replace(/job description\s*:/i, "")
    .replace(/title\s*:/i, "")
    .replace(/role\s*:/i, "")
    .trim() || "CandidateIQ Ranking Request";
}

export default router;
