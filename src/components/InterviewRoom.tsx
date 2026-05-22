"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaRecorder } from "@/hooks/useMediaRecorder";
import { useTTS } from "@/hooks/useTTS";
import { useInterviewStore } from "@/stores/interview";
import { debug } from "@/stores/debug";
import { DebugPanel } from "@/components/DebugPanel";
import { transcribeAudio } from "@/actions/stt";
import type { Job } from "@/lib/types";

const MAX_QUESTIONS = 6;

// ── Sub-components ──

function MicButton({
  isActive,
  onClick,
  disabled,
}: {
  isActive: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
        isActive
          ? "bg-interview-danger animate-pulse shadow-lg shadow-red-500/40"
          : "bg-interview-accent hover:bg-interview-accent-hover shadow-lg shadow-indigo-500/30"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
      aria-label={isActive ? "Stop recording" : "Start recording"}
    >
      <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
        />
      </svg>
    </button>
  );
}

function TranscriptView({ entries }: { entries: { role: string; text: string }[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);
  if (entries.length === 0) return null;
  return (
    <div className="flex-1 overflow-y-auto space-y-4 px-2 py-4">
      {entries.map((entry, i) => (
        <div key={i} className={`flex ${entry.role === "candidate" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              entry.role === "candidate"
                ? "bg-interview-accent/20 text-interview-text border border-interview-accent/30"
                : "bg-interview-surface text-interview-text border border-interview-border"
            }`}
          >
            <div className="text-xs text-interview-muted mb-0.5 font-medium">
              {entry.role === "candidate" ? "You" : "Interviewer"}
            </div>
            {entry.text}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function EvaluationView({
  evaluation,
}: {
  evaluation: { strengths: string[]; concerns: string[]; score: number };
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-5xl font-bold text-interview-accent">{evaluation.score}</div>
        <div className="text-sm text-interview-muted mt-1">Overall Score</div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-interview-success mb-2">Strengths</h3>
        <ul className="space-y-1.5">
          {evaluation.strengths.map((s, i) => (
            <li key={i} className="text-sm text-interview-text flex items-start gap-2">
              <span className="text-interview-success mt-0.5">+</span>
              {s}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-interview-warning mb-2">Areas for Growth</h3>
        <ul className="space-y-1.5">
          {evaluation.concerns.map((c, i) => (
            <li key={i} className="text-sm text-interview-text flex items-start gap-2">
              <span className="text-interview-warning mt-0.5">!</span>
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Main component ──

export function InterviewRoom({ job }: { job: Job }) {
  const recorder = useMediaRecorder();
  const tts = useTTS();
  const interview = useInterviewStore();

  const [transcribing, setTranscribing] = useState(false);
  const ttsEffectRunRef = useRef(false);

  // ── Orchestration: TTS → listening ──
  useEffect(() => {
    if (interview.state !== "speaking" || !interview.lastResponse) return;
    if (ttsEffectRunRef.current) return;
    ttsEffectRunRef.current = true;

    let cancelled = false;

    const run = async () => {
      debug.room("ttsFlow:speak", {
        textLength: interview.lastResponse!.spoken_response.length,
        ttsSupported: tts.isSupported,
      });

      if (tts.isSupported) {
        await tts.speak(interview.lastResponse!.spoken_response);
      }

      if (cancelled) {
        debug.room("ttsFlow:cancelled");
        return;
      }

      interview.setListeningState();
      debug.room("ttsFlow:transitionToListening");
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [interview.state, interview.lastResponse]);

  useEffect(() => {
    if (interview.state !== "speaking") {
      ttsEffectRunRef.current = false;
    }
  }, [interview.state]);

  // ── Handlers ──

  const handleMicToggle = useCallback(async () => {
    debug.room("handleMicToggle", { isRecording: recorder.isRecording });

    if (recorder.isRecording) {
      debug.room("handleMicToggle:stop");
      const blob = await recorder.stopRecording();
      if (!blob) {
        debug.room("handleMicToggle:noBlob");
        return;
      }

      setTranscribing(true);
      debug.room("handleMicToggle:transcribing", { blobSize: blob.size });

      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");

      const result = await transcribeAudio(formData);
      setTranscribing(false);

      if (result.error) {
        debug.room("handleMicToggle:transcribeError", { error: result.error });
        return;
      }

      const text = result.text;
      if (text) {
        debug.room("handleMicToggle:submit", {
          textLength: text.length,
          textPreview: text.slice(0, 60),
        });
        interview.submitAnswer(job.id, text);
      } else {
        debug.room("handleMicToggle:emptyTranscription");
      }
    } else {
      debug.room("handleMicToggle:start");
      recorder.startRecording();
    }
  }, [recorder, interview, job.id]);

  const handleTextSubmit = useCallback(
    (text: string) => {
      debug.room("handleTextSubmit", { textLength: text.length });
      interview.submitAnswer(job.id, text);
    },
    [interview, job.id]
  );

  const handleStart = () => {
    debug.room("handleStart", { jobId: job.id });
    interview.start(job.id);
  };

  const handleRestart = () => {
    debug.room("handleRestart");
    interview.reset();
  };

  const canInteract =
    interview.state === "listening" || interview.state === "speaking";

  // ── IDLE STATE ──
  if (interview.state === "idle") {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="rounded-xl border border-interview-border bg-interview-surface p-8 text-center max-w-md w-full">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-interview-accent/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-interview-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-interview-text mb-2">
              Ready for your {job.title} interview?
            </h2>
            <p className="text-interview-muted text-sm mb-6">
              {MAX_QUESTIONS} questions. Record your answers or type them. The AI adapts based on what you say.
            </p>
            {!recorder.isSupported && recorder.error && (
              <div className="mb-4 text-xs text-interview-warning bg-interview-warning/10 rounded-lg px-3 py-2">
                {recorder.error}
              </div>
            )}
            <button
              onClick={handleStart}
              className="mt-4 px-8 py-3 bg-interview-accent hover:bg-interview-accent-hover text-white rounded-xl font-medium transition-colors"
            >
              Start Interview
            </button>
          </div>
        </div>
        <DebugPanel />
      </>
    );
  }

  // ── COMPLETE STATE ──
  if (interview.state === "complete") {
    return (
      <>
        <div className="flex flex-col max-w-2xl mx-auto px-4 py-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-interview-text">Interview Complete</h2>
            <p className="text-interview-muted text-sm mt-1">
              {job.title} — {MAX_QUESTIONS} questions answered
            </p>
          </div>
          <div className="rounded-xl border border-interview-border bg-interview-surface p-6">
            <h3 className="text-sm font-semibold text-interview-text mb-4">Transcript</h3>
            <TranscriptView entries={interview.transcript} />
            {interview.evaluation && (
              <div className="mt-6 pt-6 border-t border-interview-border">
                <h3 className="text-sm font-semibold text-interview-text mb-4">Evaluation</h3>
                <EvaluationView evaluation={interview.evaluation} />
              </div>
            )}
          </div>
          {interview.error && (
            <div className="mt-4 p-3 rounded-lg bg-interview-danger/10 border border-interview-danger/30 text-sm text-interview-danger">
              {interview.error}
            </div>
          )}
          <button
            onClick={handleRestart}
            className="mt-6 px-6 py-2.5 bg-interview-surface border border-interview-border hover:border-interview-accent/50 text-interview-text rounded-xl font-medium transition-colors"
          >
            Try Another Interview
          </button>
        </div>
        <DebugPanel />
      </>
    );
  }

  // ── ACTIVE INTERVIEW ──
  const lastSpokenResponse = interview.lastResponse?.spoken_response ?? "";

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-3rem)] max-w-2xl mx-auto px-4">
        {/* Progress */}
        <div className="py-3 flex items-center justify-between border-b border-interview-border/50">
          <div className="text-xs text-interview-muted">
            Question {interview.questionCount + 1} of {MAX_QUESTIONS}
          </div>
          <div className="flex gap-1">
            {Array.from({ length: MAX_QUESTIONS }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i < interview.questionCount
                    ? "bg-interview-accent"
                    : i === interview.questionCount
                    ? interview.state === "thinking" || interview.state === "speaking"
                      ? "bg-interview-accent animate-pulse"
                      : "bg-interview-border"
                    : "bg-interview-border"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Transcript */}
        <TranscriptView entries={interview.transcript} />

        {/* AI speaking */}
        {interview.state === "speaking" && lastSpokenResponse && (
          <div className="px-2 pb-3">
            <div className="rounded-2xl px-4 py-2.5 text-sm bg-interview-surface border border-interview-accent/30 text-interview-text">
              <div className="text-xs text-interview-accent mb-0.5 font-medium">
                Interviewer {tts.isSpeaking ? "(speaking...)" : ""}
              </div>
              {lastSpokenResponse}
            </div>
          </div>
        )}

        {/* Thinking */}
        {interview.state === "thinking" && (
          <div className="px-2 pb-3">
            <div className="rounded-2xl px-4 py-2.5 text-sm bg-interview-surface border border-interview-border text-interview-muted">
              <div className="flex items-center gap-2">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-interview-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-interview-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-interview-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
                Thinking...
              </div>
            </div>
          </div>
        )}

        {/* Evaluating */}
        {interview.state === "evaluating" && (
          <div className="px-2 pb-3 text-center text-sm text-interview-muted">
            Evaluating your responses...
          </div>
        )}

        {/* Transcribing indicator */}
        {transcribing && (
          <div className="px-2 pb-3">
            <div className="rounded-2xl px-4 py-2.5 text-sm bg-interview-surface border border-interview-accent/30 text-interview-text">
              <div className="flex items-center gap-2">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-interview-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-interview-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-interview-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
                Transcribing...
              </div>
            </div>
          </div>
        )}

        {/* Recording indicator */}
        {recorder.isRecording && (
          <div className="px-2 pb-3">
            <div className="rounded-2xl px-4 py-2.5 text-sm bg-interview-accent/10 border border-interview-accent/20 text-interview-text min-h-[2.5rem]">
              <div className="text-xs text-interview-accent mb-0.5 font-medium">You (recording...)</div>
              <span className="text-interview-muted">Recording your answer — click the mic when done</span>
            </div>
          </div>
        )}

        {/* Controls */}
        {canInteract && !transcribing && (
          <div className="py-4 border-t border-interview-border/50 flex items-center justify-center gap-6">
            <MicButton
              isActive={recorder.isRecording}
              onClick={handleMicToggle}
              disabled={
                interview.state === "thinking" ||
                interview.state === "evaluating"
              }
            />
            {!recorder.isRecording && (
              <div className="text-xs text-interview-muted text-center max-w-[12rem]">
                {interview.state === "speaking"
                  ? "Waiting for interviewer to finish..."
                  : "Tap to record your answer"}
              </div>
            )}
          </div>
        )}

        {/* Text input fallback — always available in listening state */}
        {canInteract && !recorder.isRecording && !transcribing && (
          <div className="pb-4 px-2">
            <div className="flex gap-2">
              <textarea
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const text = (e.target as HTMLTextAreaElement).value.trim();
                    if (text) {
                      handleTextSubmit(text);
                      (e.target as HTMLTextAreaElement).value = "";
                    }
                  }
                }}
                placeholder="Or type your answer here..."
                disabled={
                  interview.state === "thinking" ||
                  interview.state === "evaluating"
                }
                rows={2}
                className="flex-1 resize-none rounded-xl px-3 py-2 text-sm bg-interview-surface border border-interview-border text-interview-text placeholder:text-interview-muted focus:border-interview-accent/50 focus:outline-none disabled:opacity-40"
              />
              <button
                onClick={(e) => {
                  const textarea = (
                    e.currentTarget.parentElement as HTMLDivElement
                  ).querySelector("textarea") as HTMLTextAreaElement;
                  const text = textarea?.value.trim();
                  if (text) {
                    handleTextSubmit(text);
                    textarea.value = "";
                  }
                }}
                disabled={
                  interview.state === "thinking" ||
                  interview.state === "evaluating"
                }
                className="shrink-0 px-4 py-2 bg-interview-surface border border-interview-border hover:border-interview-accent/50 text-interview-text rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* Errors */}
        {recorder.error && (
          <div className="pb-2 text-center text-xs text-interview-warning leading-relaxed max-w-lg mx-auto">
            {recorder.error}
          </div>
        )}
        {interview.error && (
          <div className="pb-2 text-center text-xs text-interview-danger">
            {interview.error}
          </div>
        )}
      </div>

      <DebugPanel />
    </>
  );
}
