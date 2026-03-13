import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, FileText, Sparkles, Loader2, User } from "lucide-react";
import type { Resume } from "@shared/schema";
import { useState } from "react";

export default function Resumes() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [parseMode, setParseMode] = useState<"manual" | "ai">("manual");
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [mergeExplicitSkills, setMergeExplicitSkills] = useState(true);
  const [parsing, setParsing] = useState(false);

  const [form, setForm] = useState({ name: "", email: "", filename: "", skills: "" });

  const resumesQuery = useQuery<Resume[]>({ queryKey: ["/api/resumes"] });
  const resumes = resumesQuery.data || [];

  const createMutation = useMutation({
    mutationFn: (data: { name: string; email: string; filename: string; skills: string[]; rawText: string }) =>
      apiRequest("POST", "/api/resumes", data),
    onSuccess: () => {
      toast({ title: "Resume added" });
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
      setShowAdd(false);
      resetForm();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/resumes/${id}`),
    onSuccess: () => {
      toast({ title: "Resume deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
      setDeleteId(null);
    },
  });

  function resetForm() {
    setForm({ name: "", email: "", filename: "", skills: "" });
    setResumeText("");
    setResumeFile(null);
    setMergeExplicitSkills(true);
    setParseMode("manual");
  }

  async function handleParse() {
    if (!resumeText.trim()) return;
    setParsing(true);
    try {
      const res = await apiRequest("POST", "/api/parse-resume", {
        text: resumeText,
        mergeExplicitSkills,
      });
      const data = await res.json();
      setForm({
        name: data.name || "",
        email: data.email || "",
        filename: "uploaded_resume.pdf",
        skills: (data.skills || []).join(", "),
      });
      toast({ title: "Parsed", description: "Resume fields extracted with AI" });
    } catch (err: any) {
      toast({ title: "Parse failed", description: err.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }

  async function handleParsePdf() {
    if (!resumeFile) return;
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", resumeFile);
      formData.append("mergeExplicitSkills", String(mergeExplicitSkills));
      const res = await fetch("/api/parse-resume-file", { method: "POST", body: formData });
      if (!res.ok) {
        const text = (await res.text()) || "Failed to parse PDF";
        throw new Error(text);
      }
      const data = await res.json();
      setForm({
        name: data.name || "",
        email: data.email || "",
        filename: resumeFile.name,
        skills: (data.skills || []).join(", "),
      });
      toast({ title: "Parsed", description: "PDF extracted and parsed with AI" });
    } catch (err: any) {
      toast({ title: "Parse failed", description: err.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }

  function handleSubmit() {
    const skills = form.skills.split(",").map(s => s.trim()).filter(Boolean);
    createMutation.mutate({
      name: form.name, email: form.email,
      filename: form.filename || "resume.pdf",
      skills, rawText: resumeText || `${form.name}. Skills: ${form.skills}`,
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Resumes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage candidate profiles for job matching</p>
        </div>
        <Button onClick={() => { resetForm(); setShowAdd(true); }} data-testid="button-add-resume">
          <Plus className="w-4 h-4 mr-2" /> Add Resume
        </Button>
      </div>

      {resumes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <User className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
            No resumes yet. Add one to start matching jobs.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {resumes.map((resume) => (
            <Card key={resume.id} data-testid={`card-resume-${resume.id}`}>
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{resume.name}</p>
                      <p className="text-xs text-muted-foreground">{resume.email}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setDeleteId(resume.id)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    data-testid={`button-delete-resume-${resume.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="w-3 h-3" />
                  {resume.filename}
                </div>
                <div className="flex flex-wrap gap-1">
                  {resume.skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-xs font-normal">
                      {skill}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Added {new Date(resume.addedAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Resume Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">Add Resume</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={parseMode === "manual" ? "default" : "outline"}
                size="sm" onClick={() => setParseMode("manual")}
                className="text-xs"
              >
                Manual Entry
              </Button>
              <Button
                variant={parseMode === "ai" ? "default" : "outline"}
                size="sm" onClick={() => setParseMode("ai")}
                className="text-xs"
              >
                <Sparkles className="w-3 h-3 mr-1" /> AI Parse
              </Button>
            </div>

            {parseMode === "ai" && (
              <div className="space-y-2">
                <Label className="text-xs">Paste resume text</Label>
                <Textarea
                  value={resumeText} onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste the full resume text here..."
                  className="min-h-[120px] text-xs"
                  data-testid="input-resume-text"
                />
                <Button size="sm" onClick={handleParse} disabled={parsing || !resumeText.trim()} className="text-xs">
                  {parsing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                  Extract Fields
                </Button>

                <div className="pt-2 border-t">
                  <Label className="text-xs">Or upload PDF</Label>
                  <Input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                    className="text-xs mt-1"
                    data-testid="input-resume-pdf"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      id="merge-explicit-skills"
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={mergeExplicitSkills}
                      onChange={(e) => setMergeExplicitSkills(e.target.checked)}
                    />
                    <Label htmlFor="merge-explicit-skills" className="text-xs text-muted-foreground">
                      Merge explicit Skills section terms
                    </Label>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleParsePdf}
                    disabled={parsing || !resumeFile}
                    className="text-xs mt-2"
                    data-testid="button-parse-resume-pdf"
                  >
                    {parsing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                    Extract From PDF
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" data-testid="input-resume-name" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" data-testid="input-resume-email" />
              </div>
              <div>
                <Label className="text-xs">Filename</Label>
                <Input value={form.filename} onChange={(e) => setForm({ ...form, filename: e.target.value })} placeholder="resume.pdf" data-testid="input-resume-filename" />
              </div>
              <div>
                <Label className="text-xs">Skills (comma-separated)</Label>
                <Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="PyTorch, NLP, LLMs, RAG..." data-testid="input-resume-skills" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!form.name || !form.email || createMutation.isPending} data-testid="button-submit-resume">
              {createMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Resume</AlertDialogTitle>
            <AlertDialogDescription>Are you sure? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
