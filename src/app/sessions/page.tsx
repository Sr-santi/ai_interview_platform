import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Evaluation, TranscriptEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

interface SessionRow {
  id: string;
  jobId: string;
  jobTitle: string;
  transcript: TranscriptEntry[];
  evaluation: Evaluation | null;
  createdAt: Date;
}

async function getSessions(): Promise<{ sessions: SessionRow[]; jobTitles: Map<string, string> }> {
  const sessions = await prisma.session.findMany({
    include: { job: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const jobTitles = new Map<string, string>();

  const rows: SessionRow[] = sessions.map((s) => {
    jobTitles.set(s.jobId, s.job.title);

    let transcript: TranscriptEntry[] = [];
    if (typeof s.transcript === "string") {
      try { transcript = JSON.parse(s.transcript); } catch { transcript = []; }
    } else if (Array.isArray(s.transcript)) {
      transcript = s.transcript as unknown as TranscriptEntry[];
    }

    let evaluation: Evaluation | null = null;
    if (s.evaluation) {
      if (typeof s.evaluation === "string") {
        try { evaluation = JSON.parse(s.evaluation); } catch { evaluation = null; }
      } else {
        evaluation = s.evaluation as unknown as Evaluation;
      }
    }

    return {
      id: s.id,
      jobId: s.jobId,
      jobTitle: s.job.title,
      transcript,
      evaluation,
      createdAt: s.createdAt,
    };
  });

  return { sessions: rows, jobTitles };
}

function computeTalkRatio(transcript: TranscriptEntry[]): { interviewer: number; candidate: number } {
  let iw = 0;
  let cw = 0;
  for (const entry of transcript) {
    const words = entry.text.split(/\s+/).filter(Boolean).length;
    if (entry.role === "interviewer") iw += words;
    else cw += words;
  }
  return { interviewer: iw, candidate: cw };
}

export default async function SessionsPage() {
  const { sessions, jobTitles } = await getSessions();
  const uniqueJobs = Array.from(jobTitles.entries());

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-3 sm:px-4 py-8 sm:py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-interview-text">Session History</h1>
          <p className="text-sm text-interview-muted mt-1">Past interview sessions and evaluations</p>
        </div>
        <Link
          href="/"
          className="text-sm text-interview-muted hover:text-interview-text transition-colors"
        >
          &larr; Home
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-16 text-interview-muted">
          <p className="text-lg">No sessions yet</p>
          <p className="text-sm mt-2">
            <Link href="/" className="text-interview-accent hover:underline">
              Start an interview
            </Link>{" "}
            to see your history here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Filter by role */}
          <div className="flex flex-wrap gap-2">
            {uniqueJobs.map(([jobId, title]) => {
              const count = sessions.filter((s) => s.jobId === jobId).length;
              return (
                <a
                  key={jobId}
                  href={`#role-${jobId}`}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-interview-surface border border-interview-border hover:border-interview-accent/50 text-interview-text transition-colors"
                >
                  {title} ({count})
                </a>
              );
            })}
          </div>

          {/* Sessions grouped by role */}
          {uniqueJobs.map(([jobId, title]) => {
            const jobSessions = sessions.filter((s) => s.jobId === jobId);
            return (
              <section key={jobId} id={`role-${jobId}`}>
                <h2 className="text-sm font-semibold text-interview-muted uppercase tracking-wider mb-3">
                  {title}
                </h2>
                <div className="space-y-3">
                  {jobSessions.map((session) => {
                    const ratio = computeTalkRatio(session.transcript);
                    const totalWords = ratio.interviewer + ratio.candidate;
                    const candidatePct = totalWords > 0 ? Math.round((ratio.candidate / totalWords) * 100) : 0;
                    return (
                      <Link
                        key={session.id}
                        href={`/sessions/${session.id}`}
                        className="block rounded-xl border border-interview-border bg-interview-surface p-4 hover:border-interview-accent/50 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-interview-text truncate group-hover:text-interview-accent transition-colors">
                              {session.transcript[1]?.text?.slice(0, 80) || "Session"}...
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-interview-muted">
                              <span>
                                {new Date(session.createdAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                              <span>{session.transcript.length} turns</span>
                              <span>{totalWords} words</span>
                              <span>Candidate: {candidatePct}% of talk</span>
                            </div>
                          </div>
                          {session.evaluation && (
                            <div className="shrink-0 text-center">
                              <div className="text-lg font-bold text-interview-accent group-hover:scale-110 transition-transform">
                                {session.evaluation.score}
                              </div>
                              <div className="text-[10px] text-interview-muted">Score</div>
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
