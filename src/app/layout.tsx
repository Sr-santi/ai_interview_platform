import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Interviewer",
  description: "Voice-driven AI-mediated job interviews",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <noscript>
          <div
            style={{
              background: "#ef4444",
              color: "#fff",
              padding: "12px 16px",
              fontSize: "14px",
              textAlign: "center",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            This application requires JavaScript. Please enable JavaScript in your browser settings.
          </div>
        </noscript>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
