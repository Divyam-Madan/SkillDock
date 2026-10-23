import React, { useEffect, useState } from "react";
import { useListCandidates, useGetCandidateStats } from "@workspace/api-client-react";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = ["#d4a574", "#9ca3af", "#d1d5db", "#e5e7eb", "#f3f4f6", "#fafafa"];
const PAGE_SIZE = 25;

export default function CandidatesPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const { data: page, isLoading, isFetching } = useListCandidates({
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset,
  });
  const { data: stats } = useGetCandidateStats();

  // Ensure arrays are always safe
  const candidatesArray = Array.isArray(page?.candidates) ? page.candidates : [];
  const educationBreakdown = Array.isArray(stats?.educationBreakdown)
    ? stats.educationBreakdown
    : [];
  const topSkills = Array.isArray(stats?.topSkills) ? stats.topSkills : [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-light font-serif text-slate-900 tracking-tight mb-2">
          Talent Pool
        </h1>
        <p className="text-slate-600 font-light">
          {stats?.total ?? 0} candidates available for ranking.
        </p>
      </div>

      {/* Stats Section */}
      {stats && educationBreakdown.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-wider font-semibold text-slate-600">
                Education Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={educationBreakdown} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={100} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="#d4a574">
                    {educationBreakdown.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-wider font-semibold text-slate-600">
                Top Skills in Pool
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {topSkills.slice(0, 8).map((s, i) => (
                  <Badge key={s.label} variant="secondary" className="text-xs bg-amber-100 text-amber-900 border-amber-200">
                    {s.label}
                    <span className="font-mono text-amber-700 ml-1">({s.count})</span>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search by name, title, or company..."
          className="pl-9 border-slate-300 bg-white text-slate-900 placeholder:text-slate-500"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
        <span>
          {candidatesArray.length > 0
            ? `Showing ${offset + 1}-${offset + candidatesArray.length} · ${stats?.total?.toLocaleString() ?? "…"} in pool`
            : `${stats?.total?.toLocaleString() ?? "…"} in pool`}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={offset === 0 || isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Previous
          </Button>
          <Button variant="outline" size="sm" disabled={!page?.hasMore || isFetching} onClick={() => setOffset(offset + PAGE_SIZE)}>
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Candidates List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : candidatesArray.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 p-3 bg-white rounded-full">
              <Users className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-slate-600 text-sm">
              {search ? "No candidates match your search." : "No candidates in the pool yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {candidatesArray.map((c) => (
            <Card key={c.id} className="border-slate-200 hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-slate-900 truncate">{c.name}</h3>
                      {c.activityScore && (
                        <span className={`text-xs font-medium ${c.activityScore >= 85 ? "text-green-600" : c.activityScore >= 70 ? "text-amber-600" : "text-slate-500"}`}>
                          ★ {c.activityScore}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 mb-2">
                      {c.currentTitle && <span>{c.currentTitle}</span>}
                      {c.currentCompany && <span className="text-slate-500">at {c.currentCompany}</span>}
                      {c.location && <span className="text-slate-500">• {c.location}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(c.skills ?? []).slice(0, 6).map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs bg-slate-100 text-slate-700 border-0">
                          {s}
                        </Badge>
                      ))}
                      {(c.skills ?? []).length > 6 && (
                        <Badge variant="secondary" className="text-xs text-slate-600">
                          +{(c.skills ?? []).length - 6}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 text-sm text-slate-600">
                    {c.yearsExperience != null && (
                      <div className="font-semibold text-slate-900">{c.yearsExperience} yrs</div>
                    )}
                    {c.educationLevel && (
                      <div className="text-xs mt-1 text-slate-500">{c.educationLevel}</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
