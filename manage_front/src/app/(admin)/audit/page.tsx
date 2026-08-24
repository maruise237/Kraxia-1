"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getAuditLogs } from "@/lib/api";
import type { PaginatedAuditLogs } from "@/types";

const ACTION_OPTIONS = [
  { value: "all", label: "Toutes les opérations" },
  { value: "login", label: "Connexion" },
  { value: "llm_call", label: "Appel LLM" },
  { value: "container_create", label: "Création de conteneur" },
  { value: "container_pause", label: "Pause du conteneur" },
  { value: "container_destroy", label: "Destruction du conteneur" },
];

export default function AuditPage() {
  const [data, setData] = useState<PaginatedAuditLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getAuditLogs(page, 20, undefined, actionFilter === "all" ? undefined : actionFilter));
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Clamp totalPages to at least 1: with total=0 the old expression yielded 0,
  // showing "1 / 0" and breaking the page >= totalPages next-button boundary.
  const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Journal d'audit</h2>

      <div className="flex gap-4 mb-4">
        <Select value={actionFilter} onValueChange={(v: string | null) => { setActionFilter(v ?? "all"); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Toutes les opérations" />
          </SelectTrigger>
          <SelectContent>
            {ACTION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Opération</TableHead>
                <TableHead>Ressource</TableHead>
                <TableHead>Détails</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">
                    {log.created_at ? new Date(log.created_at).toLocaleString("fr-FR") : "-"}
                  </TableCell>
                  <TableCell>{log.username ?? "Système"}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell>{log.resource ?? "-"}</TableCell>
                  <TableCell className="max-w-xs truncate">{log.detail ?? "-"}</TableCell>
                </TableRow>
              ))}
              {data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                    Aucune entrée de journal
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-500">{(data?.total ?? 0).toLocaleString("fr-FR")} entrée(s) au total</p>
            <div className="space-x-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédente</Button>
              <span className="text-sm">{page} / {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Suivante</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
