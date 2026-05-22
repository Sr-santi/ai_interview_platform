import { BackToRoles } from "@/components/BackToRoles";

export default function InterviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-interview-border bg-interview-surface/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 h-12 flex items-center">
          <BackToRoles />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
