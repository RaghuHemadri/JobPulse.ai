import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Mail } from "lucide-react";
import type { Recipient } from "@shared/schema";
import { useState } from "react";

export default function Recipients() {
  const { toast } = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const query = useQuery<Recipient[]>({ queryKey: ["/api/recipients"] });
  const recipients = query.data || [];

  const createMutation = useMutation({
    mutationFn: (email: string) => apiRequest("POST", "/api/recipients", { email, type: "bcc" }),
    onSuccess: () => {
      toast({ title: "Recipient added" });
      queryClient.invalidateQueries({ queryKey: ["/api/recipients"] });
      setNewEmail("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/recipients/${id}`),
    onSuccess: () => {
      toast({ title: "Recipient removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/recipients"] });
      setDeleteId(null);
    },
  });

  function handleAdd() {
    if (!newEmail.trim() || !newEmail.includes("@")) return;
    createMutation.mutate(newEmail.trim());
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Recipients</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage email recipients for daily job alerts</p>
      </div>

      {/* Add recipient */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-2">
            <Input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@example.com"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="max-w-sm"
              data-testid="input-recipient-email"
            />
            <Button onClick={handleAdd} disabled={createMutation.isPending} data-testid="button-add-recipient">
              <Plus className="w-4 h-4 mr-2" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recipients list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Mail className="w-4 h-4" /> BCC Recipients
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recipients.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No recipients yet. Add one above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => (
                  <TableRow key={r.id} data-testid={`row-recipient-${r.id}`}>
                    <TableCell className="text-sm font-medium">{r.email}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">BCC</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.addedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setDeleteId(r.id)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        data-testid={`button-delete-recipient-${r.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Recipient</AlertDialogTitle>
            <AlertDialogDescription>This recipient will no longer receive daily job emails.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
