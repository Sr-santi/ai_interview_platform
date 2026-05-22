"use server";

import { debug } from "@/stores/debug";

export async function generateSpeech(text: string): Promise<{ audioBase64: string | null; error?: string }> {
  const t0 = performance.now();
  debug.tts("supertonic:request", {
    textLength: text.length,
    textPreview: text.slice(0, 60),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const supertonicUrl =
    process.env.SUPERTONIC_URL || "http://127.0.0.1:7788/v1/audio/speech";

  try {
    const response = await fetch(supertonicUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer local-dev",
      },
      body: JSON.stringify({
        model: "supertonic-3",
        input: text,
        voice: "M1",
        response_format: "wav",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      debug.tts("supertonic:error", {
        status: response.status,
        statusText: response.statusText,
        body: errorBody.slice(0, 300),
        durationMs: Math.round(performance.now() - t0),
      });
      return { audioBase64: null, error: `Supertonic ${response.status}: ${errorBody.slice(0, 100)}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    debug.tts("supertonic:response", {
      sizeBytes: arrayBuffer.byteLength,
      durationMs: Math.round(performance.now() - t0),
    });

    return { audioBase64: `data:audio/wav;base64,${base64}` };
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : "Unknown error";
    debug.tts("supertonic:failed", {
      reason: message,
      durationMs: Math.round(performance.now() - t0),
    });
    return { audioBase64: null, error: message };
  }
}
