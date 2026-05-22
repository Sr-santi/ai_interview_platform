import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { InterviewRoom } from "@/components/InterviewRoom";

export default async function InterviewRoomPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    notFound();
  }

  return (
    <div>
      <div className="text-center py-3 border-b border-interview-border/50">
        <h1 className="text-sm font-semibold text-interview-text">
          {job.title} Interview
        </h1>
      </div>
      <InterviewRoom job={job} />
    </div>
  );
}
