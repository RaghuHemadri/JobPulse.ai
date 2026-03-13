import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Play, RefreshCw, BarChart3, CheckCircle, XCircle, Clock,
  ExternalLink, Mail, ChevronDown, ChevronRight, Loader2,
} from "lucide-react";
import type { Stats, PipelineRun, Job } from "@shared/schema";
import { useState } from "react";

function decodeProofpointV2(value: string): string {
  const withPercents = value
    .replace(/-([0-9a-fA-F]{2})/g, "%$1")
    .replace(/_/g, "/");
  try {
    return decodeURIComponent(withPercents);
  } catch {
    return withPercents;
  }
}

function normalizeJobLink(url: string, title: string, company: string, location: string): string {
  void title;
  void company;
  void location;
  const trimmed = (url || "").trim();
  if (!trimmed) return "";

  let candidate = trimmed;
  try {
    const parsed = new URL(candidate);
    if (parsed.hostname.includes("urldefense.proofpoint.com")) {
      const v2Param = parsed.searchParams.get("u");
      if (v2Param) candidate = decodeProofpointV2(v2Param);
      const v3Match = parsed.pathname.match(/\/v3\/__([^;]+)__;/);
      if (v3Match?.[1]) candidate = decodeURIComponent(v3Match[1]);
    }
  } catch {
    // Continue to protocol fix and fallback.
  }

  if (!/^https?:\/\//i.test(candidate)) {
    if (candidate.startsWith("www.")) {
      candidate = `https://${candidate}`;
    } else {
      return "";
    }
  }

  try {
    const parsed = new URL(candidate);
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    if (isHttp) {
      return parsed.toString();
    }
  } catch {
    return "";
  }

  return "";
}

export default function Dashboard() {
  const { toast } = useToast();
  const [expandedRun, setExpandedRun] = useState<number | null>(null);
  const [jobDialogRun, setJobDialogRun] = useState<number | null>(null);

  const statsQuery = useQuery<Stats>({ queryKey: ["/api/stats"] });
  const runsQuery = useQuery<PipelineRun[]>({ queryKey: ["/api/runs"], refetchInterval: 3000 });

  const runPipeline = useMutation({
    mutationFn: () => apiRequest("POST", "/api/pipeline/run"),
    onSuccess: () => {
      toast({ title: "Pipeline started", description: "Searching for jobs..." });
      queryClient.invalidateQueries({ queryKey: ["/api/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const resendMutation = useMutation({
    mutationFn: (runId: number) => apiRequest("POST", `/api/runs/${runId}/resend`),
    onSuccess: () => {
      toast({ title: "Email sent", description: "Email resent successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/runs"] });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const stats = statsQuery.data;
  const runs = runsQuery.data || [];

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Pipeline runs and job tracking</p>
        </div>
        <Button
          onClick={() => runPipeline.mutate()}
          disabled={runPipeline.isPending}
          data-testid="button-run-pipeline"
        >
          {runPipeline.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          Run Pipeline
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard title="Total Runs" value={stats?.totalRuns ?? 0} icon={<BarChart3 className="w-4 h-4" />} />
        <KPICard title="Jobs Found" value={stats?.totalJobs ?? 0} icon={<CheckCircle className="w-4 h-4" />} />
        <KPICard title="Success Rate" value={`${stats?.successRate ?? 0}%`} icon={<RefreshCw className="w-4 h-4" />} />
        <KPICard title="Next Run" value={stats?.nextRun ?? "—"} icon={<Clock className="w-4 h-4" />} isText />
      </div>

      {/* Run History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Run History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No runs yet. Click "Run Pipeline" to start.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Run</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Jobs</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    expanded={expandedRun === run.id}
                    onToggle={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                    onViewJobs={() => setJobDialogRun(run.id)}
                    onResend={() => resendMutation.mutate(run.id)}
                    resending={resendMutation.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Job Dialog */}
      {jobDialogRun !== null && (
        <JobDialog runId={jobDialogRun} onClose={() => setJobDialogRun(null)} />
      )}
    </div>
  );
}

function KPICard({ title, value, icon, isText }: { title: string; value: string | number; icon: React.ReactNode; isText?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{title}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className={`${isText ? "text-sm" : "text-2xl"} font-semibold tabular-nums`} data-testid={`text-kpi-${title.toLowerCase().replace(/\s/g, "-")}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function RunRow({ run, expanded, onToggle, onViewJobs, onResend, resending }: {
  run: PipelineRun; expanded: boolean; onToggle: () => void;
  onViewJobs: () => void; onResend: () => void; resending: boolean;
}) {
  const date = new Date(run.startedAt);
  const statusColor = run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary";

  return (
    <TableRow data-testid={`row-run-${run.id}`}>
      <TableCell>
        <button onClick={onToggle} className="p-1 hover:bg-muted rounded" data-testid={`button-expand-${run.id}`}>
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </TableCell>
      <TableCell className="font-medium tabular-nums">#{run.id}</TableCell>
      <TableCell className="text-sm text-muted-foreground tabular-nums">
        {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </TableCell>
      <TableCell>
        <Badge variant={statusColor} className="text-xs capitalize">
          {run.status === "running" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          {run.status}
        </Badge>
      </TableCell>
      <TableCell className="tabular-nums">{run.jobsFound}</TableCell>
      <TableCell>
        {run.emailSent ? (
          <CheckCircle className="w-4 h-4 text-green-500" />
        ) : (
          <XCircle className="w-4 h-4 text-muted-foreground" />
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          {run.status === "completed" && run.jobsFound > 0 && (
            <Button variant="ghost" size="sm" onClick={onViewJobs} className="h-7 text-xs" data-testid={`button-view-jobs-${run.id}`}>
              View Jobs
            </Button>
          )}
          {run.status === "completed" && (
            <Button variant="ghost" size="sm" onClick={onResend} disabled={resending} className="h-7 text-xs" data-testid={`button-resend-${run.id}`}>
              <Mail className="w-3 h-3 mr-1" />
              Resend
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function JobDialog({ runId, onClose }: { runId: number; onClose: () => void }) {
  const jobsQuery = useQuery<Job[]>({ queryKey: ["/api/runs", runId, "jobs"] });
  const jobs = jobsQuery.data || [];

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">Jobs from Run #{runId}</DialogTitle>
        </DialogHeader>
        {jobsQuery.isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No jobs found for this run.</p>
        ) : (
          <div className="space-y-3">
            {jobs.map((job, i) => {
              const href = normalizeJobLink(job.url, job.title, job.company, job.location);
              return (
                <div key={job.id} className="border rounded-lg p-3 space-y-1" data-testid={`card-job-${job.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs text-muted-foreground mr-2 tabular-nums">{i + 1}.</span>
                      <span className="text-sm font-medium">{job.title}</span>
                      <span className="text-sm text-muted-foreground"> | {job.company} | {job.location}</span>
                    </div>
                    {href && (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                      </a>
                    )}
                  </div>
                  {job.description && <p className="text-xs text-muted-foreground">{job.description}</p>}
                  <p className="text-xs"><span className="text-muted-foreground">Match:</span> {job.matchReason}</p>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
