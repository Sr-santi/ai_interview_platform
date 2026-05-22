"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { debug } from "@/stores/debug";

const RECORDING_MAX_SECONDS = 90;

interface MediaRecorderHook {
  isSupported: boolean;
  isRecording: boolean;
  elapsedSeconds: number;
  timeLimitReached: boolean;
  error: string | null;
  startRecording: () => void;
  stopRecording: () => Promise<Blob | null>;
}

export function useMediaRecorder(): MediaRecorderHook {
  const [isSupported, setIsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timeLimitReached, setTimeLimitReached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startTimer = useCallback(() => {
    secondsRef.current = 0;
    setElapsedSeconds(0);
    setTimeLimitReached(false);

    timerRef.current = setInterval(() => {
      secondsRef.current += 1;
      setElapsedSeconds(secondsRef.current);

      if (secondsRef.current >= RECORDING_MAX_SECONDS) {
        debug.stt("mediaRecorder:timeLimitReached", {
          seconds: secondsRef.current,
        });

        if (timerRef.current) clearInterval(timerRef.current);
        setTimeLimitReached(true);

        // Auto-stop
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
          recorder.stop();
          setIsRecording(false);
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          mediaRecorderRef.current = null;
        }
      }
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

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
    setTimeLimitReached(false);

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
          stopTimer();
          debug.stt("mediaRecorder:onstop", {
            chunks: chunksRef.current.length,
            totalBytes: chunksRef.current.reduce((sum, c) => sum + c.size, 0),
            seconds: secondsRef.current,
          });
          if (resolveRef.current) {
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
            resolveRef.current(blob);
            resolveRef.current = null;
          }
        };

        recorder.onerror = (e) => {
          stopTimer();
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
          startTimer();
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true);
        debug.stt("mediaRecorder:recording started", {
          timeLimit: RECORDING_MAX_SECONDS,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        debug.stt("mediaRecorder:start failed", { error: msg });
        setError(`Recording failed: ${msg}`);
        setIsSupported(false);
      }
    });
  }, [isRecording, ensureStream, startTimer, stopTimer]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;

      if (!recorder || recorder.state === "inactive") {
        stopTimer();
        debug.stt("mediaRecorder:stop called but inactive", {
          hasRecorder: !!recorder,
          state: recorder?.state ?? "none",
        });
        resolve(null);
        return;
      }

      debug.stt("mediaRecorder:stop called", {
        state: recorder.state,
        elapsed: secondsRef.current,
      });

      resolveRef.current = resolve;
      recorder.stop();
      setIsRecording(false);

      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      mediaRecorderRef.current = null;
    });
  }, [stopTimer]);

  return {
    isSupported,
    isRecording,
    elapsedSeconds,
    timeLimitReached,
    error,
    startRecording,
    stopRecording,
  };
}
