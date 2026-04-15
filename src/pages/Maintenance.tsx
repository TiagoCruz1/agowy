import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Wrench } from "lucide-react";
import { format, differenceInDays, addDays } from "date-fns";
import { formatBrasilia } from "@/lib/utils";
import { ptBR } from "date-fns/locale";

interface MaintenanceClient {
  clientName: string;
  clientPhone: string | null;
  serviceName: string;
  lastDate: string;
  maintenanceDays: number;
  dueDate: Date;
  daysOverdue: number;
  status: "overdue" | "due_soon" | "ok";
}

export default function Maintenance() {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const userId = effectiveUserId || user?.id;

  const { data: maintenanceList = [], isLoading } = useQuery({
    queryKey: ["maintenance", userId],
    queryFn: async () => {
      const { data: appointments, error } = await supabase
        .from("appointments")
        .select("*, clients(full_name, phone), services(name, maintenance_interval_days)")
        .eq("user_id", userId!)
        .eq("status", "completed")
        .order("start_at", { ascending: false });
      if (error) throw error;

      // Group by client+service, keep only the latest
      const latestMap = new Map<string, any>();
      for (const apt of appointments || []) {
        if (!apt.services?.maintenance_interval_days) continue;
        const key = `${apt.client_id}-${apt.service_id}`;
        if (!latestMap.has(key)) latestMap.set(key, apt);
      }

      const today = new Date();
      const items: MaintenanceClient[] = [];
      for (const apt of latestMap.values()) {
        const days = apt.services.maintenance_interval_days;
        const lastDate = new Date(apt.start_at);
        const dueDate = addDays(lastDate, days);
        const daysOverdue = differenceInDays(today, dueDate);

        let status: "overdue" | "due_soon" | "ok" = "ok";
        if (daysOverdue > 0) status = "overdue";
        else if (daysOverdue > -5) status = "due_soon";

        if (status !== "ok") {
          items.push({
            clientName: apt.clients?.full_name || "—",
            clientPhone: apt.clients?.phone,
            serviceName: apt.services?.name || "—",
            lastDate: apt.start_at,
            maintenanceDays: days,
            dueDate,
            daysOverdue,
            status,
          });
        }
      }

      return items.sort((a, b) => b.daysOverdue - a.daysOverdue);
    },
    enabled: !!userId,
  });

  const overdueCount = maintenanceList.filter(m => m.status === "overdue").length;
  const dueSoonCount = maintenanceList.filter(m => m.status === "due_soon").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Wrench className="w-8 h-8 text-primary" />
          Manutenção
        </h1>
        <p className="text-muted-foreground">Clientes que precisam de manutenção nos serviços</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-destructive/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Atrasadas</CardTitle>
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{overdueCount}</div>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Próximas (5 dias)</CardTitle>
            <Clock className="w-4 h-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{dueSoonCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : maintenanceList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wrench className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Nenhuma manutenção pendente 🎉</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Último Atendimento</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {maintenanceList.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{item.clientName}</TableCell>
                    <TableCell>{item.serviceName}</TableCell>
                    <TableCell>{format(new Date(item.lastDate), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell>{format(item.dueDate, "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell>
                      {item.status === "overdue" ? (
                        <Badge variant="destructive">{item.daysOverdue} dias atrasado</Badge>
                      ) : (
                        <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                          Vence em {Math.abs(item.daysOverdue)} dias
                        </Badge>
                      )}
                    </TableCell>
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
