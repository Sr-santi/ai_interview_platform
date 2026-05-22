"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { debug } from "@/stores/debug";

interface TTSHook {
  isSupported: boolean;
  isSpeaking: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
}

export function useTTS(): TTSHook {
  const [isSupported, setIsSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;

    debug.tts("init", {
      hasSynth: !!synth,
      voicesAvailable: synth?.getVoices().length ?? 0,
    });

    if (!synth) {
      setIsSupported(false);
      debug.tts("initFailed", { reason: "no speechSynthesis" });
      return;
    }

    synthRef.current = synth;
    setIsSupported(true);

    const loadVoices = () => {
      const voices = synth.getVoices();
      debug.tts("voicesLoaded", { count: voices.length });
    };
    loadVoices();
    synth.onvoiceschanged = loadVoices;

    return () => {
      debug.tts("unmounting");
      synth.cancel();
    };
  }, []);

  const speak = useCallback(
    (text: string): Promise<void> => {
      return new Promise((resolve) => {
        const synth = synthRef.current;

        if (!synth) {
          debug.tts("speak:noSynth");
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
          debug.tts("voiceSelected", {
            name: preferredVoice.name,
            lang: preferredVoice.lang,
          });
        } else {
          debug.tts("noPreferredVoice", { voicesAvailable: voices.length });
        }

        utterance.onstart = () => {
          debug.tts("playbackStarted", {
            textLength: text.length,
            textPreview: text.slice(0, 60),
          });
          setIsSpeaking(true);
        };

        utterance.onend = () => {
          debug.tts("playbackEnded");
          setIsSpeaking(false);
          resolve();
        };

        utterance.onerror = (e) => {
          debug.tts("playbackError", {
            error: e.error,
          });
          setIsSpeaking(false);
          resolve();
        };

        debug.tts("speak", {
          textLength: text.length,
          textPreview: text.slice(0, 60),
        });
        synth.speak(utterance);
      });
    },
    []
  );

  const stop = useCallback(() => {
    debug.tts("stop");
    synthRef.current?.cancel();
    setIsSpeaking(false);
  }, []);

  return { isSupported, isSpeaking, speak, stop };
}
