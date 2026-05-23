import type { TextToAudioPipeline, RawAudio } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/Supertonic-TTS-ONNX";
const VOICES_URL = "/voices/";

let pipelinePromise: Promise<TextToAudioPipeline> | null = null;
let voicesPromise: Promise<Record<string, Float32Array>> | null = null;

export async function loadPipeline(
  onProgress: (pct: number) => void
): Promise<TextToAudioPipeline> {
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    const { pipeline: hfPipeline, env } = await import("@huggingface/transformers");

    if (env.backends?.onnx) {
      env.backends.onnx.logSeverityLevel = 4;
      env.backends.onnx.logVerbosityLevel = 0;
    }

    const progressMap = new Map<string, number>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tts = (await (hfPipeline as any)("text-to-speech", MODEL_ID, {
      device: "webgpu",
      progress_callback: (info: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (info.status === "progress" && info.file?.endsWith(".onnx_data") && info.loaded && info.total) {
          progressMap.set(info.file, info.loaded / info.total);
          const total = Array.from(progressMap.values()).reduce((a, b) => a + b, 0);
          onProgress(Math.round((total / 3) * 100));
        }
      },
    })) as TextToAudioPipeline;

    // Warm up to compile shaders
    await tts("Hello", {
      speaker_embeddings: new Float32Array(1 * 101 * 128),
      num_inference_steps: 1,
      speed: 1.0,
    });

    return tts;
  })();

  return pipelinePromise;
}

export async function loadVoices(): Promise<Record<string, Float32Array>> {
  if (voicesPromise) return voicesPromise;

  voicesPromise = (async () => {
    const voiceIds = ["F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5"];
    const buffers = await Promise.all(
      voiceIds.map((id) =>
        fetch(`${VOICES_URL}${id}.bin`).then((r) => {
          if (!r.ok) throw new Error(`Failed to load voice ${id}`);
          return r.arrayBuffer();
        })
      )
    );
    return Object.fromEntries(
      voiceIds.map((id, i) => [id, new Float32Array(buffers[i])])
    ) as Record<string, Float32Array>;
  })();

  return voicesPromise;
}

function findSentenceBoundary(text: string, maxLen: number): number {
  if (text.length <= maxLen) return text.length;

  const terminators = [".", "!", "?", "\n"];
  let best = -1;

  for (const term of terminators) {
    const idx = text.lastIndexOf(term, maxLen);
    if (idx > best) best = idx;
  }

  if (best > text.length * 0.3) return best + 1;

  // Fall back to last space
  const spaceIdx = text.lastIndexOf(" ", maxLen);
  if (spaceIdx > text.length * 0.3) return spaceIdx;

  return maxLen;
}

function splitText(text: string, maxLen = 800): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    const boundary = findSentenceBoundary(remaining, maxLen);
    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }
  return chunks;
}

export async function synthesize(
  text: string,
  tts: TextToAudioPipeline,
  speakerEmbedding: Float32Array,
  quality = 20,
  speed = 1.1
): Promise<{ audio: Float32Array; sampleRate: number }> {
  const chunks = splitText(text);

  const audioChunks: Float32Array[] = [];
  let sampleRate = 44100;

  for (let i = 0; i < chunks.length; i++) {
    const output = (await tts(chunks[i], {
      speaker_embeddings: speakerEmbedding,
      num_inference_steps: quality,
      speed,
    })) as RawAudio;

    if (i < chunks.length - 1) {
      const silenceSamples = Math.floor(0.5 * output.sampling_rate);
      const padded = new Float32Array(output.audio.length + silenceSamples);
      padded.set(output.audio);
      output.audio = padded;
    }

    audioChunks.push(output.audio);
    sampleRate = output.sampling_rate;
  }

  const totalLen = audioChunks.reduce((acc, c) => acc + c.length, 0);
  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (const chunk of audioChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return { audio: merged, sampleRate };
}

export function createWavBlob(
  chunks: Float32Array[],
  samplingRate: number
): Blob {
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46); // RIFF
  view.setUint32(4, 36 + totalLength * 4, true);
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45); // WAVE
  view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20); // fmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); // IEEE Float
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, samplingRate, true);
  view.setUint32(28, samplingRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 32, true);
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61); // data
  view.setUint32(40, totalLength * 4, true);

  return new Blob([buffer, ...chunks as any], { type: "audio/wav" });
}
