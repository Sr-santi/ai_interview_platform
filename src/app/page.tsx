import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { JobCard } from "@/components/JobCard";
import type { Job } from "@/lib/types";

export default async function Home() {
  const dbJobs = await prisma.job.findMany({
    where: { isPublished: true },
    orderBy: { title: "asc" },
  });

  const jobs: Job[] = dbJobs.map((j) => ({
    id: j.id,
    title: j.title,
    description: j.description,
    systemPrompt: j.systemPrompt,
    maxDurationSeconds: j.maxDurationSeconds,
  }));

  const recentSessions = await prisma.session.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    include: { job: { select: { title: true } } },
  });

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-interview-text">
            AI Interviewer
          </h1>
          <p className="mt-3 text-interview-muted text-sm max-w-md mx-auto">
            Select a role below to start a voice-driven AI interview. Speak your
            answers — the AI adapts questions in real-time.
          </p>
        </div>

        {jobs.length === 0 ? (
          <div className="text-center py-12 text-interview-muted">
            <p>No roles available.</p>
            <p className="text-xs mt-1">Run `npm run db:seed` to populate jobs.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-interview-muted uppercase tracking-wider">
                Recent Sessions
              </h2>
              <Link
                href="/sessions"
                className="text-xs text-interview-accent hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="space-y-2">
              {recentSessions.map((s) => {
                let evaluation: { score?: number } | null = null;
                if (s.evaluation) {
                  if (typeof s.evaluation === "string") {
                    try { evaluation = JSON.parse(s.evaluation); } catch { evaluation = null; }
                  } else {
                    evaluation = s.evaluation as { score?: number };
                  }
                }
                return (
                  <Link
                    key={s.id}
                    href={`/sessions/${s.id}`}
                    className="flex items-center justify-between rounded-lg border border-interview-border bg-interview-surface px-4 py-3 hover:border-interview-accent/50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-interview-text truncate group-hover:text-interview-accent transition-colors">
                        {s.job.title}
                      </p>
                      <p className="text-xs text-interview-muted mt-0.5">
                        {new Date(s.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    {evaluation?.score != null && (
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${
                          evaluation.score >= 70
                            ? "bg-interview-success/10 text-interview-success border border-interview-success/20"
                            : evaluation.score >= 40
                              ? "bg-interview-warning/10 text-interview-warning border border-interview-warning/20"
                              : "bg-interview-danger/10 text-interview-danger border border-interview-danger/20"
                        }`}
                      >
                        {evaluation.score}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
