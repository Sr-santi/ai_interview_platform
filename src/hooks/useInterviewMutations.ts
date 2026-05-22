"use client";

import { useMutation } from "@tanstack/react-query";
import { conductInterviewTurn, evaluateSession, saveSession } from "@/actions/interview";
import { debug } from "@/stores/debug";
import type { TranscriptEntry, Evaluation } from "@/lib/types";

export function useInterviewTurnMutation() {
  return useMutation({
    mutationFn: async ({
      jobId,
      history,
      questionCount,
    }: {
      jobId: string;
      history: TranscriptEntry[];
      questionCount: number;
    }) => {
      const t0 = performance.now();
      const result = await conductInterviewTurn(jobId, history, questionCount);
      debug.llm("mutation:interviewTurn", {
        durationMs: Math.round(performance.now() - t0),
        hasError: !!result.error,
      });
      if (result.error) throw new Error(result.error);
      if (!result.response) throw new Error("Empty response");
      return result.response;
    },
  });
}

export function useEvaluationMutation() {
  return useMutation({
    mutationFn: async ({
      jobId,
      transcript,
    }: {
      jobId: string;
      transcript: TranscriptEntry[];
    }) => {
      const t0 = performance.now();
      const result = await evaluateSession(jobId, transcript);
      debug.llm("mutation:evaluate", {
        durationMs: Math.round(performance.now() - t0),
        hasError: !!result.error,
      });
      if (result.error) throw new Error(result.error);
      if (!result.evaluation) throw new Error("Empty evaluation");
      return result.evaluation;
    },
  });
}

export function useSaveSessionMutation() {
  return useMutation({
    mutationFn: async ({
      jobId,
      transcript,
      evaluation,
    }: {
      jobId: string;
      transcript: TranscriptEntry[];
      evaluation: Evaluation;
    }) => {
      const result = await saveSession(jobId, transcript, evaluation);
      debug.llm("mutation:saveSession", { hasError: !!result.error });
      if (result.error) throw new Error(result.error);
      return result.sessionId;
    },
  });
}
