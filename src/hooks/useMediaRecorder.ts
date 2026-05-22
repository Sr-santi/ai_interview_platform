"use client";

import { useCallback, useRef, useState } from "react";
import { debug } from "@/stores/debug";

interface MediaRecorderHook {
  isSupported: boolean;
  isRecording: boolean;
  error: string | null;
  startRecording: () => void;
  stopRecording: () => Promise<Blob | null>;
}

export function useMediaRecorder(): MediaRecorderHook {
  const [isSupported, setIsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  // Lazy-init on first startRecording call to avoid permission prompt on mount
  const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current;

    debug.stt("mediaRecorder:requesting permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      setIsSupported(true);
      debug.stt("mediaRecorder:permission granted");
      return stream;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      debug.stt("mediaRecorder:permission denied", { error: msg });

      if (msg.includes("NotAllowed") || msg.includes("Permission")) {
        setError("Microphone access denied. Please allow microphone permissions in your browser.");
      } else if (msg.includes("NotFound")) {
        setError("No microphone detected. Please connect a microphone and try again.");
      } else {
        setError(`Microphone error: ${msg}`);
      }
      setIsSupported(false);
      return null;
    }
  }, []);

  const startRecording = useCallback(() => {
    if (isRecording) return;

    debug.stt("mediaRecorder:start called");
    setError(null);
    chunksRef.current = [];

    ensureStream().then((stream) => {
      if (!stream) return;

      try {
        const recorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "audio/webm",
          audioBitsPerSecond: 64000,
        });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          debug.stt("mediaRecorder:onstop", {
            chunks: chunksRef.current.length,
            totalBytes: chunksRef.current.reduce((sum, c) => sum + c.size, 0),
          });
          if (resolveRef.current) {
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
            resolveRef.current(blob);
            resolveRef.current = null;
          }
        };

        recorder.onerror = (e) => {
          debug.stt("mediaRecorder:onerror", { error: String(e) });
          setError("Recording error occurred. Try again.");
          setIsRecording(false);
          if (resolveRef.current) {
            resolveRef.current(null);
            resolveRef.current = null;
          }
        };

        recorder.onstart = () => {
          debug.stt("mediaRecorder:onstart");
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true);
        debug.stt("mediaRecorder:recording started");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        debug.stt("mediaRecorder:start failed", { error: msg });
        setError(`Recording failed: ${msg}`);
        setIsSupported(false);
      }
    });
  }, [isRecording, ensureStream]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;

      if (!recorder || recorder.state === "inactive") {
        debug.stt("mediaRecorder:stop called but inactive", {
          hasRecorder: !!recorder,
          state: recorder?.state ?? "none",
        });
        resolve(null);
        return;
      }

      debug.stt("mediaRecorder:stop called", {
        state: recorder.state,
      });

      resolveRef.current = resolve;
      recorder.stop();
      setIsRecording(false);

      // Clean up the stream tracks
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      mediaRecorderRef.current = null;
    });
  }, []);

  return {
    isSupported,
    isRecording,
    error,
    startRecording,
    stopRecording,
  };
}
