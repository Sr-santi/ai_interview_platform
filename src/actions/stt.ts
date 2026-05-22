"use server";

import { debug } from "@/stores/debug";

export async function transcribeAudio(
  formData: FormData
): Promise<{ text: string | null; error?: string }> {
  const audioFile = formData.get("audio") as File | null;
  if (!audioFile || audioFile.size === 0) {
    return { text: null, error: "No audio data received" };
  }

  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) {
    return { text: null, error: "DeepGram API key not configured" };
  }

  const t0 = performance.now();
  debug.stt("deepgram:request", {
    blobSize: audioFile.size,
    blobType: audioFile.type,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const url = "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=en";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${deepgramApiKey}`,
        "Content-Type": audioFile.type || "audio/webm",
      },
      body: await audioFile.arrayBuffer(),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      debug.stt("deepgram:error", {
        status: response.status,
        body: errorBody.slice(0, 200),
        durationMs: Math.round(performance.now() - t0),
      });
      return {
        text: null,
        error: `DeepGram returned ${response.status}: ${errorBody.slice(0, 100)}`,
      };
    }

    const result = await response.json();
    const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

    debug.stt("deepgram:response", {
      transcriptLength: transcript.length,
      transcriptPreview: transcript.slice(0, 100),
      durationMs: Math.round(performance.now() - t0),
    });

    return { text: transcript.trim() || null };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException || (err instanceof Error && err.name === "AbortError")) {
      return { text: null, error: "Transcription timed out (30s)" };
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    debug.stt("deepgram:exception", {
      error: message,
      durationMs: Math.round(performance.now() - t0),
    });
    return { text: null, error: `Transcription failed: ${message}` };
  }
}
