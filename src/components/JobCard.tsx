import Link from "next/link";
import type { Job } from "@/lib/types";

export function JobCard({ job }: { job: Job }) {
  return (
    <Link
      href={`/interview/${job.id}`}
      className="block p-6 rounded-xl border border-interview-border bg-interview-surface hover:border-interview-accent/50 hover:bg-interview-surface/80 transition-all duration-200 group"
    >
      <h2 className="text-lg font-semibold text-interview-text group-hover:text-interview-accent-hover transition-colors">
        {job.title}
      </h2>
      <p className="mt-2 text-sm text-interview-muted leading-relaxed">
        {job.description}
      </p>
      <div className="mt-4 flex items-center text-xs text-interview-accent">
        <span>Start interview</span>
        <svg
          className="ml-1 w-3 h-3 group-hover:translate-x-0.5 transition-transform"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </Link>
  );
}
