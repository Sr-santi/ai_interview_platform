"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useInterviewStore } from "@/stores/interview";

export function BackToRoles() {
  const router = useRouter();
  const interview = useInterviewStore();
  const [showConfirm, setShowConfirm] = useState(false);

  const isActive = interview.state !== "idle" && interview.state !== "complete";

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (isActive) {
        e.preventDefault();
        setShowConfirm(true);
      }
    },
    [isActive],
  );

  const handleConfirmLeave = useCallback(() => {
    interview.reset();
    setShowConfirm(false);
    router.push("/");
  }, [interview, router]);

  const handleCancelLeave = useCallback(() => {
    setShowConfirm(false);
  }, []);

  // Browser-level guard for tab close / refresh
  useEffect(() => {
    if (!isActive) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isActive]);

  return (
    <>
      <a
        href="/"
        onClick={handleClick}
        className="text-xs text-interview-muted hover:text-interview-text transition-colors flex items-center gap-1 cursor-pointer"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to roles
      </a>

      {showConfirm &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-interview-surface border border-interview-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
              <h2 className="text-sm font-semibold text-interview-text mb-2">Leave interview?</h2>
              <p className="text-xs text-interview-muted mb-5 leading-relaxed">
                You&apos;re in the middle of an interview. Leaving now will end this session — your progress will be lost and any unanswered
                questions will be skipped.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleCancelLeave}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-interview-surface border border-interview-border hover:border-interview-accent/50 text-interview-text transition-colors"
                >
                  Stay
                </button>
                <button
                  onClick={handleConfirmLeave}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-interview-danger/10 border border-interview-danger/30 hover:bg-interview-danger/20 text-interview-danger transition-colors"
                >
                  Leave
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
