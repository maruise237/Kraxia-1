"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { getUsers, pauseContainer, resumeContainer, destroyContainer, syncAllContainerStatuses } from "@/lib/api";
import type { UserSummary, PaginatedUsers } from "@/types";
import { toast } from "sonner";

export default function ContainersPage() {
  const [data, setData] = useState<PaginatedUsers | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ user: UserSummary; type: "pause" | "resume" | "destroy" } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getUsers(page, 20, search));
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleConfirm() {
    if (!confirmAction) return;
    try {
      if (confirmAction.type === "pause") {
        await pauseContainer(confirmAction.user.id);
        toast.success("Conteneur en pause");
      } else if (confirmAction.type === "resume") {
        await resumeContainer(confirmAction.user.id);
        toast.success("Conteneur repris");
      } else {
        await destroyContainer(confirmAction.user.id);
        toast.success("Conteneur détruit");
      }
      setConfirmAction(null);
      fetchData();
    } catch (err) {
      toast.error("Échec de l'opération", { description: err instanceof Error ? err.message : "" });
    }
  }

  const statusVariant = (s: string | null): "default" | "secondary" | "destructive" | "outline" => {
    switch (s) {
      case "running": return "default";
      case "paused": return "secondary";
      case "stopped": return "destructive";
      default: return "outline";
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncAllContainerStatuses();
      toast.success(result.message);
      fetchData();
    } catch (err) {
      toast.error("Échec de la synchronisation", { description: err instanceof Error ? err.message : "" });
    } finally {
      setSyncing(false);
    }
  };

  // Clamp totalPages to at least 1: with total=0 the old expression yielded 0,
  // showing "1 / 0" and breaking the page >= totalPages next-button boundary.
  const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Gestion des conteneurs</h2>
        <Button 
          variant="outline" 
          onClick={handleSync} 
          disabled={syncing}
        >
          {syncing ? "Synchronisation..." : "Rafraîchir les statuts"}
        </Button>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Rechercher par nom d'utilisateur, e-mail ou ID Docker..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom d'utilisateur</TableHead>
                <TableHead>Statut du conteneur</TableHead>
                <TableHead>ID Docker</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>
                    {user.container_status ? (
                      <Badge variant={statusVariant(user.container_status)}>{user.container_status}</Badge>
                    ) : (
                      <span className="text-gray-400">Aucun conteneur</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {user.container_docker_id ? user.container_docker_id.substring(0, 12) : "-"}
                  </TableCell>
                  <TableCell>
                    {user.container_created_at ? new Date(user.container_created_at).toLocaleString("fr-FR") : "-"}
                  </TableCell>
                  <TableCell className="space-x-2">
                    {user.container_status === "running" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmAction({ user, type: "pause" })}
                      >
                        Mettre en pause
                      </Button>
                    )}
                    {(user.container_status === "paused" || user.container_status === "stopped") && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => setConfirmAction({ user, type: "resume" })}
                      >
                        Reprendre
                      </Button>
                    )}
                    {user.container_status && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setConfirmAction({ user, type: "destroy" })}
                      >
                        Détruire
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-500">{(data?.total ?? 0).toLocaleString("fr-FR")} utilisateur(s) au total</p>
            <div className="space-x-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédente</Button>
              <span className="text-sm">{page} / {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Suivante</Button>
            </div>
          </div>
        </>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Confirmer la {confirmAction?.type === "pause" ? "mise en pause" : confirmAction?.type === "resume" ? "reprise" : "destruction"} du conteneur
            </DialogTitle>
          </DialogHeader>
          <p>
            Voulez-vous vraiment {confirmAction?.type === "pause" ? "mettre en pause" : confirmAction?.type === "resume" ? "reprendre" : "détruire"} le conteneur de l'utilisateur
            <strong> {confirmAction?.user.username} </strong>
            ?
            {confirmAction?.type === "destroy" && (
              <span className="text-red-500 block mt-2">Cette action est irréversible.</span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Annuler</Button>
            <Button
              variant={confirmAction?.type === "destroy" ? "destructive" : "default"}
              onClick={handleConfirm}
            >
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
