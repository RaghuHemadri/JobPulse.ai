import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { insertResumeSchema, insertRecipientSchema, insertLocationSchema, updateSettingsSchema } from "@shared/schema";
import { runPipeline, resendEmail } from "./pipeline";
import { getLlmKeyMissingMessage, resolveLlmSettings } from "./llm";
import { generateWithGemini } from "./gemini";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
  });

  // ---- Stats ----
  app.get("/api/stats", async (_req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  // ---- Resumes ----
  app.get("/api/resumes", async (_req, res) => {
    const resumes = await storage.getResumes();
    res.json(resumes);
  });

  app.post("/api/resumes", async (req, res) => {
    const parsed = insertResumeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const resume = await storage.createResume(parsed.data);
    res.json(resume);
  });

  app.delete("/api/resumes/:id", async (req, res) => {
    await storage.deleteResume(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---- Recipients ----
  app.get("/api/recipients", async (_req, res) => {
    const recipients = await storage.getRecipients();
    res.json(recipients);
  });

  app.post("/api/recipients", async (req, res) => {
    const parsed = insertRecipientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const rec = await storage.createRecipient(parsed.data);
    if (!rec) return res.status(409).json({ error: "Recipient already exists" });
    res.json(rec);
  });

  app.delete("/api/recipients/:id", async (req, res) => {
    await storage.deleteRecipient(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---- Locations ----
  app.get("/api/locations", async (_req, res) => {
    const locations = await storage.getLocations();
    res.json(locations);
  });

  app.post("/api/locations", async (req, res) => {
    const parsed = insertLocationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const loc = await storage.createLocation(parsed.data);
    if (!loc) return res.status(409).json({ error: "Location already exists" });
    res.json(loc);
  });

  app.delete("/api/locations/:id", async (req, res) => {
    await storage.deleteLocation(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---- Runs ----
  app.get("/api/runs", async (_req, res) => {
    const runs = await storage.getRuns();
    res.json(runs);
  });

  app.get("/api/runs/:id/jobs", async (req, res) => {
    const jobs = await storage.getJobsByRun(Number(req.params.id));
    res.json(jobs);
  });

  // ---- Pipeline ----
  app.post("/api/pipeline/run", async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      const llmSettings = resolveLlmSettings(settings);
      const resumes = await storage.getResumes();

      if (!llmSettings.llmApiKey) {
        return res.status(400).json({ error: getLlmKeyMissingMessage(llmSettings.llmProvider) });
      }
      if (resumes.length === 0) {
        return res.status(400).json({ error: "No resumes configured" });
      }

      const run = await storage.createRun();
      res.json({ runId: run.id, status: "started" });
      // Run pipeline in background
      runPipeline(run.id).catch(console.error);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- Resend Email ----
  app.post("/api/runs/:id/resend", async (req, res) => {
    try {
      const runId = Number(req.params.id);
      const run = await storage.getRun(runId);
      if (!run) return res.status(404).json({ error: "Run not found" });
      if (run.status !== "completed") return res.status(400).json({ error: "Run is not completed" });
      res.json({ status: "sending" });
      resendEmail(runId).catch(console.error);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- Settings ----
  app.get("/api/settings", async (_req, res) => {
    const settings = await storage.getSettings();
    // Mask the API key and SMTP password for frontend
    res.json({
      ...settings,
      llmApiKey: settings.llmApiKey ? "••••" + settings.llmApiKey.slice(-4) : "",
      smtpPassword: settings.smtpPassword ? "••••" + settings.smtpPassword.slice(-4) : "",
    });
  });

  app.patch("/api/settings", async (req, res) => {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const settings = await storage.updateSettings(parsed.data);
    res.json({
      ...settings,
      llmApiKey: settings.llmApiKey ? "••••" + settings.llmApiKey.slice(-4) : "",
      smtpPassword: settings.smtpPassword ? "••••" + settings.smtpPassword.slice(-4) : "",
    });
  });

  // ---- Parse Resume with LLM ----
  app.post("/api/parse-resume", async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided" });
    const mergeExplicitSkills = req.body?.mergeExplicitSkills !== false;

    const settings = await storage.getSettings();
    const llmSettings = resolveLlmSettings(settings);
    if (!llmSettings.llmApiKey) {
      return res.status(400).json({ error: getLlmKeyMissingMessage(llmSettings.llmProvider) });
    }

    try {
      const result = await parseResumeWithLLM(text, llmSettings);
      const normalized = normalizeParsedResume(result, text, mergeExplicitSkills);
      res.json(normalized);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/parse-resume-file", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const isPdf = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    if (!isPdf) return res.status(400).json({ error: "Only PDF files are supported" });

    const mergeExplicitSkills = req.body?.mergeExplicitSkills !== "false";

    const settings = await storage.getSettings();
    const llmSettings = resolveLlmSettings(settings);
    if (!llmSettings.llmApiKey) {
      return res.status(400).json({ error: getLlmKeyMissingMessage(llmSettings.llmProvider) });
    }

    try {
      const text = await extractTextFromPdf(file.buffer);
      if (!text.trim()) {
        return res.status(400).json({ error: "Could not extract text from PDF" });
      }
      const result = await parseResumeWithLLM(text, llmSettings);
      const normalized = normalizeParsedResume(result, text, mergeExplicitSkills);
      res.json({ ...normalized, extractedTextLength: text.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}

async function parseResumeWithLLM(text: string, settings: { llmProvider: string; llmApiKey: string; llmModel: string }) {
  const prompt = `Extract the following from this resume text. Return ONLY valid JSON with these fields:
- name: full name
- email: email address
- skills: array of technical skills (max 15, focus on ML/AI/engineering skills)

Resume text:
${text}`;

  if (settings.llmProvider === "openai") {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.llmApiKey}` },
      body: JSON.stringify({
        model: settings.llmModel || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI API error: ${resp.status}`);
    const data = await resp.json();
    return JSON.parse(data.choices[0].message.content);
  } else if (settings.llmProvider === "anthropic") {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.llmApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: settings.llmModel || "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) throw new Error(`Anthropic API error: ${resp.status}`);
    const data = await resp.json();
    const content = data.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { name: "", email: "", skills: [] };
  } else if (settings.llmProvider === "gemini") {
    const content = await generateWithGemini({
      apiKey: settings.llmApiKey,
      preferredModel: settings.llmModel || "gemini-1.5-flash",
      prompt,
      jsonMode: true,
    });
    return JSON.parse(content || "{}");
  }

  throw new Error(`Unsupported LLM provider: ${settings.llmProvider}`);
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdfParseModule = await import("pdf-parse");
  const parser = new (pdfParseModule as any).PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return String(parsed?.text || "").replace(/\u0000/g, " ").trim();
  } finally {
    await parser.destroy();
  }
}

function normalizeParsedResume(
  raw: any,
  sourceText: string,
  mergeExplicitSkills: boolean,
): { name: string; email: string; skills: string[] } {
  const llmSkills = Array.isArray(raw?.skills) ? raw.skills : [];
  const normalizedLlmSkills = normalizeSkills(llmSkills);
  const explicitSkills = mergeExplicitSkills ? extractExplicitSkillsFromResumeText(sourceText) : [];
  const merged = normalizeSkills([...normalizedLlmSkills, ...explicitSkills]);
  return {
    name: typeof raw?.name === "string" ? raw.name.trim() : "",
    email: typeof raw?.email === "string" ? raw.email.trim() : "",
    skills: merged.slice(0, 15),
  };
}

function normalizeSkills(skills: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const skill of skills) {
    const normalized = normalizeSkill(skill);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function normalizeSkill(input: string): string | null {
  const cleaned = input
    .replace(/^[-*\u2022\d.\s]+/, "")
    .replace(/^(languages?|libraries?\s*&\s*frameworks?|frameworks?|core competencies)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 40) return null;

  const key = cleaned.toLowerCase();
  const aliases: Record<string, string> = {
    "tensorflow": "TensorFlow",
    "tensor flow": "TensorFlow",
    "pytorch": "PyTorch",
    "sci-kit learn": "Scikit-learn",
    "scikit learn": "Scikit-learn",
    "sklearn": "Scikit-learn",
    "llms": "Large Language Models",
    "llm": "Large Language Models",
    "nlp": "Natural Language Processing",
    "mlops": "MLOps",
    "fast api": "FastAPI",
  };
  if (aliases[key]) return aliases[key];

  if (/^[a-z][a-z0-9+\-\s/]*$/i.test(cleaned)) {
    if (cleaned.toUpperCase() === cleaned && cleaned.length <= 5) {
      return cleaned;
    }
    return cleaned
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return cleaned;
}

function extractExplicitSkillsFromResumeText(text: string): string[] {
  const normalized = text.replace(/\r/g, "");
  const lower = normalized.toLowerCase();
  const marker = "\nskills";
  const idx = lower.indexOf(marker);
  if (idx < 0) return [];

  const block = normalized.slice(idx, idx + 1800);
  const lines = block.split("\n").slice(1, 30);
  const parts: string[] = [];

  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line) continue;
    if (/^(selected patents|publications|education|experience|projects)\b/i.test(line)) break;

    const colonIdx = line.indexOf(":");
    const content = colonIdx >= 0 ? line.slice(colonIdx + 1) : line;
    const tokens = content.split(/[,;|\u2022]/).map((t) => t.trim()).filter(Boolean);
    parts.push(...tokens);
  }

  return normalizeSkills(parts);
}
