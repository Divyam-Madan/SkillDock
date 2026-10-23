import React from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useGetCandidateStats, useListCandidates, useListRankings } from "@workspace/api-client-react";
import {
  Plus,
  Zap,
  Users,
  ArrowRight,
  CheckCircle,
  Clock,
  Activity,
  XCircle,
  Sparkles,
  ScanLine,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetCandidateStats();
  const { data: candidates, isLoading: candidatesLoading } = useListCandidates();
  const { data: rankings, isLoading: rankingsLoading } = useListRankings();

  const recentRankings = Array.isArray(rankings) ? rankings.slice(0, 5) : [];
  const candidatesArray = Array.isArray(candidates?.candidates) ? candidates.candidates : [];
  const topSkills = Array.isArray(stats?.topSkills) ? stats.topSkills : [];
  const averageExperience =
    typeof stats?.avgExperience === "number" ? stats.avgExperience.toFixed(1) : "0.0";

  const getStatusBadge = (status: string) => {
    const variants = {
      completed: {
        bg: "bg-green-50",
        text: "text-green-700",
        border: "border-green-200",
        icon: <CheckCircle className="w-3 h-3" />,
      },
      running: {
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
        icon: <Activity className="w-3 h-3" />,
      },
      failed: {
        bg: "bg-red-50",
        text: "text-red-700",
        border: "border-red-200",
        icon: <XCircle className="w-3 h-3" />,
      },
      pending: {
        bg: "bg-slate-50",
        text: "text-slate-700",
        border: "border-slate-200",
        icon: <Clock className="w-3 h-3" />,
      },
    };
    const variant = variants[status as keyof typeof variants] || variants.pending;
    return (
      <Badge
        variant="outline"
        className={`${variant.bg} ${variant.text} ${variant.border} gap-1.5 text-xs`}
      >
        {variant.icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="rounded-[2rem] border border-black/5 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)] backdrop-blur dark:border-white/10 dark:bg-slate-900/80">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-[color:var(--accent-soft)] px-3 py-1 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-200">
              <Sparkles className="h-4 w-4 text-[color:var(--accent)]" />
              Executive overview
            </div>
            <h1 className="font-serif text-4xl leading-tight text-slate-900 dark:text-slate-100 sm:text-5xl">
              Curate talent like an exhibition of future builders.
            </h1>
            <p className="max-w-2xl text-lg text-slate-600 dark:text-slate-300">
              Review hiring activity, track ranking outcomes, and move from brief to shortlist with calm clarity.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-black/5 bg-slate-950/95 p-5 text-white shadow-xl dark:border-white/10">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Today</p>
            <p className="mt-3 font-serif text-3xl">12 curated conversations</p>
            <p className="mt-2 text-sm text-slate-400">A thoughtful pipeline is already in motion.</p>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
          { label: "Total candidates", value: statsLoading ? "..." : (stats?.total ?? 0).toLocaleString(), icon: Users },
          { label: "Avg experience", value: statsLoading ? "..." : `${averageExperience} yrs`, icon: Clock },
          { label: "Top skill", value: statsLoading ? "..." : topSkills[0]?.label ?? "None yet", icon: ScanLine },
          { label: "Ranking runs", value: rankingsLoading ? "..." : recentRankings.length.toLocaleString(), icon: Activity },
        ].map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }} key={item.label} className="rounded-[1.5rem] border border-black/5 bg-white/80 p-5 shadow-sm backdrop-blur transition-all hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900/80">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{item.value}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]"><Icon className="h-5 w-5" /></div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <Card className="border-black/5 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/80">
        <CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-black/5 bg-[color:var(--accent-soft)] px-3 py-1 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-200">
              <Zap className="h-4 w-4 text-[color:var(--accent)]" />
              Start a new ranking
            </div>
            <h2 className="font-serif text-2xl text-slate-900 dark:text-slate-100">
              Upload or paste a job description to generate a shortlist.
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Quick Rank runs the JD against the live candidate dataset and returns ranked candidates with score breakdowns, matched skills, gaps, and rationale.
            </p>
          </div>
          <Link href="/quick-rank">
            <Button className="w-full gap-2 bg-[color:var(--accent)] text-white hover:opacity-90 md:w-auto">
              <Zap className="h-4 w-4" />
              Open Quick Rank
            </Button>
          </Link>
        </CardContent>
      </Card>

      <div className="rounded-[2rem] border border-black/5 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/80">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">Weekly statistics</p>
            <h2 className="mt-2 font-serif text-2xl text-slate-900 dark:text-slate-100">A gallery of momentum</h2>
          </div>
        <div className="rounded-full border border-black/5 bg-[color:var(--accent-soft)] px-3 py-1 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-200">
          Live pool: {(stats?.total ?? 0).toLocaleString()} candidates
        </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Average experience", value: `${averageExperience} yrs` },
            { label: "Known skills", value: topSkills.length.toLocaleString() },
            { label: "Saved rankings", value: (rankings?.length ?? 0).toLocaleString() },
          ].map((stat) => (
            <div key={stat.label} className="rounded-[1.25rem] border border-black/5 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/50">
              <p className="text-sm text-slate-600 dark:text-slate-300">{stat.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top Candidates */}
      {!statsLoading && stats?.total && stats.total > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-serif text-slate-900 font-light">
              Top Candidates
            </h2>
            <Link href="/candidates">
              <Button variant="outline" size="sm" className="gap-1">
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {candidatesLoading ? (
              [1, 2, 3].map((i) => (
                <Card key={i} className="border-slate-200">
                  <CardContent className="space-y-4 pt-6">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-8 w-full" />
                  </CardContent>
                </Card>
              ))
            ) : candidatesArray.slice(0, 3).map((candidate) => (
              <Card key={candidate.id} className="border-slate-200 hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-amber-200 to-amber-300 rounded-full" />
                    <div className="text-right">
                      <div className="text-2xl font-bold text-amber-600">
                        {candidate.activityScore ?? 0}
                      </div>
                      <p className="text-xs text-slate-500">Activity</p>
                    </div>
                  </div>

                  <div className="space-y-1 mb-4">
                    <h3 className="font-semibold text-slate-900">{candidate.name}</h3>
                    <p className="text-sm text-slate-600">
                      {[candidate.currentTitle, candidate.currentCompany].filter(Boolean).join(" @ ") || "Candidate profile"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {candidate.yearsExperience ?? 0} years experience
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-900">
                      Skills from dataset
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(candidate.skills ?? []).slice(0, 3).map((skill) => (
                        <Badge key={skill} className="text-xs bg-green-100 text-green-900 border-0">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <Link href={`/candidates/${candidate.id}`}>
                    <Button className="w-full mt-4 gap-2 bg-amber-600 hover:bg-amber-700">
                      <Users className="h-4 w-4" />
                      View Profile
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent Rankings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-serif text-slate-900 font-light">
            Recent Ranking Runs
          </h2>
          <Link href="/quick-rank">
            <Button size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700">
              <Plus className="h-4 w-4" />
              New Ranking
            </Button>
          </Link>
        </div>

        <Card className="border-slate-200">
          <CardContent className="p-0">
            {rankingsLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentRankings.length === 0 ? (
              <div className="py-12 text-center">
                <Zap className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 text-sm">
                  No rankings yet. Start your first ranking to find top candidates.
                </p>
                <Link href="/quick-rank" className="mt-4 inline-block">
                  <Button variant="outline" size="sm">
                    Start Curating
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {recentRankings.map((run) => (
                  <Link key={run.id} href={`/rankings/${run.id}`}>
                    <div className="p-4 hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-slate-900 text-sm truncate">
                            {run.jobTitle || `Ranking #${run.id}`}
                          </h3>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                            <span>
                              {format(new Date(run.createdAt), "MMM d, yyyy")}
                            </span>
                            <span>•</span>
                            <span>Top {run.topN || 10}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {getStatusBadge(run.status)}
                          <ArrowRight className="h-4 w-4 text-slate-400" />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
