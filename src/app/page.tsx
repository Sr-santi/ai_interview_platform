import { prisma } from "@/lib/prisma";
import { JobCard } from "@/components/JobCard";

export default async function Home() {
  const jobs = await prisma.job.findMany({
    orderBy: { title: "asc" },
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
      </div>
    </main>
  );
}
