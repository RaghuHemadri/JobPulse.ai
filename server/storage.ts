import type {
  Resume, InsertResume,
  Recipient, InsertRecipient,
  Location, InsertLocation,
  PipelineRun, Job, Settings, UpdateSettings, Stats,
} from "@shared/schema";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const STATE_FILE = join(DATA_DIR, "app-state.json");

type PersistedState = {
  resumes: Resume[];
  recipients: Recipient[];
  locations: Location[];
  runs: PipelineRun[];
  jobs: Job[];
  settings: Settings;
  nextId: { resume: number; recipient: number; location: number; run: number; job: number };
};

export interface IStorage {
  // Resumes
  getResumes(): Promise<Resume[]>;
  createResume(data: InsertResume): Promise<Resume>;
  deleteResume(id: number): Promise<void>;
  // Recipients
  getRecipients(): Promise<Recipient[]>;
  createRecipient(data: InsertRecipient): Promise<Recipient | null>;
  deleteRecipient(id: number): Promise<void>;
  // Locations
  getLocations(): Promise<Location[]>;
  createLocation(data: InsertLocation): Promise<Location | null>;
  deleteLocation(id: number): Promise<void>;
  // Runs
  getRuns(): Promise<PipelineRun[]>;
  getRun(id: number): Promise<PipelineRun | undefined>;
  createRun(): Promise<PipelineRun>;
  updateRun(id: number, data: Partial<PipelineRun>): Promise<void>;
  // Jobs
  getJobsByRun(runId: number): Promise<Job[]>;
  createJob(runId: number, data: Omit<Job, "id" | "runId">): Promise<Job>;
  // Settings
  getSettings(): Promise<Settings>;
  updateSettings(data: UpdateSettings): Promise<Settings>;
  // Stats
  getStats(): Promise<Stats>;
}

export class MemStorage implements IStorage {
  private resumes: Map<number, Resume> = new Map();
  private recipients: Map<number, Recipient> = new Map();
  private locations: Map<number, Location> = new Map();
  private runs: Map<number, PipelineRun> = new Map();
  private jobs: Map<number, Job> = new Map();
  private settings: Settings;
  private nextId = { resume: 1, recipient: 1, location: 1, run: 1, job: 1 };

  constructor() {
    this.settings = this.getDefaultSettings();

    this.loadPersistedState();
  }

  private getDefaultSettings(): Settings {
    return {
      scheduleHour: 3,
      scheduleMinute: 0,
      scheduleEnabled: false,
      maxJobs: 20,
      experienceFilter: "MS degree, ≤3 years experience",
      jobType: "ai, ml",
      includeKeywords: "",
      excludeKeywords: "",
      recencyDays: 7,
      llmProvider: "openai",
      llmApiKey: "",
      llmModel: "gpt-4o-mini",
      smtpEmail: "",
      smtpPassword: "",
    };
  }

  private toPersistedState(): PersistedState {
    return {
      resumes: Array.from(this.resumes.values()),
      recipients: Array.from(this.recipients.values()),
      locations: Array.from(this.locations.values()),
      runs: Array.from(this.runs.values()),
      jobs: Array.from(this.jobs.values()),
      settings: { ...this.settings },
      nextId: { ...this.nextId },
    };
  }

  private loadPersistedState() {
    try {
      if (!existsSync(STATE_FILE)) return;

      const raw = readFileSync(STATE_FILE, "utf-8");
      const parsed = JSON.parse(raw) as Partial<PersistedState>;

      if (Array.isArray(parsed.resumes)) {
        this.resumes = new Map(parsed.resumes.map((item) => [item.id, item]));
      }
      if (Array.isArray(parsed.recipients)) {
        this.recipients = new Map(parsed.recipients.map((item) => [item.id, item]));
      }
      if (Array.isArray(parsed.locations)) {
        this.locations = new Map(parsed.locations.map((item) => [item.id, item]));
      }
      if (Array.isArray(parsed.runs)) {
        this.runs = new Map(parsed.runs.map((item) => [item.id, item]));
      }
      if (Array.isArray(parsed.jobs)) {
        this.jobs = new Map(parsed.jobs.map((item) => [item.id, item]));
      }

      if (parsed.settings) {
        this.settings = { ...this.getDefaultSettings(), ...parsed.settings };
      }

      if (parsed.nextId) {
        this.nextId = {
          resume: Number(parsed.nextId.resume) || this.nextId.resume,
          recipient: Number(parsed.nextId.recipient) || this.nextId.recipient,
          location: Number(parsed.nextId.location) || this.nextId.location,
          run: Number(parsed.nextId.run) || this.nextId.run,
          job: Number(parsed.nextId.job) || this.nextId.job,
        };
      }

      // Ensure IDs continue correctly even if nextId in file is stale.
      this.nextId.resume = Math.max(this.nextId.resume, this.getNextMapId(this.resumes));
      this.nextId.recipient = Math.max(this.nextId.recipient, this.getNextMapId(this.recipients));
      this.nextId.location = Math.max(this.nextId.location, this.getNextMapId(this.locations));
      this.nextId.run = Math.max(this.nextId.run, this.getNextMapId(this.runs));
      this.nextId.job = Math.max(this.nextId.job, this.getNextMapId(this.jobs));
    } catch (err) {
      console.error("Failed to load persisted app state:", err);
    }
  }

  private getNextMapId<T extends { id: number }>(map: Map<number, T>): number {
    const items = Array.from(map.values());
    const maxId = items.reduce((max, item) => (item.id > max ? item.id : max), 0);
    return maxId + 1;
  }

  private savePersistedState() {
    try {
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }

      const tempFile = `${STATE_FILE}.tmp`;
      writeFileSync(tempFile, JSON.stringify(this.toPersistedState(), null, 2), "utf-8");
      renameSync(tempFile, STATE_FILE);
    } catch (err) {
      console.error("Failed to persist app state:", err);
    }
  }

  // ---- Resumes ----
  async getResumes() { return Array.from(this.resumes.values()).sort((a, b) => b.id - a.id); }
  async createResume(data: InsertResume): Promise<Resume> {
    const id = this.nextId.resume++;
    const resume: Resume = { id, ...data, addedAt: new Date().toISOString() };
    this.resumes.set(id, resume);
    this.savePersistedState();
    return resume;
  }
  async deleteResume(id: number) {
    this.resumes.delete(id);
    this.savePersistedState();
  }

  // ---- Recipients ----
  async getRecipients() { return Array.from(this.recipients.values()).sort((a, b) => b.id - a.id); }
  async createRecipient(data: InsertRecipient): Promise<Recipient | null> {
    const existing = Array.from(this.recipients.values()).find(r => r.email === data.email);
    if (existing) return null;
    const id = this.nextId.recipient++;
    const rec: Recipient = { id, email: data.email, type: data.type || "bcc", addedAt: new Date().toISOString() };
    this.recipients.set(id, rec);
    this.savePersistedState();
    return rec;
  }
  async deleteRecipient(id: number) {
    this.recipients.delete(id);
    this.savePersistedState();
  }

  // ---- Locations ----
  async getLocations() { return Array.from(this.locations.values()).sort((a, b) => b.id - a.id); }
  async createLocation(data: InsertLocation): Promise<Location | null> {
    const existing = Array.from(this.locations.values()).find(l => l.location === data.location);
    if (existing) return null;
    const id = this.nextId.location++;
    const loc: Location = { id, location: data.location, addedAt: new Date().toISOString() };
    this.locations.set(id, loc);
    this.savePersistedState();
    return loc;
  }
  async deleteLocation(id: number) {
    this.locations.delete(id);
    this.savePersistedState();
  }

  // ---- Runs ----
  async getRuns() { return Array.from(this.runs.values()).sort((a, b) => b.id - a.id); }
  async getRun(id: number) { return this.runs.get(id); }
  async createRun(): Promise<PipelineRun> {
    const id = this.nextId.run++;
    const run: PipelineRun = {
      id, status: "running", startedAt: new Date().toISOString(),
      completedAt: null, jobsFound: 0, emailSent: false, emailBody: null, error: null,
    };
    this.runs.set(id, run);
    this.savePersistedState();
    return run;
  }
  async updateRun(id: number, data: Partial<PipelineRun>) {
    const run = this.runs.get(id);
    if (run) {
      this.runs.set(id, { ...run, ...data });
      this.savePersistedState();
    }
  }

  // ---- Jobs ----
  async getJobsByRun(runId: number) {
    return Array.from(this.jobs.values()).filter(j => j.runId === runId).sort((a, b) => a.id - b.id);
  }
  async createJob(runId: number, data: Omit<Job, "id" | "runId">): Promise<Job> {
    const id = this.nextId.job++;
    const job: Job = { id, runId, ...data };
    this.jobs.set(id, job);
    this.savePersistedState();
    return job;
  }

  // ---- Settings ----
  async getSettings() { return { ...this.settings }; }
  async updateSettings(data: UpdateSettings): Promise<Settings> {
    this.settings = { ...this.settings, ...data };
    this.savePersistedState();
    return { ...this.settings };
  }

  // ---- Stats ----
  async getStats(): Promise<Stats> {
    const runs = Array.from(this.runs.values());
    const total = runs.length;
    const completed = runs.filter(r => r.status === "completed").length;
    const totalJobs = runs.reduce((s, r) => s + r.jobsFound, 0);
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    let nextRun = "Disabled";
    if (this.settings.scheduleEnabled) {
      const h = this.settings.scheduleHour.toString().padStart(2, "0");
      const m = this.settings.scheduleMinute.toString().padStart(2, "0");
      nextRun = `Daily at ${h}:${m} PT`;
    }

    return { totalRuns: total, totalJobs, successRate, nextRun };
  }
}

export const storage = new MemStorage();
