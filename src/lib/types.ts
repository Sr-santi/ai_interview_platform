export interface Job {
  id: string;
  title: string;
  description: string;
  systemPrompt: string;
}

export interface SessionData {
  id: string;
  jobId: string;
  transcript: TranscriptEntry[];
  evaluation: Evaluation | null;
  createdAt: string;
}

export interface TranscriptEntry {
  role: "interviewer" | "candidate";
  text: string;
}

export interface Evaluation {
  strengths: string[];
  concerns: string[];
  score: number;
}

export interface LLMResponse {
  thought_process: string;
  skills_detected: string[];
  spoken_response: string;
}
