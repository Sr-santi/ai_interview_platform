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

export type TimerWarning = "normal" | "warning" | "critical";

const MAX_QUESTIONS = 6;
const WARNING_THRESHOLD = 0.8; // 80% of max duration
const CRITICAL_THRESHOLD = 0.95; // 95% of max duration

interface InterviewStore {
  state: InterviewState;
  transcript: TranscriptEntry[];
  questionCount: number;
  lastResponse: LLMResponse | null;
  evaluation: Evaluation | null;
  sessionId: string | null;
  error: string | null;

  // Decision panel tracking
  accumulatedSkills: string[];
  coveredTopics: string[];
  availableTopics: string[];

  // Session timer
  elapsedSeconds: number;
  maxDurationSeconds: number | null;
  timerWarning: TimerWarning;

  start: (jobId: string, maxDurationSeconds: number | null) => Promise<void>;
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

let timerInterval: ReturnType<typeof setInterval> | null = null;

function startTimerInStore() {
  stopTimerInStore();
  timerInterval = setInterval(() => {
    const state = useInterviewStore.getState();
    const newElapsed = state.elapsedSeconds + 1;

    const warning: TimerWarning =
      state.maxDurationSeconds != null
        ? newElapsed >= state.maxDurationSeconds * CRITICAL_THRESHOLD
          ? "critical"
          : newElapsed >= state.maxDurationSeconds * WARNING_THRESHOLD
            ? "warning"
            : "normal"
        : "normal";

    useInterviewStore.setState({
      elapsedSeconds: newElapsed,
      timerWarning: warning,
    });

    // Log at thresholds
    if (
      state.maxDurationSeconds != null &&
      (newElapsed === Math.ceil(state.maxDurationSeconds * WARNING_THRESHOLD) ||
        newElapsed === Math.ceil(state.maxDurationSeconds * CRITICAL_THRESHOLD))
    ) {
      debug.interview("timerWarning", {
        elapsed: newElapsed,
        max: state.maxDurationSeconds,
        warning,
        percent: Math.round((newElapsed / state.maxDurationSeconds) * 100),
      });
    }
  }, 1000);
}

function stopTimerInStore() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

export const useInterviewStore = create<InterviewStore>((set, get) => ({
  state: "idle",
  transcript: [],
  questionCount: 0,
  lastResponse: null,
  evaluation: null,
  sessionId: null,
  error: null,

  accumulatedSkills: [],
  coveredTopics: [],
  availableTopics: [],

  elapsedSeconds: 0,
  maxDurationSeconds: null,
  timerWarning: "normal",

  start: async (jobId: string, maxDurationSeconds: number | null) => {
    debug.interview("start", { jobId, maxDurationSeconds });
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
      elapsedSeconds: 0,
      maxDurationSeconds,
      timerWarning: "normal",
      lastResponse: null,
      evaluation: null,
      sessionId: null,
      accumulatedSkills: [],
      coveredTopics: [],
    });

    // Start the session timer
    startTimerInStore();

    const t0 = performance.now();
    const result = await conductInterviewTurn(jobId, initialHistory, 0, []);
    debug.llm("conductInterviewTurn", {
      durationMs: Math.round(performance.now() - t0),
      questionNumber: 1,
      hasError: !!result.error,
      hasResponse: !!result.response,
    });

    if (result.error || !result.response) {
      debug.interview("startFailed", { error: result.error });
      stopTimerInStore();
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

    const newSkills = result.response.skills_detected.map((s) => s.toLowerCase().trim());
    const accumulatedSkills = [...new Set(newSkills)];
    const coveredTopics = result.response.category ? [result.response.category] : [];

    debug.interview("firstQuestionReady", {
      spoken: result.response.spoken_response.slice(0, 80),
      category: result.response.category,
      skills: accumulatedSkills,
    });
    set({
      transcript: historyWithQuestion,
      lastResponse: result.response,
      accumulatedSkills,
      coveredTopics,
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

    set({ transcript: newHistory, state: setStateLog(get(), "answered") });
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
        set({ error: evalResult.error ?? "Evaluation failed", evaluation: null });
      }

      stopTimerInStore();
      set({ state: setStateLog(get(), "complete") });
    } else {
      debug.interview("askingNextQuestion", { nextQ: newQCount + 1 });
      set({ state: setStateLog(get(), "thinking") });

      const t0 = performance.now();
      const result = await conductInterviewTurn(jobId, s.transcript, newQCount, s.coveredTopics);
      debug.llm("conductInterviewTurn", {
        durationMs: Math.round(performance.now() - t0),
        questionNumber: newQCount + 1,
        hasError: !!result.error,
        hasResponse: !!result.response,
      });

      if (result.error || !result.response) {
        debug.interview("questionFailed", { error: result.error });
        set({
          state: setStateLog(get(), "answered"),
          error: result.error ?? "No response from interviewer",
        });
        return;
      }

      const interviewerEntry: TranscriptEntry = {
        role: "interviewer",
        text: result.response.spoken_response,
      };
      const historyWithQuestion = [...s.transcript, interviewerEntry];

      const newSkills = result.response.skills_detected.map((s) => s.toLowerCase().trim());
      const mergedSkills = [...new Set([...s.accumulatedSkills, ...newSkills])];
      const mergedTopics = result.response.category
        ? [...new Set([...s.coveredTopics, result.response.category])]
        : s.coveredTopics;

      set({
        transcript: historyWithQuestion,
        lastResponse: result.response,
        accumulatedSkills: mergedSkills,
        coveredTopics: mergedTopics,
        state: setStateLog(get(), "speaking"),
      });
    }
  },

  reset: () => {
    debug.interview("reset");
    stopTimerInStore();
    set({
      state: "idle",
      transcript: [],
      questionCount: 0,
      lastResponse: null,
      evaluation: null,
      sessionId: null,
      error: null,
      accumulatedSkills: [],
      coveredTopics: [],
      availableTopics: [],
      elapsedSeconds: 0,
      maxDurationSeconds: null,
      timerWarning: "normal",
    });
  },
}));
