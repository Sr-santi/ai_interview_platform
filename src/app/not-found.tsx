import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-interview-text">404</h1>
      <p className="text-interview-muted">Job not found</p>
      <Link
        href="/"
        className="text-sm text-interview-accent hover:text-interview-accent-hover transition-colors"
      >
        Back to roles
      </Link>
    </div>
  );
}
