import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SessionReplay } from "@/components/SessionReplay";
import type { TranscriptEntry, Evaluation } from "@/lib/types";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { job: { select: { title: true } } },
  });

  if (!session) {
    notFound();
  }

  let transcript: TranscriptEntry[] = [];
  if (typeof session.transcript === "string") {
    try {
      transcript = JSON.parse(session.transcript);
    } catch {
      transcript = [];
    }
  } else if (Array.isArray(session.transcript)) {
    transcript = session.transcript as unknown as TranscriptEntry[];
  }

  let evaluation: Evaluation | null = null;
  if (session.evaluation) {
    if (typeof session.evaluation === "string") {
      try {
        evaluation = JSON.parse(session.evaluation);
      } catch {
        evaluation = null;
      }
    } else {
      evaluation = session.evaluation as unknown as Evaluation;
    }
  }

  return (
    <SessionReplay
      transcript={transcript}
      evaluation={evaluation}
      jobTitle={session.job.title}
      createdAt={session.createdAt.toISOString()}
    />
  );
}
