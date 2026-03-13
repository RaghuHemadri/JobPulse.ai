import { z } from "zod";

// ---- Resume ----
export interface Resume {
  id: number;
  name: string;
  email: string;
  filename: string;
  skills: string[];
  rawText: string;
  addedAt: string;
}

export const insertResumeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  filename: z.string().min(1),
  skills: z.array(z.string()),
  rawText: z.string().default(""),
});
export type InsertResume = z.infer<typeof insertResumeSchema>;

// ---- Recipient ----
export interface Recipient {
  id: number;
  email: string;
  type: string;
  addedAt: string;
}

export const insertRecipientSchema = z.object({
  email: z.string().email(),
  type: z.string().default("bcc"),
});
export type InsertRecipient = z.infer<typeof insertRecipientSchema>;

// ---- Location ----
export interface Location {
  id: number;
  location: string;
  addedAt: string;
}

export const insertLocationSchema = z.object({
  location: z.string().min(1),
});
export type InsertLocation = z.infer<typeof insertLocationSchema>;

// ---- Pipeline Run ----
export interface PipelineRun {
  id: number;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  jobsFound: number;
  emailSent: boolean;
  emailBody: string | null;
  error: string | null;
}

// ---- Job ----
export interface Job {
  id: number;
  runId: number;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  matchReason: string;
  postedDate: string;
}

// ---- Settings ----
export interface Settings {
  scheduleHour: number;
  scheduleMinute: number;
  scheduleEnabled: boolean;
  maxJobs: number;
  experienceFilter: string;
  includeKeywords: string;
  excludeKeywords: string;
  recencyDays: number;
  llmProvider: string;
  llmApiKey: string;
  llmModel: string;
  smtpEmail: string;
  smtpPassword: string;
}

export const updateSettingsSchema = z.object({
  scheduleHour: z.number().min(0).max(23).optional(),
  scheduleMinute: z.number().min(0).max(59).optional(),
  scheduleEnabled: z.boolean().optional(),
  maxJobs: z.number().min(1).max(50).optional(),
  experienceFilter: z.string().optional(),
  includeKeywords: z.string().optional(),
  excludeKeywords: z.string().optional(),
  recencyDays: z.number().min(1).max(30).optional(),
  llmProvider: z.string().optional(),
  llmApiKey: z.string().optional(),
  llmModel: z.string().optional(),
  smtpEmail: z.string().optional(),
  smtpPassword: z.string().optional(),
});
export type UpdateSettings = z.infer<typeof updateSettingsSchema>;

// ---- Stats ----
export interface Stats {
  totalRuns: number;
  totalJobs: number;
  successRate: number;
  nextRun: string;
}
