import React, { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetRanking, useGetRankingStats, useExportRanking,
  getGetRankingQueryKey,
  getGetRankingStatsQueryKey, getExportRankingQueryKey,
} from "@workspace/api-client-react";
import {
  ArrowLeft, Download, Search, ChevronDown, ChevronUp, Trophy,
  CheckCircle, XCircle, Activity, Clock, AlertCircle, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const DIM_COLORS = {
  semanticScore: "#6366f1",
  experienceScore: "#3b82f6",
  educationScore: "#22c55e",
  activityScore: "#f97316",
  trajectoryScore: "#14b8a6",
} as const;

const DIM_LABELS = {
  semanticScore: "Semantic Match",
  experienceScore: "Experience",
  educationScore: "Education",
  activityScore: "Activity",
  trajectoryScore: "Trajectory",
};

const DIM_WEIGHTS = {
  semanticScore: "35%",
  experienceScore: "25%",
  educationScore: "15%",
  activityScore: "15%",
  trajectoryScore: "10%",
};

function ScoreBar({ label, value, color, weight }: { label: string; value: number | null | undefined; color: string; weight: string }) {
  const pct = value ?? 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground">{label} <span className="text-muted-foreground/60">({weight})</span></span>
        <span className="font-mono font-medium">{pct.toFixed(1)}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const colors = ["bg-amber-400 text-amber-900", "bg-slate-300 text-slate-800", "bg-amber-600 text-amber-100"];
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${rank <= 3 ? colors[rank - 1] : "bg-muted text-muted-foreground"}`}>
      {rank}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#6366f1" : score >= 40 ? "#f97316" : "#ef4444";
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted" />
        <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray={`${(score / 100) * 94.2} 94.2`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold font-mono">{Math.round(score)}</span>
      </div>
    </div>
  );
}

export default function RankingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const rankingId = Number(id);

  const { data: run, isLoading: runLoading } = useGetRanking(rankingId, { query: {
    queryKey: getGetRankingQueryKey(rankingId),
    enabled: !!rankingId,
    refetchInterval: (query) => query.state.data?.status === "running" || query.state.data?.status === "pending" ? 2000 : false,
  } });
  const rankingComplete = run?.status === "completed";
  const results = run?.results;
  const resultsLoading = runLoading || (rankingComplete && !run?.results);
  const { data: stats } = useGetRankingStats(rankingId, { query: { queryKey: getGetRankingStatsQueryKey(rankingId), enabled: !!rankingId && rankingComplete } });
  const { refetch: fetchExport } = useExportRanking(rankingId, { query: { queryKey: getExportRankingQueryKey(rankingId), enabled: false } });

  const [search, setSearch] = useState("");
  const [minScoreFilter, setMinScoreFilter] = useState(0);
  const [sortBy, setSortBy] = useState<"compositeScore" | "semanticScore" | "experienceScore">("compositeScore");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Ensure results is always an array
  const resultsArray = Array.isArray(results) ? results : [];
  const processedCandidates = run?.processedCandidates ?? 0;
  const totalCandidates = run?.totalCandidates ?? 0;
  const progressPercent = totalCandidates > 0
    ? Math.min(100, (processedCandidates / totalCandidates) * 100)
    : 0;

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (resultsArray.length === 0) return [];
    return resultsArray
      .filter((r) => r.candidate != null)
      .filter((r) => {
        if (r.compositeScore < minScoreFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          return (
            r.candidate!.name.toLowerCase().includes(q) ||
            (r.candidate!.currentTitle ?? "").toLowerCase().includes(q) ||
            (r.candidate!.currentCompany ?? "").toLowerCase().includes(q) ||
            (r.candidate!.skills ?? []).some((s) => s.toLowerCase().includes(q))
          );
        }
        return true;
      })
      .sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0));
  }, [resultsArray, search, minScoreFilter, sortBy]);

  const handleExport = async () => {
    const { data } = await fetchExport();
    if (!data) return;
    const blob = new Blob([data as string], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ranking-${rankingId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
      completed: { label: "Completed", cls: "bg-green-50 text-green-700 border-green-200", icon: <CheckCircle className="w-3 h-3" /> },
      running:   { label: "Running",   cls: "bg-amber-50 text-amber-700 border-amber-200 animate-pulse", icon: <Activity className="w-3 h-3" /> },
      pending:   { label: "Pending",   cls: "bg-gray-50 text-gray-600 border-gray-200", icon: <Clock className="w-3 h-3" /> },
      failed:    { label: "Failed",    cls: "bg-red-50 text-red-700 border-red-200", icon: <XCircle className="w-3 h-3" /> },
    };
    const s = map[status] ?? map.pending;
    return <Badge variant="outline" className={`${s.cls} gap-1`}>{s.icon}{s.label}</Badge>;
  };

  if (runLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
        {[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Ranking not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1 -ml-2 mb-1">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{run.jobTitle ?? "Ranking Results"}</h1>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <StatusBadge status={run.status} />
            <span className="text-sm text-muted-foreground">{run.totalCandidates ?? 0} evaluated</span>
            <span className="text-sm text-muted-foreground">{run.shortlistedCount ?? 0} shortlisted</span>
          </div>
        </div>
        {run.status === "completed" && (
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
        )}
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-medium">Score Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={stats.scoreDistribution} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {stats.scoreDistribution.map((_, i) => (
                      <Cell key={i} fill={i >= 3 ? "#6366f1" : "#a5b4fc"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-medium">Skill Gaps</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs font-medium mb-1.5 text-emerald-600">Most Matched</p>
                <div className="flex flex-wrap gap-1">
                  {stats.topMatchedSkills.slice(0, 4).map((s) => (
                    <Badge key={s.label} variant="secondary" className="text-xs bg-emerald-50 text-emerald-700 border-0">{s.label} {s.count}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium mb-1.5 text-red-500">Most Missing</p>
                <div className="flex flex-wrap gap-1">
                  {stats.topMissingSkills.slice(0, 4).map((s) => (
                    <Badge key={s.label} variant="secondary" className="text-xs bg-red-50 text-red-700 border-0">{s.label} {s.count}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search candidates..." className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 text-sm shrink-0">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Min score:</span>
          <span className="font-mono font-medium w-8">{minScoreFilter}</span>
          <Slider min={0} max={80} step={5} value={[minScoreFilter]} onValueChange={([v]) => setMinScoreFilter(v)} className="w-24" />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="w-44 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="compositeScore">Sort: Composite</SelectItem>
            <SelectItem value="semanticScore">Sort: Semantic</SelectItem>
            <SelectItem value="experienceScore">Sort: Experience</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {run.status === "pending" || run.status === "running" ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Activity className="h-8 w-8 text-primary mb-3 animate-pulse" />
            <p className="font-medium">Ranking candidates…</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {processedCandidates.toLocaleString()} / {totalCandidates > 0 ? totalCandidates.toLocaleString() : "…"} candidates scored
            </p>
            <div className="mt-4 h-2 w-full max-w-md overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)}>
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">This page updates automatically.</p>
          </CardContent>
        </Card>
      ) : run.status === "failed" ? (
        <Card className="border-red-200">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
            <p className="font-medium">This ranking could not be completed.</p>
            <p className="mt-1 text-sm text-muted-foreground">Return to the dashboard and start a new run.</p>
          </CardContent>
        </Card>
      ) : resultsLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Trophy className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">{search || minScoreFilter > 0 ? "No candidates match your filters." : "No results yet."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtered.length} candidate{filtered.length !== 1 ? "s" : ""} shown</p>
          {filtered.map((r) => {
            const expanded = expandedIds.has(r.id);
            return (
              <Card key={r.id} className={`transition-shadow ${expanded ? "shadow-md" : "hover:shadow-sm"}`}>
                <CardContent className="p-4">
                  {/* Collapsed row */}
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleExpand(r.id)}>
                    <RankBadge rank={r.rank} />
                    <ScoreRing score={r.compositeScore} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{r.candidate?.name}</span>
                        {r.candidate?.currentTitle && <span className="text-sm text-muted-foreground">{r.candidate.currentTitle}</span>}
                        {r.candidate?.currentCompany && <span className="text-sm text-muted-foreground">at {r.candidate.currentCompany}</span>}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(r.matchedSkills ?? []).slice(0, 3).map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs bg-emerald-50 text-emerald-700 border-0 h-4">{s}</Badge>
                        ))}
                        {(r.missingSkills ?? []).slice(0, 2).map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs bg-red-50 text-red-600 border-0 h-4">{s}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 text-muted-foreground">
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="mt-4 pt-4 border-t border-border space-y-4">
                      {/* Score breakdown */}
                      <div className="grid gap-1.5">
                        {(Object.keys(DIM_LABELS) as (keyof typeof DIM_LABELS)[]).map((dim) => (
                          <ScoreBar
                            key={dim}
                            label={DIM_LABELS[dim]}
                            value={r[dim] as number}
                            color={DIM_COLORS[dim]}
                            weight={DIM_WEIGHTS[dim]}
                          />
                        ))}
                      </div>

                      {/* Rationale */}
                      {r.rationale && (
                        <div className="bg-muted/50 rounded-md px-4 py-3">
                          <p className="text-sm text-foreground/80 leading-relaxed italic">"{r.rationale}"</p>
                        </div>
                      )}

                      {/* Skill gap */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-emerald-600 mb-2 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" /> Matched Skills
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {(r.matchedSkills ?? []).length > 0 ? (
                              (r.matchedSkills ?? []).map((s) => (
                                <Badge key={s} variant="secondary" className="text-xs bg-emerald-50 text-emerald-700 border-0">{s}</Badge>
                              ))
                            ) : <span className="text-xs text-muted-foreground">None matched</span>}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-red-500 mb-2 flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> Missing Skills
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {(r.missingSkills ?? []).length > 0 ? (
                              (r.missingSkills ?? []).map((s) => (
                                <Badge key={s} variant="secondary" className="text-xs bg-red-50 text-red-600 border-0">{s}</Badge>
                              ))
                            ) : <span className="text-xs text-muted-foreground">No gaps</span>}
                          </div>
                        </div>
                      </div>

                      {/* Candidate meta */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {r.candidate?.yearsExperience != null && <div><span className="font-medium text-foreground">Experience:</span> {r.candidate.yearsExperience} years</div>}
                        {r.candidate?.educationLevel && <div><span className="font-medium text-foreground">Education:</span> {r.candidate.educationLevel}</div>}
                        {r.candidate?.location && <div><span className="font-medium text-foreground">Location:</span> {r.candidate.location}</div>}
                        {r.candidate?.email && <div><span className="font-medium text-foreground">Email:</span> {r.candidate.email}</div>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
