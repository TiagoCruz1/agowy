import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Shield, Users, Store, User } from "lucide-react";
import { Navigate } from "react-router-dom";

export default function Admin() {
  const { isAdmin, isLoading: roleLoading } = useUserRole();

  const { data: allProfiles = [], isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const { data: allRoles = [] } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { count: totalUsers } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      const { count: totalAppointments } = await supabase
        .from("appointments")
        .select("*", { count: "exact", head: true });
      const { count: totalClients } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true });
      return { totalUsers: totalUsers || 0, totalAppointments: totalAppointments || 0, totalClients: totalClients || 0 };
    },
    enabled: isAdmin,
  });

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const getRolesForUser = (userId: string) =>
    allRoles.filter((r: any) => r.user_id === userId).map((r: any) => r.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="w-8 h-8 text-primary" />
          Painel Admin
        </h1>
        <p className="text-muted-foreground">
          Visão geral de todos os estúdios e manicures. Use o seletor "Trocar Visão" no menu lateral para visualizar os dados de qualquer estúdio ou manicure.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Usuários</CardTitle>
            <Users className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.totalUsers || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Agendamentos</CardTitle>
            <Store className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.totalAppointments || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Clientes</CardTitle>
            <User className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats?.totalClients || 0}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estúdios e Manicures</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Negócio</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Telefone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allProfiles.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.full_name}</TableCell>
                    <TableCell>{p.business_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={p.account_type === "studio" ? "default" : "secondary"}>
                        {p.account_type === "studio" ? "Estúdio" : "Solo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {getRolesForUser(p.user_id).map((role: string) => (
                        <Badge key={role} variant="outline" className="mr-1">
                          {role}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell>{p.phone || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
