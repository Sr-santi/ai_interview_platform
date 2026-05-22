"use server";

import { openrouter, INTERVIEW_MODEL } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import type { TranscriptEntry, LLMResponse, Evaluation } from "@/lib/types";
import type { Prisma } from "@prisma/client";

const MAX_QUESTIONS = 6;

function salvageJson(text: string): string | null {
  const standardMatch = text.match(/\{[\s\S]*\}/);
  if (standardMatch) return standardMatch[0];

  const salvageAttempts = ['"]}', '"]}]', '"]}'];
  for (const suffix of salvageAttempts) {
    try {
      const closed = text + suffix;
      const match = closed.match(/\{[\s\S]*\}/);
      if (match) {
        JSON.parse(match[0]); // validate
        return match[0];
      }
    } catch {
      // continue to next attempt
    }
  }

  return null;
}

function buildInterviewPrompt(
  systemPrompt: string,
  history: TranscriptEntry[],
  questionCount: number,
  questionPack?: unknown,
  coveredTopics?: string[]
): string {
  const remaining = MAX_QUESTIONS - questionCount;

  let historyBlock = "";
  if (history.length > 0) {
    historyBlock = "Conversation so far:\n";
    for (const entry of history) {
      historyBlock += `${entry.role}: ${entry.text}\n`;
    }
  }

  let questionPackBlock = "";
  if (questionPack) {
    questionPackBlock = `\nAvailable question pack:\n${JSON.stringify(questionPack, null, 2)}\n\nUse these questions as your primary source. You may adapt wording slightly for flow.`;
  }

  let coveredBlock = "";
  if (coveredTopics && coveredTopics.length > 0) {
    coveredBlock = `\nTopics already covered: ${coveredTopics.join(", ")}. Avoid repeating these categories.`;
  }

  const isFinalQuestion = remaining === 1;
  const needsFollowUp =
    questionCount >= 3 &&
    history.filter((e) => e.role === "interviewer").length -
      history.filter((e) => e.role === "candidate").length <=
       1;

  return `You are conducting an AI voice interview.

${systemPrompt}
${questionPackBlock}
${coveredBlock}

${historyBlock}

Current state: Question ${questionCount}/${MAX_QUESTIONS}. ${remaining} question(s) remaining.
${isFinalQuestion ? "THIS IS THE FINAL QUESTION. Tell the candidate this is the last question." : ""}
${needsFollowUp ? "The next question MUST be a follow-up that references the candidate's last answer." : "Ask a new core question. You may ask a natural follow-up if the candidate's answer warrants it."}

Ask exactly ONE question. Be conversational - under 30 words.
You have access to voice expression tags: <laugh>, <breath>, <sigh>.
Sprinkle these tags naturally into your spoken_response (max 1-2 per turn) to sound human.

You MUST respond with ONLY a raw JSON object (no markdown, no code fences):
{
  "thought_process": "why you chose this question",
  "skills_detected": ["skill identifiers from the candidate's answer"],
  "category": "the category name from the question pack you selected",
  "spoken_response": "the question text to speak"
}`;
}

function parseLLMResponse(raw: string): LLMResponse | null {
  let text = raw.trim();

  // Strip markdown code fences if present
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  const jsonStr = salvageJson(text);
  if (!jsonStr) {
    // Last resort: extract spoken_response via regex
    const spokenMatch = text.match(/"spoken_response"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (spokenMatch) {
      const spokenResponse = spokenMatch[1].replace(/\\(.)/g, "$1");
      if (spokenResponse.trim()) {
        return {
          thought_process: "Fallback: extracted from truncated response",
          skills_detected: [],
          spoken_response: spokenResponse.trim(),
        };
      }
    }
    return null;
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (
      typeof parsed.thought_process === "string" &&
      Array.isArray(parsed.skills_detected) &&
      typeof parsed.spoken_response === "string"
    ) {
      return {
        thought_process: parsed.thought_process,
        skills_detected: parsed.skills_detected.map(String),
        spoken_response: parsed.spoken_response,
        category: typeof parsed.category === "string" ? parsed.category : undefined,
      };
    }
  } catch {
    // JSON parse failed, return null
  }

  return null;
}

export async function conductInterviewTurn(
  jobId: string,
  history: TranscriptEntry[],
  questionCount: number,
  coveredTopics?: string[]
): Promise<{ response: LLMResponse | null; error?: string }> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return { response: null, error: "Job not found" };

  const prompt = buildInterviewPrompt(
    job.systemPrompt,
    history,
    questionCount + 1,
    job.questionPack as Record<string, unknown> | undefined,
    coveredTopics
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const completion = await openrouter.chat.completions.create(
      {
        model: INTERVIEW_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 500,
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return { response: null, error: "Empty LLM response" };

    const parsed = parseLLMResponse(raw);
    if (!parsed) {
      return { response: null, error: `Failed to parse LLM response: ${raw.slice(0, 200)}` };
    }

    return { response: parsed };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException || (err instanceof Error && err.name === "AbortError")) {
      return { response: null, error: "OpenRouter request timed out (30s)" };
    }
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

CRITICAL INSTRUCTIONS:
Do NOT fabricate strengths. If the candidate gave non-answers, refused to engage, 
or was unprofessional, set "strengths" to an empty array [].
Do NOT interpret trolling, dismissive responses, or "I don't know" as a positive trait.

Score interpretation — be strict and anchor to this scale:
- 0-15: Non-engagement. Candidate refuses to answer, gives nonsense responses 
  (e.g., "pranked", "give me the job", "who knows"), or is unprofessional.
- 16-30: Minimal. Vague one-liners with no frameworks, examples, or depth.
- 31-50: Basic. Some relevant knowledge but lacks specifics, structure, or clear communication.
- 51-75: Solid. Demonstrates frameworks, concrete examples, and structured thinking.
- 76-100: Excellent. Deep domain expertise, clear communication, nuanced reasoning, 
  and strong problem-solving approach.

Scoring dimensions (weighted equally, 0-25 points each):
1. Technical/domain knowledge — does the candidate demonstrate relevant expertise?
2. Communication clarity — are answers well-structured and articulate?
3. Examples & frameworks — does the candidate use specific cases or established methodologies?
4. Problem-solving approach — does the candidate show analytical thinking?

Total score must reflect the sum across all 4 dimensions.

Respond with ONLY a raw JSON object (no markdown, no code fences):
{
  "strengths": [],
  "concerns": [],
  "score": 50
}

Use an empty array for strengths or concerns if none apply.
Score is 0-100, based on the rubric above. Be harsh — it's more useful than being polite.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const completion = await openrouter.chat.completions.create(
      {
        model: INTERVIEW_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 600,
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return { evaluation: null, error: "Empty evaluation response" };

    let text = raw.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    }

    const jsonStr = salvageJson(text);

    if (!jsonStr) return { evaluation: null, error: "No JSON found in evaluation" };

    try {
      const parsed = JSON.parse(jsonStr);
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
    } catch {
      // JSON parse failed — fall through
    }

    return { evaluation: null, error: "Invalid evaluation format" };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException || (err instanceof Error && err.name === "AbortError")) {
      return { evaluation: null, error: "Evaluation request timed out (30s)" };
    }
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
    const result = await Promise.race([
      prisma.session.create({
        data: {
          jobId,
          transcript: transcript as unknown as Prisma.InputJsonValue,
          evaluation: evaluation as unknown as Prisma.InputJsonValue,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Save timed out (10s)")), 10000)
      ),
    ]);
    return { sessionId: result.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { sessionId: null, error: `Save error: ${message}` };
  }
}
