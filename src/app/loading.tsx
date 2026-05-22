export default function Loading() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <div className="h-9 w-48 mx-auto rounded-lg bg-interview-surface animate-pulse" />
          <div className="h-4 w-72 mx-auto mt-3 rounded bg-interview-surface animate-pulse" />
        </div>

        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-interview-border bg-interview-surface p-6"
            >
              <div className="h-5 w-3/4 rounded bg-interview-border animate-pulse mb-3" />
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-interview-border animate-pulse" />
                <div className="h-3 w-5/6 rounded bg-interview-border animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-interview-border animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
