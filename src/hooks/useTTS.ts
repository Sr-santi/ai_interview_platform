"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { debug } from "@/stores/debug";

let ttsModulePromise: Promise<typeof import("@/lib/tts")> | null = null;

function getTtsModule(): Promise<typeof import("@/lib/tts")> {
  if (!ttsModulePromise) {
    ttsModulePromise = import("@/lib/tts");
  }
  return ttsModulePromise;
}

export type TTSEngine = "onnx" | "speechSynthesis" | "none";

interface TTSHook {
  isSupported: boolean;
  isSpeaking: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
  loadModel: () => Promise<void>;
  ttsStatus: "idle" | "loading" | "ready" | "fallback" | "error";
  loadProgress: number;
  engine: TTSEngine;
  setVoice: (voice: string) => void;
  currentVoice: string;
}

const LOAD_TIMEOUT_MS = 60_000;

function trySpeechSynthesis(
  text: string,
  synthRef: React.MutableRefObject<SpeechSynthesis | null>
): Promise<void> {
  return new Promise((resolve) => {
    const synth = synthRef.current;
    if (!synth) {
      debug.tts("speechSynthesis:noSynth");
      resolve();
      return;
    }

    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1;

    const voices = synth.getVoices();
    const preferredVoice =
      voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Daniel") ||
            v.name.includes("Samantha") ||
            v.name.includes("Google") ||
            v.name.includes("Natural"))
      ) || voices.find((v) => v.lang.startsWith("en"));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    let ended = false;
    utterance.onend = () => {
      if (!ended) { ended = true; resolve(); }
    };
    utterance.onerror = () => {
      if (!ended) { ended = true; resolve(); }
    };

    synth.speak(utterance);
  });
}

export function useTTS(): TTSHook {
  const [ttsStatus, setTtsStatus] = useState<TTSHook["ttsStatus"]>("idle");
  const [loadProgress, setLoadProgress] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentVoice, setCurrentVoice] = useState("M1");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ttsRef = useRef<any>(null);
  const voicesRef = useRef<Record<string, Float32Array> | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;
  const hasSynth = typeof window !== "undefined" && !!window.speechSynthesis;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    synthRef.current = synth;
    return () => {
      synth?.cancel();
      sourceNodeRef.current?.stop();
      audioCtxRef.current?.close();
    };
  }, []);

  const loadModel = useCallback(async () => {
    if (ttsStatus === "ready" || ttsStatus === "loading") return;

    if (!hasWebGPU) {
      debug.tts("init:noWebGPU");
      setTtsStatus(hasSynth ? "fallback" : "error");
      return;
    }

    debug.tts("init:loading");
    setTtsStatus("loading");
    setLoadProgress(0);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);

    try {
      const { loadPipeline, loadVoices } = await getTtsModule();

      const [pipeline, voices] = await Promise.race([
        Promise.all([
          loadPipeline((pct) => setLoadProgress(pct)),
          loadVoices(),
        ]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Model load timed out")), LOAD_TIMEOUT_MS)
        ),
      ]);

      clearTimeout(timeout);
      ttsRef.current = pipeline;
      voicesRef.current = voices;
      debug.tts("init:ready", { voiceCount: Object.keys(voices).length });
      setTtsStatus("ready");
      setLoadProgress(100);
    } catch (err) {
      clearTimeout(timeout);
      const message = err instanceof Error ? err.message : "Unknown error";
      debug.tts("init:failed", { reason: message });
      setTtsStatus(hasSynth ? "fallback" : "error");
    }
  }, [hasWebGPU, hasSynth, ttsStatus]);

  const speak = useCallback(
    async (text: string): Promise<void> => {
      setIsSpeaking(true);

      // Primary: ONNX Supertonic
      if (ttsRef.current && voicesRef.current && ttsStatus === "ready") {
        const embedding = voicesRef.current[currentVoice];
        if (!embedding) {
          debug.tts("speak:voiceNotFound", { voice: currentVoice });
          setIsSpeaking(false);
          return;
        }

        try {
          const { synthesize } = await getTtsModule();
          const { audio, sampleRate } = await synthesize(
            text,
            ttsRef.current,
            embedding,
            20,
            1.1
          );

          // Play via Web Audio API
          if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContext();
          }
          const ctx = audioCtxRef.current;
          if (ctx.state === "suspended") await ctx.resume();

          const audioBuffer = ctx.createBuffer(1, audio.length, sampleRate);
          audioBuffer.getChannelData(0).set(audio);

          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          sourceNodeRef.current = source;

          await new Promise<void>((resolve) => {
            source.onended = () => {
              sourceNodeRef.current = null;
              setIsSpeaking(false);
              resolve();
            };
            source.start();
          });
          return;
        } catch (err) {
          debug.tts("speak:onnxFailed", {
            error: err instanceof Error ? err.message : "unknown",
          });
          // Fall through to SpeechSynthesis
        }
      }

      // Fallback: SpeechSynthesis
      debug.tts("speak:fallback");
      await trySpeechSynthesis(text, synthRef);
      setIsSpeaking(false);
    },
    [ttsStatus, currentVoice]
  );

  const stop = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    synthRef.current?.cancel();
    setIsSpeaking(false);
  }, []);

  const setVoice = useCallback((voice: string) => {
    if (["F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5"].includes(voice)) {
      setCurrentVoice(voice);
    }
  }, []);

  return {
    isSupported: hasSynth || hasWebGPU,
    isSpeaking,
    speak,
    stop,
    loadModel,
    ttsStatus,
    loadProgress,
    engine: ttsStatus === "ready" ? "onnx" : hasSynth ? "speechSynthesis" : "none",
    setVoice,
    currentVoice,
  };
}
