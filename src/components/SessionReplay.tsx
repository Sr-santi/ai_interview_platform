"use client";

import { useTTS } from "@/hooks/useTTS";
import type { TranscriptEntry, Evaluation } from "@/lib/types";

interface SessionReplayProps {
  transcript: TranscriptEntry[];
  evaluation: Evaluation | null;
  jobTitle: string;
  createdAt: string;
}

function computeMetrics(transcript: TranscriptEntry[]) {
  const entries = transcript.filter((e) => e.role === "interviewer" || e.role === "candidate");
  let interviewerWords = 0;
  let candidateWords = 0;
  let questionCount = 0;

  for (const entry of entries) {
    const words = entry.text.split(/\s+/).filter(Boolean).length;
    if (entry.role === "interviewer") {
      interviewerWords += words;
      questionCount++;
    } else {
      candidateWords += words;
    }
  }

  return {
    totalTurns: entries.length,
    questionCount: Math.ceil(questionCount / 2), // each Q/A is 2 turns
    totalWords: interviewerWords + candidateWords,
    interviewerWords,
    candidateWords,
    talkRatio: interviewerWords + candidateWords > 0
      ? Math.round((candidateWords / (interviewerWords + candidateWords)) * 100)
      : 0,
  };
}

export function SessionReplay({ transcript, evaluation, jobTitle, createdAt }: SessionReplayProps) {
  const tts = useTTS();
  const metrics = computeMetrics(transcript);
  const date = new Date(createdAt);

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-interview-text">{jobTitle} Interview</h1>
          <p className="text-sm text-interview-muted mt-0.5">
            {date.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
        <a
          href="/sessions"
          className="text-sm text-interview-muted hover:text-interview-text transition-colors"
        >
          &larr; All sessions
        </a>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-lg bg-interview-surface border border-interview-border p-3 text-center">
          <div className="text-lg font-bold text-interview-text">{metrics.questionCount}</div>
          <div className="text-[10px] text-interview-muted uppercase tracking-wider">Questions</div>
        </div>
        <div className="rounded-lg bg-interview-surface border border-interview-border p-3 text-center">
          <div className="text-lg font-bold text-interview-text">{metrics.totalTurns}</div>
          <div className="text-[10px] text-interview-muted uppercase tracking-wider">Turns</div>
        </div>
        <div className="rounded-lg bg-interview-surface border border-interview-border p-3 text-center">
          <div className="text-lg font-bold text-interview-text">{metrics.totalWords}</div>
          <div className="text-[10px] text-interview-muted uppercase tracking-wider">Words</div>
        </div>
        <div className="rounded-lg bg-interview-surface border border-interview-border p-3 text-center">
          <div className="text-lg font-bold text-interview-accent">{metrics.talkRatio}%</div>
          <div className="text-[10px] text-interview-muted uppercase tracking-wider">You Talked</div>
        </div>
      </div>

      {/* Evaluation */}
      {evaluation && (
        <div className="rounded-xl border border-interview-border bg-interview-surface p-5 mb-6">
          <h2 className="text-sm font-semibold text-interview-text mb-3">Evaluation</h2>
          <div className="text-center mb-4">
            <div className="text-4xl font-bold text-interview-accent">{evaluation.score}</div>
            <div className="text-xs text-interview-muted">Overall Score</div>
          </div>
          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-semibold text-interview-success mb-2">Strengths</h3>
              <ul className="space-y-1">
                {evaluation.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-interview-text flex items-start gap-2">
                    <span className="text-interview-success mt-0.5">+</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-interview-warning mb-2">Areas for Growth</h3>
              <ul className="space-y-1">
                {evaluation.concerns.map((c, i) => (
                  <li key={i} className="text-sm text-interview-text flex items-start gap-2">
                    <span className="text-interview-warning mt-0.5">!</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Transcript */}
      <div className="rounded-xl border border-interview-border bg-interview-surface p-5">
        <h2 className="text-sm font-semibold text-interview-text mb-3">Transcript</h2>
        <div className="space-y-3">
          {transcript.map((entry, i) => (
            <div key={i} className={`flex ${entry.role === "candidate" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  entry.role === "candidate"
                    ? "bg-interview-accent/20 text-interview-text border border-interview-accent/30"
                    : "bg-interview-bg text-interview-text border border-interview-border"
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs text-interview-muted font-medium">
                    {entry.role === "candidate" ? "You" : "Interviewer"}
                  </span>
                  {entry.role === "interviewer" && tts.isSupported && (
                    <button
                      onClick={() => tts.speak(entry.text)}
                      className="text-interview-accent hover:text-interview-accent-hover transition-colors"
                      aria-label="Play interviewer question"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                {entry.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
