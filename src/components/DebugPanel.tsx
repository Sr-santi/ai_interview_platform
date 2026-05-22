"use client";

import { useDebugStore } from "@/stores/debug";
import { useInterviewStore } from "@/stores/interview";

function LogRow({
  entry,
  startTime,
}: {
  entry: { timestamp: number; source: string; event: string; data?: unknown };
  startTime: number;
}) {
  const elapsed = ((entry.timestamp - startTime) / 1000).toFixed(3);
  const sourceColor =
    entry.source === "STT"
      ? "text-green-400"
      : entry.source === "TTS"
        ? "text-purple-400"
        : entry.source === "LLM"
          ? "text-yellow-400"
          : entry.source === "Interview"
            ? "text-blue-400"
            : "text-cyan-400";

  return (
    <div className="flex gap-1 text-[10px] font-mono leading-tight border-b border-interview-border/30 py-0.5">
      <span className="text-interview-muted shrink-0 w-14 text-right">
        +{elapsed}s
      </span>
      <span className={`shrink-0 w-16 ${sourceColor}`}>{entry.source}</span>
      <span className="text-interview-text">{entry.event}</span>
      {entry.data !== undefined && (
        <span className="text-interview-muted truncate">
          {JSON.stringify(entry.data).slice(0, 120)}
        </span>
      )}
    </div>
  );
}

export function DebugPanel() {
  const debugStore = useDebugStore();
  const interview = useInterviewStore();

  if (process.env.NODE_ENV !== "development" && !debugStore.isOpen) return null;

  const startTime =
    debugStore.entries.length > 0 ? debugStore.entries[0].timestamp : 0;

  return (
    <>
      <button
        onClick={() => debugStore.toggle()}
        className="fixed bottom-2 right-2 z-50 px-2 py-1 text-[10px] rounded bg-interview-surface border border-interview-border text-interview-muted hover:text-interview-text transition-colors"
      >
        {debugStore.isOpen ? "Hide Debug" : `Debug (${debugStore.entries.length})`}
      </button>

      {debugStore.isOpen && (
        <div className="fixed bottom-10 right-2 z-50 w-[480px] max-h-[70vh] overflow-hidden rounded-xl border border-interview-border bg-interview-bg shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-interview-border bg-interview-surface shrink-0">
            <span className="text-xs font-semibold text-interview-text">
              Debug Panel — {debugStore.entries.length} events
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => debugStore.clear()}
                className="text-[10px] text-interview-muted hover:text-interview-text"
              >
                Clear
              </button>
              <button
                onClick={() => debugStore.toggle()}
                className="text-[10px] text-interview-muted hover:text-interview-text"
              >
                Close
              </button>
            </div>
          </div>

          <div className="px-3 py-1.5 border-b border-interview-border/50 text-[10px] font-mono space-y-0.5 shrink-0">
            <div className="flex gap-4 flex-wrap">
              <span>
                <span className="text-interview-muted">Interview:</span>{" "}
                <span className="text-blue-400">{interview.state}</span>{" "}
                <span className="text-interview-muted">
                  Q{interview.questionCount + 1}/6 t:{interview.transcript.length}
                </span>
              </span>
              <span>
                <span className="text-interview-muted">Net:</span>{" "}
                <span
                  className={
                    typeof navigator !== "undefined" && navigator.onLine
                      ? "text-green-400"
                      : "text-red-400"
                  }
                >
                  {typeof navigator !== "undefined" && navigator.onLine
                    ? "online"
                    : "offline"}
                </span>
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-1">
            {debugStore.entries.length === 0 && (
              <div className="text-[10px] text-interview-muted text-center py-4">
                No events yet. Interact with the interview to collect data.
              </div>
            )}
            {debugStore.entries.map((entry) => (
              <LogRow key={entry.id} entry={entry} startTime={startTime} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
