"use server";

import { openrouter, INTERVIEW_MODEL } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import type { TranscriptEntry, LLMResponse, Evaluation } from "@/lib/types";
import type { Prisma } from "@prisma/client";

const MAX_QUESTIONS = 6;

function buildInterviewPrompt(
  systemPrompt: string,
  history: TranscriptEntry[],
  questionCount: number
): string {
  const remaining = MAX_QUESTIONS - questionCount;

  let historyBlock = "";
  if (history.length > 0) {
    historyBlock = "Conversation so far:\n";
    for (const entry of history) {
      historyBlock += `${entry.role}: ${entry.text}\n`;
    }
  }

  const isFinalQuestion = remaining === 1;
  const needsFollowUp =
    questionCount >= 3 &&
    history.filter((e) => e.role === "interviewer").length -
      history.filter((e) => e.role === "candidate").length <=
      1;

  return `You are conducting an AI voice interview.

${systemPrompt}

${historyBlock}

Current state: Question ${questionCount}/${MAX_QUESTIONS}. ${remaining} question(s) remaining.
${isFinalQuestion ? "THIS IS THE FINAL QUESTION. Tell the candidate this is the last question." : ""}
${needsFollowUp ? "The next question MUST be a follow-up that references the candidate's last answer." : "Ask a new core question. You may ask a natural follow-up if the candidate's answer warrants it."}

Ask exactly ONE question. Be conversational - under 30 words.

You MUST respond with ONLY a raw JSON object (no markdown, no code fences):
{
  "thought_process": "why you chose this question",
  "skills_detected": ["skill identifiers"],
  "spoken_response": "the question text to speak"
}`;
}

function parseLLMResponse(raw: string): LLMResponse | null {
  let text = raw.trim();

  // Strip markdown code fences if present
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  // Try to find a JSON object in the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (
      typeof parsed.thought_process === "string" &&
      Array.isArray(parsed.skills_detected) &&
      typeof parsed.spoken_response === "string"
    ) {
      return {
        thought_process: parsed.thought_process,
        skills_detected: parsed.skills_detected.map(String),
        spoken_response: parsed.spoken_response,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function conductInterviewTurn(
  jobId: string,
  history: TranscriptEntry[],
  questionCount: number
): Promise<{ response: LLMResponse | null; error?: string }> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return { response: null, error: "Job not found" };

  const prompt = buildInterviewPrompt(
    job.systemPrompt,
    history,
    questionCount + 1
  );

  try {
    const completion = await openrouter.chat.completions.create({
      model: INTERVIEW_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 300,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return { response: null, error: "Empty LLM response" };

    const parsed = parseLLMResponse(raw);
    if (!parsed) {
      return { response: null, error: `Failed to parse LLM response: ${raw.slice(0, 200)}` };
    }

    return { response: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { response: null, error: `OpenRouter error: ${message}` };
  }
}

export async function evaluateSession(
  jobId: string,
  transcript: TranscriptEntry[]
): Promise<{ evaluation: Evaluation | null; error?: string }> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return { evaluation: null, error: "Job not found" };

  let transcriptBlock = "";
  for (const entry of transcript) {
    transcriptBlock += `${entry.role}: ${entry.text}\n`;
  }

  const prompt = `You are evaluating a job interview for the role: ${job.title}.

${job.systemPrompt.slice(0, 300)}

Full interview transcript:
${transcriptBlock}

Provide a structured evaluation. Respond with ONLY a raw JSON object (no markdown, no code fences):
{
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "concerns": ["concern 1", "concern 2"],
  "score": 75
}

Score is 0-100. Be honest and specific.`;

  try {
    const completion = await openrouter.chat.completions.create({
      model: INTERVIEW_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 400,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return { evaluation: null, error: "Empty evaluation response" };

    let text = raw.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { evaluation: null, error: "No JSON found in evaluation" };

    const parsed = JSON.parse(jsonMatch[0]);
    if (
      Array.isArray(parsed.strengths) &&
      Array.isArray(parsed.concerns) &&
      typeof parsed.score === "number"
    ) {
      return {
        evaluation: {
          strengths: parsed.strengths.map(String),
          concerns: parsed.concerns.map(String),
          score: parsed.score,
        },
      };
    }

    return { evaluation: null, error: "Invalid evaluation format" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { evaluation: null, error: `Evaluation error: ${message}` };
  }
}

export async function saveSession(
  jobId: string,
  transcript: TranscriptEntry[],
  evaluation: Evaluation
): Promise<{ sessionId: string | null; error?: string }> {
  try {
    const session = await prisma.session.create({
      data: {
        jobId,
        transcript: transcript as unknown as Prisma.InputJsonValue,
        evaluation: evaluation as unknown as Prisma.InputJsonValue,
      },
    });
    return { sessionId: session.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { sessionId: null, error: `Save error: ${message}` };
  }
}
