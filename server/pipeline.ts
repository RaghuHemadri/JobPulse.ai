import { storage } from "./storage";
import type { Job } from "@shared/schema";
import { getLlmKeyMissingMessage, resolveLlmSettings } from "./llm";
import { generateWithGemini } from "./gemini";

// Match keywords for scoring
const MATCH_KEYWORDS = [
  "llm", "large language model", "nlp", "natural language processing",
  "rag", "retrieval augmented", "pytorch", "tensorflow",
  "fine-tuning", "fine tuning", "lora", "rlhf", "grpo", "sft",
  "reinforcement learning", "mlops", "kubernetes", "ray",
  "multimodal", "transformer", "deep learning", "agentic",
  "knowledge graph", "gcp", "azure", "fastapi",
  "machine learning engineer", "ai engineer", "research scientist",
  "applied scientist", "ml engineer", "nlp engineer",
];

const SENIOR_KEYWORDS = [
  "senior", "staff", "principal", "lead", "director", "head of",
  "8+ years", "10+ years", "7+ years", "6+ years", "5+ years",
];

function isSeniorRole(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  return SENIOR_KEYWORDS.some(kw => text.includes(kw));
}

function computeMatchScore(title: string, company: string, description: string, location: string, profileSkills: string[]): number {
  const text = `${title} ${company} ${description}`.toLowerCase();
  let score = MATCH_KEYWORDS.filter(kw => text.includes(kw)).length;
  
  // Bonus for profile skill matches
  score += profileSkills.filter(skill => text.includes(skill.toLowerCase())).length;

  // Location bonus
  const loc = location.toLowerCase();
  if (["san francisco", "bay area", "palo alto", "mountain view", "sunnyvale", "cupertino", "santa clara", "san jose", "remote"].some(l => loc.includes(l))) {
    score += 3;
  }
  return score;
}

function generateMatchReason(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  const reasons: string[] = [];
  if (["llm", "large language model", "fine-tuning", "fine tuning"].some(kw => text.includes(kw))) reasons.push("LLM/fine-tuning");
  if (["rag", "retrieval"].some(kw => text.includes(kw))) reasons.push("RAG");
  if (["nlp", "natural language"].some(kw => text.includes(kw))) reasons.push("NLP");
  if (["reinforcement learning", "rl ", "rlhf"].some(kw => text.includes(kw))) reasons.push("RL");
  if (["mlops", "kubernetes", "ray", "deployment"].some(kw => text.includes(kw))) reasons.push("MLOps");
  if (["multimodal", "vision"].some(kw => text.includes(kw))) reasons.push("Multimodal ML");
  if (["agentic", "agent"].some(kw => text.includes(kw))) reasons.push("Agentic AI");
  if (["pytorch", "tensorflow"].some(kw => text.includes(kw))) reasons.push("Framework match");
  if (reasons.length === 0) reasons.push("ML/AI skills alignment");
  return reasons.slice(0, 3).join(", ");
}

interface RawJob {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  postedAgeDays?: number;
}

interface RankedJob extends RawJob {
  score: number;
  matchReason: string;
}

const LINKEDIN_GUEST_SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
const LINKEDIN_JOB_VIEW_BASE = "https://www.linkedin.com/jobs/view/";
const LINKEDIN_READ_PROXY_PREFIX = "https://r.jina.ai/http://";

const LINKEDIN_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.linkedin.com/jobs/",
};

function stripHtml(input: string): string {
  return (input || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRecentDate(value: string | number | null | undefined, recencyDays: number): boolean {
  if (!value) return true;
  const dt = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(dt.getTime())) return true;
  const ageMs = Date.now() - dt.getTime();
  const limitMs = Math.max(1, recencyDays) * 24 * 60 * 60 * 1000;
  return ageMs <= limitMs;
}

function locationMatchesTarget(jobLocation: string, targets: string[]): boolean {
  if (targets.length === 0) return true;
  const loc = (jobLocation || "").toLowerCase();
  if (!loc) return true;

  const normalizedLoc = loc.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const bayAreaCities = [
    "san francisco", "palo alto", "mountain view", "sunnyvale", "cupertino",
    "santa clara", "san jose", "menlo park", "oakland", "redwood city",
  ];

  return targets.some((t) => {
    const target = t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (!target) return true;

    if (target.includes("remote") && normalizedLoc.includes("remote")) return true;

    if (target.includes("bay area")) {
      if (normalizedLoc.includes("bay area")) return true;
      if (bayAreaCities.some((city) => normalizedLoc.includes(city))) return true;
    }

    if (normalizedLoc.includes(target) || target.includes(normalizedLoc)) return true;

    const targetTokens = target.split(" ").filter((w) => w.length >= 4);
    const locTokens = normalizedLoc.split(" ");
    const overlap = targetTokens.filter((token) => locTokens.includes(token)).length;
    return overlap >= 1;
  });
}

function titleLooksRelevant(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  const roleSignals = [
    "machine learning",
    "ml engineer",
    "ai engineer",
    "nlp",
    "data scientist",
    "applied scientist",
    "research scientist",
    "deep learning",
    "llm",
    "generative ai",
  ];
  return roleSignals.some((s) => text.includes(s));
}

function normalizeLocationText(input: string): string {
  return (input || "").toLowerCase().replace(/[^a-z0-9\s,]/g, " ").replace(/\s+/g, " ").trim();
}

function isPriorityLocation(location: string): boolean {
  const loc = normalizeLocationText(location);
  const prioritySignals = [
    "seattle",
    "san francisco",
    "bay area",
    "palo alto",
    "mountain view",
    "sunnyvale",
    "cupertino",
    "santa clara",
    "san jose",
    "menlo park",
    "redwood city",
  ];
  return prioritySignals.some((s) => loc.includes(s));
}

function isUnitedStatesLocation(location: string): boolean {
  const loc = normalizeLocationText(location);
  if (!loc) return false;

  if (loc.includes("united states") || loc.includes(" usa") || loc.includes("u s")) return true;

  const stateAbbr = [
    "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks",
    "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny",
    "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy",
  ];
  const statePattern = new RegExp(`,\\s*(${stateAbbr.join("|")})(?:\\s|$)`);
  if (statePattern.test(loc)) return true;

  const usCityHints = ["seattle", "san francisco", "new york", "los angeles", "austin", "chicago", "redmond", "boston", "remote"]; 
  return usCityHints.some((c) => loc.includes(c));
}

function locationTier(location: string): number {
  if (isPriorityLocation(location)) return 0;
  if (isUnitedStatesLocation(location)) return 1;
  return 2;
}

function parseExcludeKeywords(value: string): string[] {
  return (value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 30);
}

function parseIncludeKeywords(value: string): string[] {
  return (value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 30);
}

function parseJobTypeKeywords(value: string): string[] {
  return (value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function isIncludedJob(job: RawJob, includeKeywords: string[]): boolean {
  if (includeKeywords.length === 0) return true;
  const haystack = `${job.title} ${job.company} ${job.description}`.toLowerCase();
  return includeKeywords.some((kw) => haystack.includes(kw));
}

function isExcludedJob(job: RawJob, excludeKeywords: string[]): boolean {
  if (excludeKeywords.length === 0) return false;
  const haystack = `${job.title} ${job.company} ${job.description}`.toLowerCase();
  return excludeKeywords.some((kw) => haystack.includes(kw));
}

function canonicalizeLinkedInViewUrl(url: string): string {
  const cleaned = url.trim();
  const idMatch = cleaned.match(/(?:\/jobs\/view\/[^\/?#]*-|\/jobs\/view\/)([0-9]{6,})/i)
    || cleaned.match(/jobPosting:([0-9]{6,})/i);
  if (!idMatch?.[1]) return "";
  return `${LINKEDIN_JOB_VIEW_BASE}${idMatch[1]}`;
}

function parseLinkedInMarkdownFeed(markdown: string): RawJob[] {
  const jobs: RawJob[] = [];
  const entryRegex = /\*\s+\[([^\]]+)\]\((https?:\/\/[^\)]+linkedin\.com\/jobs\/view\/[^\)]+)\)([\s\S]*?)(?=\n\*\s+\[|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(markdown)) !== null) {
    const title = stripHtml(match[1] || "");
    const rawUrl = match[2] || "";
    const block = match[3] || "";
    const company = (block.match(/####\s+\[([^\]]+)\]/i)?.[1] || "LinkedIn").trim();
    const location = (block.match(/\n([^\n]+?)\s{2,}(?:Be an early applicant|\d+\s+(?:minutes?|hours?|days?|weeks?) ago|Actively reviewing applicants|Reposted)/i)?.[1] || "").trim();
    const postedAgeDays = parseRelativePostedAgeDays(block);
    const canonicalUrl = canonicalizeLinkedInViewUrl(rawUrl);
    if (!title || !canonicalUrl) continue;

    jobs.push({
      title,
      company,
      location: location || "Remote",
      url: canonicalUrl,
      description: "",
      postedAgeDays,
    });
  }
  return jobs;
}

function parseRelativePostedAgeDays(text: string): number | undefined {
  const lower = (text || "").toLowerCase();
  if (!lower) return undefined;

  if (/\b(today|just now|moments ago)\b/.test(lower)) return 0;
  if (/\b\d+\+?\s*minutes?\s+ago\b/.test(lower)) return 0;
  if (/\b\d+\+?\s*hours?\s+ago\b/.test(lower)) return 0;

  const dayMatch = lower.match(/\b(\d+)\+?\s*days?\s+ago\b/);
  if (dayMatch?.[1]) return Number(dayMatch[1]);

  const weekMatch = lower.match(/\b(\d+)\+?\s*weeks?\s+ago\b/);
  if (weekMatch?.[1]) return Number(weekMatch[1]) * 7;

  const monthMatch = lower.match(/\b(\d+)\+?\s*months?\s+ago\b/);
  if (monthMatch?.[1]) return Number(monthMatch[1]) * 30;

  const yearMatch = lower.match(/\b(\d+)\+?\s*years?\s+ago\b/);
  if (yearMatch?.[1]) return Number(yearMatch[1]) * 365;

  return undefined;
}

function buildLinkedInKeywords(
  resumes: { skills: string[]; rawText: string }[],
  jobTypeKeywords: string[],
  includeKeywords: string[],
): string {
  const fallbackTypes = ["machine learning", "ai"];
  const roleTerms = jobTypeKeywords.length > 0 ? jobTypeKeywords : fallbackTypes;
  const resumeSkillTerms = Array.from(new Set(resumes.flatMap((r) => r.skills.map((s) => s.toLowerCase())))).slice(0, 6);
  const includeTerms = includeKeywords.slice(0, 6);
  const queryTerms = Array.from(new Set([...roleTerms, ...includeTerms, ...resumeSkillTerms]));
  return queryTerms.join(" ");
}

async function fetchLinkedInSearchJobs(keywords: string, location: string, start: number): Promise<RawJob[]> {
  const params = new URLSearchParams({ keywords, location, start: String(start) });
  const sourceUrl = `${LINKEDIN_GUEST_SEARCH_URL}?${params.toString()}`;
  const proxiedUrl = `${LINKEDIN_READ_PROXY_PREFIX}${sourceUrl.replace(/^https?:\/\//, "")}`;
  const resp = await fetch(proxiedUrl, { headers: LINKEDIN_HEADERS });
  if (!resp.ok) return [];
  const markdown = await resp.text();
  return parseLinkedInMarkdownFeed(markdown);
}

function dedupeJobs(jobs: RawJob[]): RawJob[] {
  const seen = new Set<string>();
  const out: RawJob[] = [];
  for (const job of jobs) {
    const key = `${job.url.toLowerCase()}|${job.title.toLowerCase()}|${job.company.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

async function collectJobsFromLinkedIn(
  resumes: { skills: string[]; rawText: string }[],
  locations: string[],
  recencyDays: number,
  desiredCount: number,
  jobTypeKeywords: string[],
  includeKeywords: string[],
): Promise<RawJob[]> {
  const keywords = buildLinkedInKeywords(resumes, jobTypeKeywords, includeKeywords);
  const targets = Array.from(new Set([...(locations || []), "United States", "Remote"]));
  const jobs: RawJob[] = [];
  for (const target of targets) {
    for (let start = 0; start <= 75; start += 25) {
      const batch = await fetchLinkedInSearchJobs(keywords, target, start);
      if (batch.length === 0) break;
      jobs.push(...batch);
      if (jobs.length >= desiredCount) break;
    }
    if (jobs.length >= desiredCount) break;
  }

  const deduped = dedupeJobs(jobs);

  // Keep collection broad. If strict recency yields too few options, relax rather than failing early.
  const strictDays = Math.max(1, recencyDays);
  const relaxedDays = Math.max(strictDays + 2, strictDays * 3);
  const strictRecent = deduped.filter((j) => j.postedAgeDays === undefined || j.postedAgeDays <= strictDays);
  const relaxedRecent = deduped.filter((j) => j.postedAgeDays === undefined || j.postedAgeDays <= relaxedDays);

  const filtered = strictRecent.length >= Math.max(30, desiredCount / 2)
    ? strictRecent
    : relaxedRecent;

  const prioritized = filtered.filter((j) => locationTier(j.location) === 0);
  const usFallback = filtered.filter((j) => locationTier(j.location) === 1);
  return [...prioritized, ...usFallback];
}

function decodeProofpointV2(value: string): string {
  const withPercents = value
    .replace(/-([0-9a-fA-F]{2})/g, "%$1")
    .replace(/_/g, "/");
  try {
    return decodeURIComponent(withPercents);
  } catch {
    return withPercents;
  }
}

function unwrapProofpointUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname.includes("urldefense.proofpoint.com")) return rawUrl;

    const v2Param = parsed.searchParams.get("u");
    if (v2Param) {
      return decodeProofpointV2(v2Param);
    }

    const v3Match = parsed.pathname.match(/\/v3\/__([^;]+)__;/);
    if (v3Match?.[1]) {
      return decodeURIComponent(v3Match[1]);
    }
  } catch {
    return rawUrl;
  }
  return rawUrl;
}

function normalizeJobUrl(url: string, _title: string, _company: string, _location: string): string {
  const trimmed = (url || "").trim().replace(/[\])},.;]+$/, "");
  const unwrapped = unwrapProofpointUrl(trimmed);
  const withProtocol = unwrapped && /^https?:\/\//i.test(unwrapped)
    ? unwrapped
    : unwrapped.startsWith("www.")
      ? `https://${unwrapped}`
      : "";

  try {
    const parsed = new URL(withProtocol);
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    if (isHttp) {
      return parsed.toString();
    }
  } catch {
    // Fall through to empty link.
  }

  return "";
}

async function runLlmText(settings: { llmProvider: string; llmApiKey: string; llmModel: string }, prompt: string): Promise<string> {
  if (settings.llmProvider === "openai") {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.llmApiKey}` },
      body: JSON.stringify({
        model: settings.llmModel || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI API error: ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || "";
  }

  if (settings.llmProvider === "anthropic") {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.llmApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: settings.llmModel || "claude-3-5-haiku-20241022",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) throw new Error(`Anthropic API error: ${resp.status}`);
    const data = await resp.json();
    return data.content?.[0]?.text || "";
  }

  return generateWithGemini({
    apiKey: settings.llmApiKey,
    preferredModel: settings.llmModel || "gemini-1.5-flash",
    prompt,
  });
}

async function rankJobsWithLLM(
  settings: { llmProvider: string; llmApiKey: string; llmModel: string },
  resumes: { skills: string[]; rawText: string }[],
  jobs: RawJob[],
  maxJobs: number,
  preferences: {
    jobTypeKeywords: string[];
    includeKeywords: string[];
    excludeKeywords: string[];
    experienceFilter: string;
  },
): Promise<RankedJob[]> {
  if (jobs.length === 0) return [];

  const profileSummary = resumes.map(r => r.rawText).join("\n\n").slice(0, 5000);
  const candidateJobs = jobs.slice(0, 300);
  const jobPayload = candidateJobs.map((j, idx) => ({
    index: idx,
    title: j.title,
    company: j.company,
    location: j.location,
    description: j.description.slice(0, 500),
  }));

  const prompt = `You are ranking REAL jobs for a candidate. Do not invent jobs.

CANDIDATE PROFILE:
${profileSummary}

ROLE PREFERENCES:
- Job types to prioritize: ${preferences.jobTypeKeywords.join(", ") || "ai, ml"}
- Must include keywords when possible: ${preferences.includeKeywords.join(", ") || "(none)"}
- Exclude keywords strictly: ${preferences.excludeKeywords.join(", ") || "(none)"}
- Experience preference: ${preferences.experienceFilter || "(not specified)"}

JOBS (JSON):
${JSON.stringify(jobPayload)}

Return ONLY a JSON array of at most ${maxJobs} objects. Each object must be:
- index: integer index from the input jobs
- score: integer 0-100
- matchReason: short reason (max 10 words)

Sort by descending score in your output.`;

  try {
    const content = await runLlmText(settings, prompt);
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON in LLM ranking output");
    const ranking = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(ranking)) throw new Error("Ranking JSON is not an array");

    const ranked: RankedJob[] = [];
    for (const item of ranking) {
      const idx = Number(item?.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= candidateJobs.length) continue;
      const base = candidateJobs[idx];
      ranked.push({
        ...base,
        score: Math.max(0, Math.min(100, Number(item?.score) || 0)),
        matchReason: String(item?.matchReason || generateMatchReason(base.title, base.description)).slice(0, 80),
      });
      if (ranked.length >= maxJobs) break;
    }

    if (ranked.length > 0) return ranked;
  } catch (err) {
    console.warn("LLM ranking failed, falling back to heuristic ranking:", err);
  }

  const allSkills = Array.from(new Set(resumes.flatMap(r => r.skills)));
  return jobs
    .map((j) => ({
      ...j,
      score: computeMatchScore(j.title, j.company, j.description, j.location, allSkills),
      matchReason: generateMatchReason(j.title, j.description),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxJobs);
}

function formatEmailBody(jobs: Array<Omit<Job, "id" | "runId">>): string {
  const lines = [`Here are today's top ${jobs.length} ML job postings matched to your profile:\n`];
  jobs.forEach((job, i) => {
    lines.push(`${i + 1}. ${job.title} | ${job.company} | ${job.location}`);
    if (job.description) lines.push(job.description);
    lines.push(`Match: ${job.matchReason}`);
    if (job.url) lines.push(`Apply: ${job.url}`);
    lines.push("");
  });
  lines.push("Happy job hunting!");
  return lines.join("\n");
}

async function sendEmailSMTP(subject: string, body: string, settings: { smtpEmail: string; smtpPassword: string }, recipients: string[]): Promise<void> {
  // Use nodemailer if available, otherwise log
  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: settings.smtpEmail, pass: settings.smtpPassword },
    });

    await transporter.sendMail({
      from: settings.smtpEmail,
      to: settings.smtpEmail,
      bcc: recipients.join(", "),
      subject,
      text: body,
    });
    console.log("Email sent successfully");
  } catch (err) {
    console.log("Email send attempted (nodemailer may not be installed):", err);
    throw new Error("Email sending failed. Make sure SMTP credentials are configured in Settings.");
  }
}

export async function runPipeline(runId: number): Promise<void> {
  try {
    const settings = await storage.getSettings();
    const llmSettings = resolveLlmSettings(settings);
    const jobTypeKeywords = parseJobTypeKeywords(settings.jobType);
    const includeKeywords = parseIncludeKeywords(settings.includeKeywords);
    const excludeKeywords = parseExcludeKeywords(settings.excludeKeywords);
    const resumes = await storage.getResumes();
    const locations = await storage.getLocations();
    const recipients = await storage.getRecipients();

    if (!llmSettings.llmApiKey) {
      throw new Error(getLlmKeyMissingMessage(llmSettings.llmProvider));
    }

    if (resumes.length === 0) {
      throw new Error("No resumes configured");
    }

    const locationNames = locations.map(l => l.location);

    // Fetch real jobs from LinkedIn guest postings.
    let rawJobs = await collectJobsFromLinkedIn(
      resumes,
      locationNames,
      settings.recencyDays,
      settings.maxJobs * 25,
      jobTypeKeywords,
      includeKeywords,
    );

    const includeFiltered = rawJobs.filter((j) => isIncludedJob(j, includeKeywords));
    const excludeFiltered = includeFiltered.filter((j) => !isExcludedJob(j, excludeKeywords));
    const nonSenior = excludeFiltered.filter((j) => !isSeniorRole(j.title, j.description));

    // Prefer non-senior roles, but don't under-fill the daily top-N if the pool is small.
    rawJobs = nonSenior.length >= settings.maxJobs ? nonSenior : excludeFiltered;

    if (rawJobs.length === 0) {
      throw new Error("No LinkedIn jobs found. Try broadening locations/filters.");
    }

    // Use LLM only for ranking/filtering of real fetched jobs.
    const rankedJobs = await rankJobsWithLLM(
      llmSettings,
      resumes,
      rawJobs,
      settings.maxJobs,
      {
        jobTypeKeywords,
        includeKeywords,
        excludeKeywords,
        experienceFilter: settings.experienceFilter,
      },
    );

    const topJobs = rankedJobs
      .map(j => ({ ...j, url: normalizeJobUrl(j.url, j.title, j.company, j.location) }))
      .filter((j) => locationTier(j.location) <= 1)
      .sort((a, b) => {
        const tierDiff = locationTier(a.location) - locationTier(b.location);
        if (tierDiff !== 0) return tierDiff;
        return b.score - a.score;
      })
      .slice(0, settings.maxJobs);
    const today = new Date().toISOString().split("T")[0];

    // Save jobs to storage
    for (const job of topJobs) {
      await storage.createJob(runId, {
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url || "",
        description: job.description || "",
        matchReason: job.matchReason,
        postedDate: today,
      });
    }

    // Format and send email
    const emailBody = formatEmailBody(topJobs.map(j => ({
      title: j.title, company: j.company, location: j.location,
      url: j.url, description: j.description,
      matchReason: j.matchReason, postedDate: today,
    })));

    const subject = `Daily ML Job Postings - ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

    let emailSent = false;
    if (settings.smtpEmail && settings.smtpPassword && recipients.length > 0) {
      try {
        await sendEmailSMTP(subject, emailBody, settings, recipients.map(r => r.email));
        emailSent = true;
      } catch (err) {
        console.error("Email failed:", err);
      }
    }

    await storage.updateRun(runId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      jobsFound: topJobs.length,
      emailSent,
      emailBody,
    });
  } catch (err: any) {
    console.error("Pipeline error:", err);
    await storage.updateRun(runId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: err.message,
    });
  }
}

export async function resendEmail(runId: number): Promise<void> {
  const run = await storage.getRun(runId);
  if (!run || !run.emailBody) return;

  const settings = await storage.getSettings();
  const recipients = await storage.getRecipients();

  if (!settings.smtpEmail || !settings.smtpPassword) {
    throw new Error("SMTP not configured");
  }

  const subject = `Daily ML Job Postings (Resent) - ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
  await sendEmailSMTP(subject, run.emailBody, settings, recipients.map(r => r.email));
  await storage.updateRun(runId, { emailSent: true });
}
