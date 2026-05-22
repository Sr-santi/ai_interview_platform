"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMediaRecorder } from "@/hooks/useMediaRecorder";
import { useTTS } from "@/hooks/useTTS";
import { useCamera } from "@/hooks/useCamera";
import { useInterviewStore } from "@/stores/interview";
import { debug } from "@/stores/debug";
import { DebugPanel } from "@/components/DebugPanel";
import { DecisionPanel } from "@/components/DecisionPanel";
import { transcribeAudio } from "@/actions/stt";
import type { Job } from "@/lib/types";

const MAX_QUESTIONS = 6;
const RECORDING_MAX_SECONDS = 90;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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
    <div className="flex-1 overflow-y-auto space-y-4 px-2 py-4" role="log" aria-live="polite" aria-label="Interview transcript">
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
      {evaluation.strengths.length > 0 && (
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
      )}
      {evaluation.concerns.length > 0 && (
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
      )}
    </div>
  );
}

// ── Main component ──

export function InterviewRoom({ job }: { job: Job }) {
  const recorder = useMediaRecorder();
  const tts = useTTS();
  const camera = useCamera();
  const interview = useInterviewStore();

  const availableTopics = useMemo(() => {
    if (!job.questionPack) return [];
    const topics: string[] = [];
    const pack = job.questionPack as { behavioral?: { category: string }[]; technical?: { category: string }[] };
    if (pack.behavioral) {
      for (const q of pack.behavioral) topics.push(q.category);
    }
    if (pack.technical) {
      for (const q of pack.technical) topics.push(q.category);
    }
    return topics;
  }, [job.questionPack]);

  const [transcribing, setTranscribing] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ttsEffectRunRef = useRef(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = camera.stream;
    }
  }, [camera.stream]);

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

  const handleTextSubmit = useCallback(() => {
    const text = textInput.trim();
    if (!text) return;
    debug.room("handleTextSubmit", { textLength: text.length });
    interview.submitAnswer(job.id, text);
    setTextInput("");
  }, [textInput, interview, job.id]);

  const handleRetry = useCallback(() => {
    debug.room("handleRetry");
    interview.retryAnswer();
  }, [interview]);

  const handleAdvance = useCallback(() => {
    debug.room("handleAdvance", { jobId: job.id });
    interview.advanceQuestion(job.id);
  }, [interview, job.id]);

  const handleStart = () => {
    debug.room("handleStart", { jobId: job.id });
    interview.start(job.id, job.maxDurationSeconds);
  };

  const handleRestart = () => {
    debug.room("handleRestart");
    interview.reset();
  };

  const isRecording = recorder.isRecording;
  const recRemaining = RECORDING_MAX_SECONDS - recorder.elapsedSeconds;

  // ── IDLE STATE ──
  if (interview.state === "idle") {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-3 sm:px-4">
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
              {MAX_QUESTIONS} questions. Record your answers or type them. You can retry before advancing.
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
        <div className="flex flex-col max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
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

  return (
    <>
      <div className="flex flex-col min-h-[calc(100dvh-3rem)] max-w-2xl mx-auto px-3 sm:px-4">
        {/* Progress */}
        <div className="py-2 sm:py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 sm:gap-0 border-b border-interview-border/50">
          <div className="flex items-center gap-4">
            <span className="text-xs text-interview-muted">
              Question {interview.questionCount + 1} of {MAX_QUESTIONS}
            </span>
            {interview.maxDurationSeconds != null && (
              <span
                className={`text-xs font-mono tabular-nums ${
                  interview.timerWarning === "critical"
                    ? "text-interview-danger animate-pulse"
                    : interview.timerWarning === "warning"
                      ? "text-interview-warning"
                      : "text-interview-muted"
                }`}
              >
                {formatTime(interview.elapsedSeconds)} / {formatTime(interview.maxDurationSeconds)}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {Array.from({ length: MAX_QUESTIONS }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i < interview.questionCount
                    ? "bg-interview-accent"
                    : i === interview.questionCount
                    ? interview.state === "listening"
                      ? "bg-interview-accent animate-pulse"
                      : interview.state === "answered"
                        ? "bg-interview-success"
                        : interview.state === "thinking" || interview.state === "speaking"
                          ? "bg-interview-accent animate-pulse"
                          : "bg-interview-border"
                    : "bg-interview-border"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Transcript — all Q&A visible here */}
        <TranscriptView entries={interview.transcript} />

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

        {/* Speaking — interviewer TTS is playing */}
        {interview.state === "speaking" && (
          <div className="px-2 pb-3 text-center text-xs text-interview-muted">
            {tts.isSpeaking ? "Interviewer is speaking..." : "Preparing next question..."}
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

        {/* ── STATE: LISTENING — user records or types ── */}
        {interview.state === "listening" && !transcribing && (
          <>
            {/* Recording indicator */}
            {isRecording && (
              <div className="px-2 pb-3">
                <div className="rounded-2xl px-4 py-2.5 text-sm bg-interview-accent/10 border border-interview-accent/20 text-interview-text min-h-[2.5rem]">
                  <div className="text-xs text-interview-accent mb-0.5 font-medium">
                    You (recording...)
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-interview-muted">Recording your answer</span>
                    <span
                      className={`text-xs font-mono tabular-nums ${
                        recRemaining <= 10
                          ? "text-interview-danger animate-pulse"
                          : recRemaining <= 25
                            ? "text-interview-warning"
                            : "text-interview-muted"
                      }`}
                    >
                      {formatTime(recorder.elapsedSeconds)} / {formatTime(RECORDING_MAX_SECONDS)}
                    </span>
                  </div>
                  {recorder.timeLimitReached && (
                    <div className="mt-1 text-xs text-interview-warning">
                      Time limit reached — processing your recording...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="py-4 border-t border-interview-border/50 flex items-center justify-center gap-4 sm:gap-6">
              <MicButton
                isActive={isRecording}
                onClick={handleMicToggle}
                disabled={false}
              />
              {!isRecording && (
                <>
                  <button
                    onClick={() => camera.isActive ? camera.stopCamera() : camera.startCamera()}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 border ${
                      camera.isActive
                        ? "bg-green-500/20 border-green-500/40 text-green-400"
                        : "bg-interview-surface border-interview-border hover:border-interview-accent/50 text-interview-muted"
                    }`}
                    aria-label={camera.isActive ? "Turn off camera" : "Turn on camera"}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                  <div className="text-xs text-interview-muted text-center max-w-[12rem]">
                    Tap to record your answer
                  </div>
                </>
              )}
            </div>

            {/* Text input */}
            {!isRecording && (
              <div className="pb-4 px-2">
                <div className="flex gap-2">
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleTextSubmit();
                      }
                    }}
                    placeholder="Or type your answer here..."
                    aria-label="Type your interview answer"
                    rows={2}
                    className="flex-1 resize-none rounded-xl px-3 py-2 text-sm bg-interview-surface border border-interview-border text-interview-text placeholder:text-interview-muted focus:border-interview-accent/50 focus:outline-none"
                  />
                  <button
                    onClick={handleTextSubmit}
                    disabled={!textInput.trim()}
                    className="shrink-0 px-4 py-2 bg-interview-surface border border-interview-border hover:border-interview-accent/50 text-interview-text rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── STATE: ANSWERED — retry or advance ── */}
        {interview.state === "answered" && (
          <div className="py-4 border-t border-interview-border/50">
            <div className="text-center mb-3">
              <div className="text-xs text-interview-success mb-1">
                Answer recorded
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={handleRetry}
                  className="px-5 py-2.5 border border-interview-danger/40 hover:border-interview-danger hover:bg-interview-danger/10 text-interview-danger rounded-xl text-sm font-medium transition-colors"
                >
                  Retry
                </button>
                <button
                  onClick={handleAdvance}
                  className="px-5 py-2.5 bg-interview-accent hover:bg-interview-accent-hover text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Next Question
                </button>
              </div>
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

      {camera.isActive && (
        <div className="fixed bottom-20 right-4 z-20 w-36 sm:w-48 rounded-xl overflow-hidden border-2 border-interview-accent/40 shadow-lg shadow-interview-accent/20 bg-interview-bg">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-auto block -scale-x-100"
          />
          <div className="absolute top-1.5 left-1.5">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/80 text-white">
              LIVE
            </span>
          </div>
          {camera.error && (
            <div className="absolute inset-0 flex items-center justify-center bg-interview-bg/80">
              <p className="text-[10px] text-interview-danger px-2 text-center">{camera.error}</p>
            </div>
          )}
        </div>
      )}

      <DecisionPanel
        thoughtProcess={interview.lastResponse?.thought_process}
        accumulatedSkills={interview.accumulatedSkills}
        coveredTopics={interview.coveredTopics}
        availableTopics={availableTopics}
        isOpen={panelOpen}
        onToggle={() => setPanelOpen(!panelOpen)}
      />
      <DebugPanel />
    </>
  );
}
