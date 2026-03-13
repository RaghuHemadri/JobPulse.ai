import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, X, MapPin } from "lucide-react";
import type { Location } from "@shared/schema";
import { useState } from "react";

export default function Locations() {
  const { toast } = useToast();
  const [newLoc, setNewLoc] = useState("");

  const query = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const locations = query.data || [];

  const createMutation = useMutation({
    mutationFn: (location: string) => apiRequest("POST", "/api/locations", { location }),
    onSuccess: () => {
      toast({ title: "Location added" });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setNewLoc("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/locations/${id}`),
    onSuccess: () => {
      toast({ title: "Location removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
    },
  });

  function handleAdd() {
    if (!newLoc.trim()) return;
    createMutation.mutate(newLoc.trim());
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Locations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Target job locations for search filtering</p>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-2 mb-4">
            <Input
              value={newLoc}
              onChange={(e) => setNewLoc(e.target.value)}
              placeholder="e.g. San Francisco Bay Area"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="max-w-sm"
              data-testid="input-location"
            />
            <Button onClick={handleAdd} disabled={createMutation.isPending} data-testid="button-add-location">
              <Plus className="w-4 h-4 mr-2" /> Add
            </Button>
          </div>

          {locations.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <MapPin className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
              No locations configured.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {locations.map((loc) => (
                <Badge
                  key={loc.id}
                  variant="secondary"
                  className="text-sm py-1.5 px-3 flex items-center gap-1.5"
                  data-testid={`badge-location-${loc.id}`}
                >
                  <MapPin className="w-3 h-3" />
                  {loc.location}
                  <button
                    onClick={() => deleteMutation.mutate(loc.id)}
                    className="ml-1 hover:text-destructive transition-colors"
                    data-testid={`button-delete-location-${loc.id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
