"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { debug } from "@/stores/debug";
import { generateSpeech } from "@/actions/tts";

interface TTSHook {
  isSupported: boolean;
  isSpeaking: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
}

async function trySupertonic(text: string): Promise<HTMLAudioElement | null> {
  const t0 = performance.now();
  debug.tts("supertonic:request", {
    textLength: text.length,
    textPreview: text.slice(0, 60),
  });

  const result = await generateSpeech(text);

  if (result.error || !result.audioBase64) {
    debug.tts("supertonic:failed", {
      reason: result.error ?? "no audio returned",
      durationMs: Math.round(performance.now() - t0),
    });
    return null;
  }

  const audio = new Audio(result.audioBase64);

  audio.addEventListener(
    "ended",
    () => {
      // data URIs don't need revokeObjectURL
    },
    { once: true }
  );

  debug.tts("supertonic:response", {
    base64Length: result.audioBase64.length,
    durationMs: Math.round(performance.now() - t0),
  });

  return audio;
}

function trySpeechSynthesis(text: string, synthRef: React.MutableRefObject<SpeechSynthesis | null>): Promise<void> {
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
          (v.name.includes("Daniel") || v.name.includes("Samantha") || v.name.includes("Google") || v.name.includes("Natural")),
      ) || voices.find((v) => v.lang.startsWith("en"));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
      debug.tts("voiceSelected", {
        name: preferredVoice.name,
        lang: preferredVoice.lang,
      });
    }

    utterance.onstart = () => {
      debug.tts("playbackStarted", {
        engine: "speechSynthesis",
        textLength: text.length,
        textPreview: text.slice(0, 60),
      });
    };

    utterance.onend = () => {
      debug.tts("playbackEnded", { engine: "speechSynthesis" });
      resolve();
    };

    utterance.onerror = (e) => {
      debug.tts("playbackError", {
        engine: "speechSynthesis",
        error: e.error,
      });
      resolve();
    };

    debug.tts("speak", {
      engine: "speechSynthesis",
      textLength: text.length,
      textPreview: text.slice(0, 60),
    });
    synth.speak(utterance);
  });
}

export function useTTS(): TTSHook {
  const [isSupported, setIsSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const synth = window.speechSynthesis;
    const hasSupertonic = typeof fetch !== "undefined";

    debug.tts("init", {
      hasSynth: !!synth,
      hasSupertonicEndpoint: hasSupertonic,
      voicesAvailable: synth?.getVoices().length ?? 0,
    });

    if (synth) {
      synthRef.current = synth;
      const loadVoices = () => {
        debug.tts("voicesLoaded", { count: synth.getVoices().length });
      };
      loadVoices();
      synth.onvoiceschanged = loadVoices;
    }

    setIsSupported(!!synth || hasSupertonic);

    return () => {
      debug.tts("unmounting");
      synth?.cancel();
      audioRef.current?.pause();
    };
  }, []);

  const speak = useCallback(async (text: string): Promise<void> => {
    setIsSpeaking(true);

    // 1. Try Supertonic (local dev — fetches directly from browser)
    debug.tts("speak:trySupertonic", {
      textLength: text.length,
      textPreview: text.slice(0, 60),
    });

    const supertonicAudio = await trySupertonic(text);

    if (supertonicAudio) {
      audioRef.current = supertonicAudio;

      debug.tts("playbackStarted", {
        engine: "supertonic",
        textLength: text.length,
        textPreview: text.slice(0, 60),
      });

      return new Promise((resolve) => {
        supertonicAudio!.onended = () => {
          debug.tts("playbackEnded", { engine: "supertonic" });
          setIsSpeaking(false);
          audioRef.current = null;
          resolve();
        };
        supertonicAudio!.onerror = () => {
          debug.tts("playbackError", {
            engine: "supertonic",
            error: supertonicAudio!.error?.message || "unknown",
          });
          setIsSpeaking(false);
          audioRef.current = null;
          resolve();
        };
        supertonicAudio!.play().catch((err) => {
          debug.tts("playbackError", {
            engine: "supertonic",
            error: err instanceof Error ? err.message : "play failed",
          });
          setIsSpeaking(false);
          audioRef.current = null;
          resolve();
        });
      });
    }

    // 2. Fallback to SpeechSynthesis
    debug.tts("speak:fallbackToSpeechSynthesis");
    await trySpeechSynthesis(text, synthRef);
    setIsSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    debug.tts("stop");

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    synthRef.current?.cancel();
    setIsSpeaking(false);
  }, []);

  return { isSupported, isSpeaking, speak, stop };
}
