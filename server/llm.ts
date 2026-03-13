import type { Settings } from "@shared/schema";

export type EffectiveLlmSettings = Pick<Settings, "llmProvider" | "llmApiKey" | "llmModel">;

function getProviderEnvKey(provider: string): string {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY || "";
  if (provider === "gemini") return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  return process.env.OPENAI_API_KEY || "";
}

function sanitizeStoredKey(key: string): string {
  const trimmed = (key || "").trim();
  // Ignore masked values if they were sent back accidentally.
  if (/^[•*]{2,}/.test(trimmed)) return "";
  return trimmed;
}

export function resolveLlmSettings(settings: Pick<Settings, "llmProvider" | "llmApiKey" | "llmModel">): EffectiveLlmSettings {
  const provider = settings.llmProvider || "openai";
  const keyFromSettings = sanitizeStoredKey(settings.llmApiKey);
  const keyFromProviderEnv = getProviderEnvKey(provider).trim();
  const keyFromGenericEnv = (process.env.LLM_API_KEY || "").trim();

  return {
    ...settings,
    llmProvider: provider,
    llmApiKey: keyFromSettings || keyFromProviderEnv || keyFromGenericEnv,
  };
}

export function getLlmKeyMissingMessage(provider: string): string {
  if (provider === "anthropic") {
    return "LLM API key not configured. Add it in Settings or set ANTHROPIC_API_KEY/LLM_API_KEY.";
  }
  if (provider === "gemini") {
    return "LLM API key not configured. Add it in Settings or set GEMINI_API_KEY/GOOGLE_API_KEY/LLM_API_KEY.";
  }
  return "LLM API key not configured. Add it in Settings or set OPENAI_API_KEY/LLM_API_KEY.";
}
