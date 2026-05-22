import { create } from "zustand";
import { conductInterviewTurn, evaluateSession, saveSession } from "@/actions/interview";
import { debug } from "@/stores/debug";
import type { TranscriptEntry, LLMResponse, Evaluation } from "@/lib/types";

export type InterviewState =
  | "idle"
  | "listening"
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
  submitAnswer: (jobId: string, text: string) => Promise<void>;
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

    set({
      transcript: initialHistory,
      questionCount: 0,
    });

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

    debug.interview("firstQuestionReady", {
      spoken: result.response.spoken_response.slice(0, 80),
    });
    set({
      lastResponse: result.response,
      state: setStateLog(get(), "speaking"),
    });
  },

  setListeningState: () => {
    debug.interview("setListeningState");
    set({ state: setStateLog(get(), "listening"), error: null });
  },

  submitAnswer: async (jobId: string, text: string) => {
    const s = get();
    debug.interview("submitAnswer", {
      currentState: s.state,
      textLength: text.length,
      textPreview: text.slice(0, 60),
    });

    if (s.state !== "listening" && s.state !== "speaking") {
      debug.interview("submitAnswerBlocked", {
        reason: `state is ${s.state}, expected listening or speaking`,
      });
      return;
    }

    set({ error: null });

    const candidateEntry: TranscriptEntry = { role: "candidate", text };
    const newHistory = [...s.transcript, candidateEntry];
    const newQCount = s.questionCount + 1;

    debug.interview("answerRecorded", {
      questionCount: newQCount,
      transcriptLength: newHistory.length,
    });

    set({ transcript: newHistory, questionCount: newQCount });

    if (newQCount >= MAX_QUESTIONS) {
      debug.interview("evaluating");
      set({ state: setStateLog(get(), "evaluating") });

      const t0 = performance.now();
      const evalResult = await evaluateSession(jobId, newHistory);
      debug.llm("evaluateSession", {
        durationMs: Math.round(performance.now() - t0),
        hasError: !!evalResult.error,
        hasEvaluation: !!evalResult.evaluation,
      });

      if (evalResult.evaluation) {
        set({ evaluation: evalResult.evaluation });

        const saveResult = await saveSession(jobId, newHistory, evalResult.evaluation);
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
      const result = await conductInterviewTurn(jobId, newHistory, newQCount);
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

      set({
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
