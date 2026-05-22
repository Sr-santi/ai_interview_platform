"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { debug } from "@/stores/debug";

interface UseCameraResult {
  stream: MediaStream | null;
  error: string | null;
  isActive: boolean;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
}

export function useCamera(): UseCameraResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    debug.room("camera:stop");
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const startCamera = useCallback(async () => {
    debug.room("camera:start");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera not supported in this browser");
      debug.room("camera:unsupported");
      return;
    }

    stopCamera();

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setError(null);
      debug.room("camera:active", {
        tracks: mediaStream.getVideoTracks().length,
      });
    } catch (err) {
      const message =
        err instanceof DOMException
          ? err.name === "NotAllowedError"
            ? "Camera permission denied"
            : err.name === "NotFoundError"
              ? "No camera found"
              : `Camera error: ${err.message}`
          : "Failed to start camera";

      setError(message);
      debug.room("camera:error", { message });
    }
  }, [stopCamera]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    stream,
    error,
    isActive: stream !== null,
    startCamera,
    stopCamera,
  };
}
