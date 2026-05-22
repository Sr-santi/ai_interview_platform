"use client";

interface DecisionPanelProps {
  thoughtProcess?: string;
  accumulatedSkills: string[];
  coveredTopics: string[];
  availableTopics: string[];
  isOpen: boolean;
  onToggle: () => void;
}

export function DecisionPanel({
  thoughtProcess,
  accumulatedSkills,
  coveredTopics,
  availableTopics,
  isOpen,
  onToggle,
}: DecisionPanelProps) {
  const coverageCount = coveredTopics.length;
  const coverageTotal = availableTopics.length;
  const coveragePct = coverageTotal > 0 ? Math.round((coverageCount / coverageTotal) * 100) : 0;

  const hasAnyData = accumulatedSkills.length > 0 || availableTopics.length > 0 || Boolean(thoughtProcess);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="fixed right-4 top-20 z-30 w-8 h-8 rounded-full bg-interview-surface border border-interview-border hover:border-interview-accent/50 text-interview-muted hover:text-interview-text flex items-center justify-center transition-colors"
        aria-label={isOpen ? "Close decision panel" : "Open decision panel"}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
          />
        </svg>
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="fixed right-0 top-16 bottom-0 w-72 sm:w-80 bg-interview-surface border-l border-interview-border z-20 overflow-y-auto">
          <div className="p-4 pt-2">
            <h2 className="text-sm font-semibold text-interview-text mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-interview-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Decision Panel
            </h2>

            {!hasAnyData ? (
              <div className="space-y-4">
                <p className="text-xs text-interview-muted">
                  Interviewer signals will appear here as the interview progresses. Start answering questions to see the AI&apos;s reasoning.
                </p>
                <div className="rounded-lg bg-interview-bg p-3 border border-interview-border/50">
                  <h3 className="text-xs font-semibold text-interview-muted mb-2">What to expect</h3>
                  <ul className="space-y-1.5 text-[11px] text-interview-muted">
                    <li className="flex items-start gap-1.5">
                      <span className="text-interview-accent mt-0.5">1</span>
                      Skills the AI detects from your answers
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-interview-accent mt-0.5">2</span>
                      Topics covered and remaining gaps
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-interview-accent mt-0.5">3</span>
                      Why the AI chose each question
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Skills Detected */}
                <section>
                  <h3 className="text-xs font-semibold text-interview-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                    <svg className="w-3 h-3 text-interview-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Skills Detected
                    {accumulatedSkills.length > 0 && (
                      <span className="text-[10px] font-normal text-interview-muted normal-case tracking-normal">
                        ({accumulatedSkills.length})
                      </span>
                    )}
                  </h3>
                  {accumulatedSkills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {accumulatedSkills.map((skill, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-interview-success/10 text-interview-success border border-interview-success/20"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-interview-muted italic">
                      No skills detected yet — answer a question to start
                    </p>
                  )}
                </section>

                {/* Topic Coverage */}
                {availableTopics.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold text-interview-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                      <svg className="w-3 h-3 text-interview-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                      Topic Coverage
                      <span className="text-[10px] font-normal text-interview-muted normal-case tracking-normal ml-auto">
                        {coverageCount} / {coverageTotal}
                      </span>
                    </h3>
                    {/* Progress bar */}
                    <div className="h-1.5 rounded-full bg-interview-bg border border-interview-border/50 mb-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-interview-accent transition-all duration-500"
                        style={{ width: `${coveragePct}%` }}
                      />
                    </div>
                    <div className="space-y-1">
                      {availableTopics.map((topic) => {
                        const covered = coveredTopics.includes(topic);
                        return (
                          <div
                            key={topic}
                            className={`flex items-center gap-2 text-[11px] py-0.5 px-1.5 rounded-md transition-colors ${
                              covered
                                ? "text-interview-success bg-interview-success/5"
                                : "text-interview-muted"
                            }`}
                          >
                            <span className={covered ? "text-interview-success" : "text-interview-border"}>
                              {covered ? "●" : "○"}
                            </span>
                            <span className="truncate capitalize">{topic.replace(/-/g, " ")}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Question Reasoning */}
                {thoughtProcess && (
                  <section>
                    <h3 className="text-xs font-semibold text-interview-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                      <svg className="w-3 h-3 text-interview-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Question Reasoning
                    </h3>
                    <div className="rounded-lg bg-interview-bg p-3 border border-interview-border/50">
                      <p className="text-xs text-interview-text leading-relaxed">{thoughtProcess}</p>
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
