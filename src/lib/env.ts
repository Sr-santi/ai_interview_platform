const REQUIRED_ENV_VARS = [
  "OPENROUTER_API_KEY",
  "DEEPGRAM_API_KEY",
  "DATABASE_URL",
] as const;

let validated = false;

export function validateEnv(): void {
  if (validated) return;
  validated = true;

  const missing: string[] = [];

  for (const name of REQUIRED_ENV_VARS) {
    if (!process.env[name]) {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Check your .env file or deployment environment settings."
    );
  }
}
