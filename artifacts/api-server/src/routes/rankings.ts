import { Router } from "express";
import { db, pool, jobsTable, candidatesTable, rankingRunsTable, rankingResultsTable } from "@workspace/db";
import { asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { createCandidateScorer, type CandidateScoringProfile, type ScoreBreakdown } from "../lib/scorer";
import { generateRationale } from "../lib/openai";
import { logger } from "../lib/logger";
import {
  CreateRankingBody,
  GetRankingParams,
  ListRankedCandidatesParams,
  ExportRankingParams,
  GetRankingStatsParams,
} from "@workspace/api-zod";

const router = Router();
const CANDIDATE_BATCH_SIZE = 5000;
const MAX_BATCH_ATTEMPTS = 3;
const rankingProgress = new Map<number, { processedCandidates: number; totalCandidates: number }>();

interface ScoredCandidate {
  candidate: CandidateScoringProfile;
  score: ScoreBreakdown;
}

router.get("/", async (req, res) => {
  try {
    const runs = await db.select().from(rankingRunsTable).orderBy(desc(rankingRunsTable.createdAt));
    const jobs = await db.select({ id: jobsTable.id, title: jobsTable.title }).from(jobsTable);
    const jobMap = new Map(jobs.map((j) => [j.id, j.title]));

    res.json(runs.map((r) => serializeRun(r, jobMap.get(r.jobId) ?? null)));
  } catch (err) {
    req.log.error({ err }, "Failed to list rankings");
    res.status(500).json({ error: "Failed to list rankings" });
  }
});

router.post("/", async (req, res) => {
  const parsed = CreateRankingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { jobId, topN = 15, minScore = 40 } = parsed.data;

  try {
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    const [run] = await db
      .insert(rankingRunsTable)
      .values({ jobId, status: "pending", topN, minScore })
      .returning();

    res.status(202).json(serializeRun(run, job.title));
    setImmediate(() => {
      void processRankingRun(run.id, job, topN ?? 15, minScore ?? 40);
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create ranking");
    res.status(500).json({ error: "Failed to create ranking" });
  }
});

router.get("/:id", async (req, res) => {
  const params = GetRankingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [run] = await db.select().from(rankingRunsTable).where(eq(rankingRunsTable.id, params.data.id));
    if (!run) { res.status(404).json({ error: "Ranking not found" }); return; }

    const [job] = await db.select({ title: jobsTable.title }).from(jobsTable).where(eq(jobsTable.id, run.jobId));
    const results = run.status === "completed" ? await fetchResultsWithCandidates(run.id) : [];
    const progress = rankingProgress.get(run.id);

    res.json({
      ...serializeRun(run, job?.title ?? null),
      totalCandidates: run.totalCandidates ?? progress?.totalCandidates ?? null,
      processedCandidates: progress?.processedCandidates ?? (run.status === "completed" ? run.totalCandidates ?? 0 : 0),
      results,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get ranking");
    res.status(500).json({ error: "Failed to get ranking" });
  }
});

router.get("/:id/results", async (req, res) => {
  const params = ListRankedCandidatesParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const results = await fetchResultsWithCandidates(params.data.id);
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Failed to get ranking results");
    res.status(500).json({ error: "Failed to get ranking results" });
  }
});

router.get("/:id/export", async (req, res) => {
  const params = ExportRankingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const results = await fetchResultsWithCandidates(params.data.id);
    const [run] = await db.select().from(rankingRunsTable).where(eq(rankingRunsTable.id, params.data.id));
    const [job] = run
      ? await db.select({ title: jobsTable.title }).from(jobsTable).where(eq(jobsTable.id, run.jobId))
      : [null];

    const headers = ["Rank","Name","Title","Company","Years Exp","Education","Composite Score","Semantic","Experience","Education Score","Activity","Trajectory","Matched Skills","Missing Skills","Rationale"];
    const rows = results.map((r) => [
      r.rank,
      r.candidate.name,
      r.candidate.currentTitle ?? "",
      r.candidate.currentCompany ?? "",
      r.candidate.yearsExperience ?? "",
      r.candidate.educationLevel ?? "",
      r.compositeScore,
      r.semanticScore ?? "",
      r.experienceScore ?? "",
      r.educationScore ?? "",
      r.activityScore ?? "",
      r.trajectoryScore ?? "",
      (r.matchedSkills ?? []).join("; "),
      (r.missingSkills ?? []).join("; "),
      (r.rationale ?? "").replace(/"/g, '""'),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${v}"`).join(","))
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="ranking-${params.data.id}-${job?.title ?? "results"}.csv"`);
    res.send(csv);
  } catch (err) {
    req.log.error({ err }, "Failed to export ranking");
    res.status(500).json({ error: "Failed to export ranking" });
  }
});

router.get("/:id/stats", async (req, res) => {
  const params = GetRankingStatsParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const results = await db
      .select()
      .from(rankingResultsTable)
      .where(eq(rankingResultsTable.rankingId, params.data.id));

    const buckets: Record<string, number> = {
      "90-100": 0, "80-89": 0, "70-79": 0, "60-69": 0, "50-59": 0, "40-49": 0,
    };
    let total = 0;
    for (const r of results) {
      total += r.compositeScore;
      const score = r.compositeScore;
      if (score >= 90) buckets["90-100"]++;
      else if (score >= 80) buckets["80-89"]++;
      else if (score >= 70) buckets["70-79"]++;
      else if (score >= 60) buckets["60-69"]++;
      else if (score >= 50) buckets["50-59"]++;
      else buckets["40-49"]++;
    }

    const skillMatchMap: Record<string, number> = {};
    const skillMissingMap: Record<string, number> = {};
    for (const r of results) {
      for (const s of (r.matchedSkills as string[]) ?? []) skillMatchMap[s] = (skillMatchMap[s] ?? 0) + 1;
      for (const s of (r.missingSkills as string[]) ?? []) skillMissingMap[s] = (skillMissingMap[s] ?? 0) + 1;
    }

    res.json({
      scoreDistribution: Object.entries(buckets).map(([range, count]) => ({ range, count })),
      avgCompositeScore: results.length > 0 ? Math.round((total / results.length) * 10) / 10 : 0,
      topMatchedSkills: Object.entries(skillMatchMap)
        .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count })),
      topMissingSkills: Object.entries(skillMissingMap)
        .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get ranking stats");
    res.status(500).json({ error: "Failed to get ranking stats" });
  }
});

async function fetchResultsWithCandidates(rankingId: number) {
  const results = await db
    .select()
    .from(rankingResultsTable)
    .where(eq(rankingResultsTable.rankingId, rankingId))
    .orderBy(rankingResultsTable.rank);

  const candidateIds = [...new Set(results.map((r) => r.candidateId))];
  if (candidateIds.length === 0) return [];

  const candidates = await db
    .select()
    .from(candidatesTable)
    .where(inArray(candidatesTable.id, candidateIds));

  const candMap = new Map(
    candidates.map((c) => [
      c.id,
      {
        ...c,
        skills: (c.skills as string[]) ?? [],
        createdAt: c.createdAt.toISOString(),
      },
    ]),
  );

  return results
    .filter((r) => candMap.has(r.candidateId))
    .map((r) => ({
      id: r.id,
      rankingId: r.rankingId,
      candidateId: r.candidateId,
      rank: r.rank,
      compositeScore: r.compositeScore,
      semanticScore: r.semanticScore,
      experienceScore: r.experienceScore,
      educationScore: r.educationScore,
      activityScore: r.activityScore,
      trajectoryScore: r.trajectoryScore,
      rationale: r.rationale,
      matchedSkills: (r.matchedSkills as string[]) ?? [],
      missingSkills: (r.missingSkills as string[]) ?? [],
      candidate: candMap.get(r.candidateId)!,
    }));
}

async function processRankingRun(rankingId: number, job: typeof jobsTable.$inferSelect, topN: number, minScore: number): Promise<void> {
  try {
    await db.update(rankingRunsTable).set({ status: "running" }).where(eq(rankingRunsTable.id, rankingId));
    const countResult = await pool.query<{ count: string }>("select count(*) as count from candidates");
    const expectedCandidates = Number(countResult.rows[0]?.count ?? 0);
    rankingProgress.set(rankingId, { processedCandidates: 0, totalCandidates: expectedCandidates });

    const scoreCandidate = createCandidateScorer(job);
    const shortlist: ScoredCandidate[] = [];
    let lastCandidateId = 0;
    let totalCandidates = 0;

    while (true) {
      const candidates = await fetchCandidateBatch(lastCandidateId);
      if (candidates.length === 0) break;

      totalCandidates += candidates.length;
      lastCandidateId = candidates[candidates.length - 1].id;

      for (const candidate of candidates) {
        const score = scoreCandidate(candidate);
        if (score.compositeScore >= minScore) shortlist.push({ candidate, score });
      }
      rankingProgress.set(rankingId, { processedCandidates: totalCandidates, totalCandidates: expectedCandidates });

      shortlist.sort((left, right) =>
        right.score.compositeScore - left.score.compositeScore || left.candidate.id - right.candidate.id,
      );
      if (shortlist.length > topN) shortlist.length = topN;

      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    const rationales = await Promise.all(shortlist.map(({ candidate, score }) =>
      generateRationale(
        job.title,
        (job.requiredSkills as string[]) ?? [],
        {
          name: candidate.name,
          currentTitle: candidate.currentTitle,
          yearsExperience: candidate.yearsExperience,
          skills: (candidate.skills as string[]) ?? [],
        },
        {
          compositeScore: score.compositeScore,
          matchedSkills: score.matchedSkills,
          missingSkills: score.missingSkills,
        },
      ).catch(() => `${candidate.name} scored ${score.compositeScore}/100 for this role.`),
    ));

    const resultRows = shortlist.map(({ candidate, score }, index) => ({
      rankingId,
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

    if (resultRows.length > 0) await db.insert(rankingResultsTable).values(resultRows);

    await db.update(rankingRunsTable).set({
      status: "completed",
      totalCandidates,
      shortlistedCount: shortlist.length,
      completedAt: new Date(),
    }).where(eq(rankingRunsTable.id, rankingId));
    rankingProgress.delete(rankingId);
  } catch (err) {
    logger.error({ err, rankingId }, "Ranking run failed");
    rankingProgress.delete(rankingId);
    try {
      await db.update(rankingRunsTable).set({ status: "failed", completedAt: new Date() })
        .where(eq(rankingRunsTable.id, rankingId));
    } catch (statusErr) {
      logger.error({ err: statusErr, rankingId }, "Could not persist failed ranking status");
    }
  }
}

async function fetchCandidateBatch(lastCandidateId: number): Promise<CandidateScoringProfile[]> {
  for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt++) {
    try {
      return await db
        .select({
          id: candidatesTable.id,
          name: candidatesTable.name,
          email: candidatesTable.email,
          currentTitle: candidatesTable.currentTitle,
          currentCompany: candidatesTable.currentCompany,
          yearsExperience: candidatesTable.yearsExperience,
          educationLevel: candidatesTable.educationLevel,
          skills: candidatesTable.skills,
          resumeText: sql<string | null>`left(${candidatesTable.resumeText}, 1200)`,
          location: candidatesTable.location,
          linkedinUrl: candidatesTable.linkedinUrl,
          activityScore: candidatesTable.activityScore,
        })
        .from(candidatesTable)
        .where(gt(candidatesTable.id, lastCandidateId))
        .orderBy(asc(candidatesTable.id))
        .limit(CANDIDATE_BATCH_SIZE);
    } catch (err) {
      if (!isTransientDatabaseError(err) || attempt === MAX_BATCH_ATTEMPTS) throw err;
      logger.warn({ err, attempt, lastCandidateId }, "Retrying transient candidate batch query");
      await new Promise<void>((resolve) => setTimeout(resolve, attempt * 500));
    }
  }

  return [];
}

function isTransientDatabaseError(err: unknown): boolean {
  const error = err as { code?: unknown; cause?: { code?: unknown; message?: unknown }; message?: unknown };
  const code = String(error?.cause?.code ?? error?.code ?? "");
  const message = `${String(error?.message ?? "")} ${String(error?.cause?.message ?? "")}`.toLowerCase();
  return ["ENOTFOUND", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE"].includes(code) ||
    message.includes("connection terminated unexpectedly") ||
    message.includes("socket hang up");
}

function serializeRun(run: typeof rankingRunsTable.$inferSelect, jobTitle: string | null) {
  return {
    ...run,
    jobTitle,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

export default router;
