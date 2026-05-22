import { create } from "zustand";
import { conductInterviewTurn, evaluateSession, saveSession } from "@/actions/interview";
import { debug } from "@/stores/debug";
import type { TranscriptEntry, LLMResponse, Evaluation } from "@/lib/types";

export type InterviewState =
  | "idle"
  | "listening"
  | "answered"
  | "thinking"
  | "speaking"
  | "evaluating"
  | "complete";

const MAX_QUESTIONS = 6;

interface InterviewStore {
  state: InterviewState;
  transcript: TranscriptEntry[];
  questionCount: number;
  lastResponse: LLMResponse | null;
  evaluation: Evaluation | null;
  sessionId: string | null;
  error: string | null;

  start: (jobId: string) => Promise<void>;
  setListeningState: () => void;
  submitAnswer: (jobId: string, text: string) => void;
  retryAnswer: () => void;
  advanceQuestion: (jobId: string) => Promise<void>;
  reset: () => void;
}

function setStateLog(store: InterviewStore, to: InterviewState) {
  const from = store.state;
  debug.interview("stateChange", { from, to });
  return to;
}

export const useInterviewStore = create<InterviewStore>((set, get) => ({
  state: "idle",
  transcript: [],
  questionCount: 0,
  lastResponse: null,
  evaluation: null,
  sessionId: null,
  error: null,

  start: async (jobId: string) => {
    debug.interview("start", { jobId });
    set({ state: setStateLog(get(), "thinking"), error: null });

    const initialHistory: TranscriptEntry[] = [
      {
        role: "interviewer",
        text: "Hello! I'll be conducting your interview today. Let's begin.",
      },
    ];

    set({ transcript: initialHistory, questionCount: 0 });

    const t0 = performance.now();
    const result = await conductInterviewTurn(jobId, initialHistory, 0);
    debug.llm("conductInterviewTurn", {
      durationMs: Math.round(performance.now() - t0),
      questionNumber: 1,
      hasError: !!result.error,
      hasResponse: !!result.response,
    });

    if (result.error || !result.response) {
      debug.interview("startFailed", { error: result.error });
      set({
        state: setStateLog(get(), "idle"),
        error: result.error ?? "No response from interviewer",
      });
      return;
    }

    const interviewerEntry: TranscriptEntry = {
      role: "interviewer",
      text: result.response.spoken_response,
    };
    const historyWithQuestion = [...initialHistory, interviewerEntry];

    debug.interview("firstQuestionReady", {
      spoken: result.response.spoken_response.slice(0, 80),
    });
    set({
      transcript: historyWithQuestion,
      lastResponse: result.response,
      state: setStateLog(get(), "speaking"),
    });
  },

  setListeningState: () => {
    debug.interview("setListeningState");
    set({ state: setStateLog(get(), "listening"), error: null });
  },

  submitAnswer: (jobId: string, text: string) => {
    const s = get();
    debug.interview("submitAnswer", {
      currentState: s.state,
      textLength: text.length,
      textPreview: text.slice(0, 60),
    });

    if (s.state !== "listening") {
      debug.interview("submitAnswerBlocked", {
        reason: `state is ${s.state}, expected listening`,
      });
      return;
    }

    set({ error: null });

    const candidateEntry: TranscriptEntry = { role: "candidate", text };
    const newHistory = [...s.transcript, candidateEntry];

    debug.interview("answerRecorded", {
      transcriptLength: newHistory.length,
    });

    set({
      transcript: newHistory,
      state: setStateLog(get(), "answered"),
    });
  },

  retryAnswer: () => {
    const s = get();
    debug.interview("retryAnswer", { state: s.state });

    if (s.state !== "answered") {
      debug.interview("retryAnswerBlocked", {
        reason: `state is ${s.state}, expected answered`,
      });
      return;
    }

    // Remove the last candidate entry
    const newTranscript = [...s.transcript];
    while (newTranscript.length > 0 && newTranscript[newTranscript.length - 1].role === "candidate") {
      newTranscript.pop();
    }

    debug.interview("retryAnswer:reverted", {
      oldLength: s.transcript.length,
      newLength: newTranscript.length,
    });

    set({
      transcript: newTranscript,
      state: setStateLog(get(), "listening"),
      error: null,
    });
  },

  advanceQuestion: async (jobId: string) => {
    const s = get();
    debug.interview("advanceQuestion", { state: s.state });

    if (s.state !== "answered") {
      debug.interview("advanceQuestionBlocked", {
        reason: `state is ${s.state}, expected answered`,
      });
      return;
    }

    set({ error: null });

    const newQCount = s.questionCount + 1;

    set({ questionCount: newQCount });

    if (newQCount >= MAX_QUESTIONS) {
      debug.interview("evaluating");
      set({ state: setStateLog(get(), "evaluating") });

      const t0 = performance.now();
      const evalResult = await evaluateSession(jobId, s.transcript);
      debug.llm("evaluateSession", {
        durationMs: Math.round(performance.now() - t0),
        hasError: !!evalResult.error,
        hasEvaluation: !!evalResult.evaluation,
      });

      if (evalResult.evaluation) {
        set({ evaluation: evalResult.evaluation });

        const saveResult = await saveSession(jobId, s.transcript, evalResult.evaluation);
        if (saveResult.sessionId) {
          debug.interview("sessionSaved", { sessionId: saveResult.sessionId });
          set({ sessionId: saveResult.sessionId });
        } else if (saveResult.error) {
          debug.interview("saveFailed", { error: saveResult.error });
          set({ error: saveResult.error });
        }
      } else {
        debug.interview("evaluationFailed", { error: evalResult.error });
        set({ error: evalResult.error ?? "Evaluation failed" });
      }
      set({ state: setStateLog(get(), "complete") });
    } else {
      debug.interview("askingNextQuestion", { nextQ: newQCount + 1 });
      set({ state: setStateLog(get(), "thinking") });

      const t0 = performance.now();
      const result = await conductInterviewTurn(jobId, s.transcript, newQCount);
      debug.llm("conductInterviewTurn", {
        durationMs: Math.round(performance.now() - t0),
        questionNumber: newQCount + 1,
        hasError: !!result.error,
        hasResponse: !!result.response,
      });

      if (result.error || !result.response) {
        debug.interview("questionFailed", { error: result.error });
        set({
          state: setStateLog(get(), "idle"),
          error: result.error ?? "No response from interviewer",
        });
        return;
      }

      const interviewerEntry: TranscriptEntry = {
        role: "interviewer",
        text: result.response.spoken_response,
      };
      const historyWithQuestion = [...s.transcript, interviewerEntry];

      set({
        transcript: historyWithQuestion,
        lastResponse: result.response,
        state: setStateLog(get(), "speaking"),
      });
    }
  },

  reset: () => {
    debug.interview("reset");
    set({
      state: "idle",
      transcript: [],
      questionCount: 0,
      lastResponse: null,
      evaluation: null,
      sessionId: null,
      error: null,
    });
  },
}));
