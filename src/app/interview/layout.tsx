import Link from "next/link";

export default function InterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-interview-border bg-interview-surface/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 h-12 flex items-center">
          <Link
            href="/"
            className="text-xs text-interview-muted hover:text-interview-text transition-colors flex items-center gap-1"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to roles
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
