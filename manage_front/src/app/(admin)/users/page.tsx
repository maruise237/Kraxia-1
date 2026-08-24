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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { getUsers, updateUser, resetPassword, createUser } from "@/lib/api";
import type { UserSummary, PaginatedUsers } from "@/types";
import { toast } from "sonner";

export default function UsersPage() {
  const [data, setData] = useState<PaginatedUsers | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  // Edit dialog
  const [editUser, setEditUser] = useState<UserSummary | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editTier, setEditTier] = useState("");
  //dedicated = mode conteneur dédié, shared = mode conteneur partagé
  const [editRuntimeMode, setEditRuntimeMode] = useState("dedicated");
  const [editActive, setEditActive] = useState(true);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState("user");
  const [createTier, setCreateTier] = useState("free");
  const [createRuntimeMode, setCreateRuntimeMode] = useState("dedicated");

  // Password dialog
  const [pwdUser, setPwdUser] = useState<UserSummary | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getUsers(page, 20, search);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function openEdit(user: UserSummary) {
    setEditUser(user);
    setEditRole(user.role);
    setEditTier(user.quota_tier);
    setEditRuntimeMode(user.runtime_mode || "dedicated");
    setEditActive(user.is_active);
  }

  async function handleSaveEdit() {
    if (!editUser) return;
    try {
      await updateUser(editUser.id, {
        role: editRole,
        quota_tier: editTier,
        runtime_mode: editRuntimeMode,
        is_active: editActive,
      });
      toast.success("Utilisateur mis à jour");
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      toast.error("Échec de la mise à jour", { description: err instanceof Error ? err.message : "" });
    }
  }

  async function handleCreateUser() {
    if (!createUsername.trim() || !createEmail.trim() || !createPassword) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }
    if (createPassword.length < 8) {
      toast.error("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }
    try {
      await createUser({
        username: createUsername.trim(),
        email: createEmail.trim(),
        password: createPassword,
        role: createRole,
        quota_tier: createTier,
        runtime_mode: createRuntimeMode,
      });
      toast.success("Utilisateur créé");
      setShowCreate(false);
      setCreateUsername("");
      setCreateEmail("");
      setCreatePassword("");
      setCreateRole("user");
      setCreateTier("free");
      setCreateRuntimeMode("dedicated");
      fetchUsers();
    } catch (err) {
      toast.error("Échec de la création", { description: err instanceof Error ? err.message : "" });
    }
  }

  async function handleResetPassword() {
    if (!pwdUser) return;
    if (newPassword.length < 8) {
      toast.error("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }
    try {
      await resetPassword(pwdUser.id, newPassword);
      toast.success("Mot de passe réinitialisé");
      setPwdUser(null);
      setNewPassword("");
    } catch (err) {
      toast.error("Échec de la réinitialisation", { description: err instanceof Error ? err.message : "" });
    }
  }

  // Clamp totalPages to at least 1: with total=0 the old expression yielded 0,
  // showing "1 / 0" and breaking the page >= totalPages next-button boundary.
  const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Gestion des utilisateurs</h2>

      <div className="mb-4 flex items-center gap-4">
        <Input
          placeholder="Rechercher par nom d'utilisateur ou e-mail..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
        <Button onClick={() => setShowCreate(true)}>Ajouter un utilisateur</Button>
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom d'utilisateur</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Quota</TableHead>
                <TableHead>Mode d'exécution</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Consommation du jour</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.quota_tier}</TableCell>
                  <TableCell>
                    <Badge variant={user.runtime_mode === "shared" ? "secondary" : "outline"}>
                      {user.runtime_mode}
                    </Badge>
                    {user.shared_agent_id ? (
                      <div className="text-xs text-muted-foreground mt-1">
                        {user.shared_agent_id}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.is_active ? "default" : "destructive"}>
                      {user.is_active ? "Actif" : "Désactivé"}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.tokens_used_today.toLocaleString("fr-FR")}</TableCell>
                  <TableCell>{user.created_at ? new Date(user.created_at).toLocaleDateString("fr-FR") : "-"}</TableCell>
                  <TableCell className="space-x-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(user)}>Modifier</Button>
                    <Button size="sm" variant="outline" onClick={() => setPwdUser(user)}>Réinitialiser le mot de passe</Button>
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

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l'utilisateur : {editUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rôle</Label>
              <Select value={editRole} onValueChange={(v: string | null) => v && setEditRole(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Niveau de quota</Label>
              <Select value={editTier} onValueChange={(v: string | null) => v && setEditTier(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">free</SelectItem>
                  <SelectItem value="basic">basic</SelectItem>
                  <SelectItem value="pro">pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mode d'exécution</Label>
              <Select value={editRuntimeMode} onValueChange={(v: string | null) => v && setEditRuntimeMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dedicated">dedicated</SelectItem>
                  <SelectItem value="shared">shared</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label>Statut du compte</Label>
              <Select value={editActive ? "active" : "disabled"} onValueChange={(v: string | null) => setEditActive(v === "active")}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Actif</SelectItem>
                  <SelectItem value="disabled">Désactivé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Annuler</Button>
            <Button onClick={handleSaveEdit}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) { setShowCreate(false); setCreateUsername(""); setCreateEmail(""); setCreatePassword(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un utilisateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nom d'utilisateur *</Label>
              <Input value={createUsername} onChange={(e) => setCreateUsername(e.target.value)} placeholder="Nom d'utilisateur" />
            </div>
            <div>
              <Label>E-mail *</Label>
              <Input value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="email@example.com" />
            </div>
            <div>
              <Label>Mot de passe *</Label>
              <Input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} placeholder="Au moins 8 caractères" />
            </div>
            <div>
              <Label>Rôle</Label>
              <Select value={createRole} onValueChange={(v: string | null) => v && setCreateRole(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Niveau de quota</Label>
              <Select value={createTier} onValueChange={(v: string | null) => v && setCreateTier(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">free</SelectItem>
                  <SelectItem value="basic">basic</SelectItem>
                  <SelectItem value="pro">pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mode d'exécution</Label>
              <Select value={createRuntimeMode} onValueChange={(v: string | null) => v && setCreateRuntimeMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dedicated">dedicated</SelectItem>
                  <SelectItem value="shared">shared</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setCreateUsername(""); setCreateEmail(""); setCreatePassword(""); }}>Annuler</Button>
            <Button onClick={handleCreateUser}>Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={!!pwdUser} onOpenChange={(open) => { if (!open) { setPwdUser(null); setNewPassword(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe : {pwdUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nouveau mot de passe</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Au moins 8 caractères"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPwdUser(null); setNewPassword(""); }}>Annuler</Button>
            <Button onClick={handleResetPassword}>Confirmer la réinitialisation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
