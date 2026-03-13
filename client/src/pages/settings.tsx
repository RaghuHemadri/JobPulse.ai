import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, Brain, Mail, Clock, Filter, Loader2 } from "lucide-react";
import type { Settings } from "@shared/schema";
import { useState, useEffect } from "react";

const LLM_PROVIDERS = [
  { value: "openai", label: "OpenAI", models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"] },
  { value: "anthropic", label: "Anthropic", models: ["claude-3-5-haiku-20241022", "claude-3-5-sonnet-20241022", "claude-3-opus-20240229"] },
  { value: "gemini", label: "Google Gemini", models: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"] },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const settingsQuery = useQuery<Settings>({ queryKey: ["/api/settings"] });
  const settings = settingsQuery.data;

  const [form, setForm] = useState<Partial<Settings>>({});
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [smtpPasswordInput, setSmtpPasswordInput] = useState("");

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Settings>) => apiRequest("PATCH", "/api/settings", data),
    onSuccess: () => {
      toast({ title: "Settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setApiKeyInput("");
      setSmtpPasswordInput("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function handleSave() {
    const data: any = { ...form };
    // Only send API key if user typed a new one
    if (apiKeyInput) data.llmApiKey = apiKeyInput;
    else delete data.llmApiKey;
    if (smtpPasswordInput) data.smtpPassword = smtpPasswordInput;
    else delete data.smtpPassword;
    updateMutation.mutate(data);
  }

  const currentProvider = LLM_PROVIDERS.find(p => p.value === form.llmProvider) || LLM_PROVIDERS[0];

  if (!settings) {
    return <div className="p-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure pipeline, LLM, email, and scheduler</p>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-settings">
          {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save
        </Button>
      </div>

      {/* LLM Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Brain className="w-4 h-4" /> LLM Configuration
          </CardTitle>
          <CardDescription className="text-xs">Select your AI provider for resume parsing and job matching</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Provider</Label>
              <Select
                value={form.llmProvider || "openai"}
                onValueChange={(v) => {
                  const prov = LLM_PROVIDERS.find(p => p.value === v);
                  setForm({ ...form, llmProvider: v, llmModel: prov?.models[0] || "" });
                }}
              >
                <SelectTrigger data-testid="select-llm-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LLM_PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Model</Label>
              <Select
                value={form.llmModel || currentProvider.models[0]}
                onValueChange={(v) => setForm({ ...form, llmModel: v })}
              >
                <SelectTrigger data-testid="select-llm-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currentProvider.models.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">API Key</Label>
            <Input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={settings.llmApiKey ? `Current: ${settings.llmApiKey}` : "Enter API key"}
              data-testid="input-llm-api-key"
            />
            <p className="text-xs text-muted-foreground mt-1">Leave blank to keep existing key</p>
          </div>
        </CardContent>
      </Card>

      {/* Email / SMTP */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Mail className="w-4 h-4" /> Email (SMTP)
          </CardTitle>
          <CardDescription className="text-xs">Gmail credentials for sending job alerts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Gmail Address</Label>
            <Input
              value={form.smtpEmail || ""}
              onChange={(e) => setForm({ ...form, smtpEmail: e.target.value })}
              placeholder="your-email@gmail.com"
              data-testid="input-smtp-email"
            />
          </div>
          <div>
            <Label className="text-xs">App Password</Label>
            <Input
              type="password"
              value={smtpPasswordInput}
              onChange={(e) => setSmtpPasswordInput(e.target.value)}
              placeholder={settings.smtpPassword ? `Current: ${settings.smtpPassword}` : "Gmail App Password"}
              data-testid="input-smtp-password"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Generate at myaccount.google.com/apppasswords
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Scheduler */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" /> Scheduler
          </CardTitle>
          <CardDescription className="text-xs">Automated daily pipeline execution</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs">Enable Scheduler</Label>
              <p className="text-xs text-muted-foreground">Run pipeline automatically every day</p>
            </div>
            <Switch
              checked={form.scheduleEnabled || false}
              onCheckedChange={(v) => setForm({ ...form, scheduleEnabled: v })}
              data-testid="switch-schedule-enabled"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Hour (0-23, PT)</Label>
              <Input
                type="number" min={0} max={23}
                value={form.scheduleHour ?? 3}
                onChange={(e) => setForm({ ...form, scheduleHour: parseInt(e.target.value) || 0 })}
                data-testid="input-schedule-hour"
              />
            </div>
            <div>
              <Label className="text-xs">Minute (0-59)</Label>
              <Input
                type="number" min={0} max={59}
                value={form.scheduleMinute ?? 0}
                onChange={(e) => setForm({ ...form, scheduleMinute: parseInt(e.target.value) || 0 })}
                data-testid="input-schedule-minute"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Filter className="w-4 h-4" /> Job Filters
          </CardTitle>
          <CardDescription className="text-xs">Control what jobs are matched</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Max Jobs per Email</Label>
            <Input
              type="number" min={1} max={50}
              value={form.maxJobs ?? 20}
              onChange={(e) => setForm({ ...form, maxJobs: parseInt(e.target.value) || 20 })}
              data-testid="input-max-jobs"
            />
          </div>
          <div>
            <Label className="text-xs">Experience Filter</Label>
            <Input
              value={form.experienceFilter || ""}
              onChange={(e) => setForm({ ...form, experienceFilter: e.target.value })}
              placeholder="MS degree, ≤3 years experience"
              data-testid="input-experience-filter"
            />
          </div>
          <div>
            <Label className="text-xs">Include Keywords</Label>
            <Input
              value={form.includeKeywords || ""}
              onChange={(e) => setForm({ ...form, includeKeywords: e.target.value })}
              placeholder="machine learning, ai"
              data-testid="input-include-keywords"
            />
            <p className="text-xs text-muted-foreground mt-1">Comma-separated terms. Jobs must contain at least one term when set.</p>
          </div>
          <div>
            <Label className="text-xs">Exclude Keywords</Label>
            <Input
              value={form.excludeKeywords || ""}
              onChange={(e) => setForm({ ...form, excludeKeywords: e.target.value })}
              placeholder="intern, contract, staff"
              data-testid="input-exclude-keywords"
            />
            <p className="text-xs text-muted-foreground mt-1">Comma-separated terms. Jobs containing any term are excluded.</p>
          </div>
          <div>
            <Label className="text-xs">Recency Window (days)</Label>
            <Select
              value={String(form.recencyDays ?? 7)}
              onValueChange={(v) => setForm({ ...form, recencyDays: parseInt(v) })}
            >
              <SelectTrigger data-testid="select-recency-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="3">3 days</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
