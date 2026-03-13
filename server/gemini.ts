const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function normalizeModelName(model: string): string {
  return model.startsWith("models/") ? model : `models/${model}`;
}

function extractGeminiText(payload: any): string {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("\n").trim();
}

async function callGenerateContent(apiKey: string, model: string, prompt: string, jsonMode: boolean): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const modelPath = normalizeModelName(model);
  const resp = await fetch(`${GEMINI_BASE_URL}/${modelPath}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      ...(jsonMode ? { generationConfig: { responseMimeType: "application/json" } } : {}),
    }),
  });

  if (!resp.ok) {
    return { ok: false, status: resp.status, body: await resp.text() };
  }

  const data = await resp.json();
  const text = extractGeminiText(data);
  if (!text) {
    return { ok: false, status: 502, body: "Gemini response did not contain text content" };
  }

  return { ok: true, text };
}

async function listGenerateContentModels(apiKey: string): Promise<string[]> {
  const resp = await fetch(`${GEMINI_BASE_URL}/models?key=${apiKey}`);
  if (!resp.ok) return [];
  const data = await resp.json();
  const models = Array.isArray(data?.models) ? data.models : [];
  return models
    .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
    .map((m: any) => String(m.name || ""))
    .filter(Boolean);
}

export async function generateWithGemini(options: {
  apiKey: string;
  preferredModel: string;
  prompt: string;
  jsonMode?: boolean;
}): Promise<string> {
  const { apiKey, preferredModel, prompt, jsonMode = false } = options;
  const tried = new Set<string>();
  const preferredCandidates = [
    preferredModel,
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro",
    "gemini-pro",
  ];

  let lastError = "";

  for (const model of preferredCandidates) {
    if (!model || tried.has(model)) continue;
    tried.add(model);
    const result = await callGenerateContent(apiKey, model, prompt, jsonMode);
    if (result.ok) return result.text;

    lastError = `Gemini model ${model} failed (${result.status})${result.body ? `: ${result.body.slice(0, 220)}` : ""}`;
    if (result.status !== 404) {
      throw new Error(lastError);
    }
  }

  const availableModels = await listGenerateContentModels(apiKey);
  const discoveryCandidates = availableModels
    .filter((m) => m.toLowerCase().includes("gemini"))
    .slice(0, 12);

  for (const model of discoveryCandidates) {
    if (!model || tried.has(model)) continue;
    tried.add(model);
    const result = await callGenerateContent(apiKey, model, prompt, jsonMode);
    if (result.ok) return result.text;

    lastError = `Gemini model ${model} failed (${result.status})${result.body ? `: ${result.body.slice(0, 220)}` : ""}`;
    if (result.status !== 404) {
      throw new Error(lastError);
    }
  }

  const listed = availableModels.slice(0, 8).join(", ");
  throw new Error(lastError || `Gemini API error: no compatible generateContent model found. Available models: ${listed || "none returned by ListModels"}`);
}
