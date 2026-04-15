import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Clock, Save } from "lucide-react";

const DAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

const DEFAULT_HOURS = [
  { day_of_week: 0, is_open: false, open_time: "08:00", close_time: "18:00" },
  { day_of_week: 1, is_open: true, open_time: "08:00", close_time: "18:00" },
  { day_of_week: 2, is_open: true, open_time: "08:00", close_time: "18:00" },
  { day_of_week: 3, is_open: true, open_time: "08:00", close_time: "18:00" },
  { day_of_week: 4, is_open: true, open_time: "08:00", close_time: "18:00" },
  { day_of_week: 5, is_open: true, open_time: "08:00", close_time: "18:00" },
  { day_of_week: 6, is_open: true, open_time: "08:00", close_time: "12:00" },
];

interface HourEntry {
  day_of_week: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
}

interface StaffOption {
  user_id: string;
  full_name: string;
  is_active: boolean;
}

function getBrasiliaTodayInputValue() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";

  return `${year}-${month}-${day}`;
}

function getDayOfWeekFromDateInput(dateValue: string) {
  return new Date(`${dateValue}T12:00:00-03:00`).getDay();
}

function createHoursForDate(dateValue: string, weeklyHours: HourEntry[]) {
  const dayOfWeek = getDayOfWeekFromDateInput(dateValue);
  const weekDayHours = weeklyHours.find((hour) => hour.day_of_week === dayOfWeek);

  return {
    day_of_week: dayOfWeek,
    is_open: weekDayHours?.is_open ?? false,
    open_time: weekDayHours?.open_time ?? "08:00",
    close_time: weekDayHours?.close_time ?? "18:00",
  };
}

function isMissingRelationError(error: any) {
  return (
    error?.code === "42P01" ||
    error?.message?.includes("Could not find the table") ||
    error?.message?.includes("does not exist")
  );
}

function isRlsError(error: any) {
  return (
    error?.code === "42501" ||
    error?.message?.toLowerCase().includes("row-level security") ||
    error?.message?.toLowerCase().includes("permission denied")
  );
}

export default function WorkingHours() {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const { isStudioOwner, profile } = useUserRole();
  const userId = effectiveUserId || user?.id;
  const queryClient = useQueryClient();
  const [hours, setHours] = useState<HourEntry[]>(DEFAULT_HOURS);
  const [selectedTargetUserId, setSelectedTargetUserId] = useState<string | null>(userId || null);
  const [selectedDate, setSelectedDate] = useState(getBrasiliaTodayInputValue());
  const [dateHours, setDateHours] = useState<HourEntry>(createHoursForDate(getBrasiliaTodayInputValue(), DEFAULT_HOURS));

  const { data: ownerProfile } = useQuery({
    queryKey: ["working-hours-owner-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, business_name")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user && isStudioOwner,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["working-hours-staff", ownerProfile?.id],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("studio_manicures")
        .select("manicure_user_id, is_active")
        .eq("studio_profile_id", ownerProfile!.id);
      if (error) throw error;

      if (!links || links.length === 0) return [];

      const userIds = links.map((link: any) => link.manicure_user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      if (profilesError) throw profilesError;

      return (profiles || []).map((staffProfile: any) => ({
        user_id: staffProfile.user_id,
        full_name: staffProfile.full_name,
        is_active: links.find((link: any) => link.manicure_user_id === staffProfile.user_id)?.is_active ?? false,
      })) as StaffOption[];
    },
    enabled: !!ownerProfile?.id && isStudioOwner,
  });

  useEffect(() => {
    if (!userId) return;

    if (!isStudioOwner) {
      setSelectedTargetUserId(userId);
      return;
    }

    if (!selectedTargetUserId) {
      setSelectedTargetUserId(userId);
    }
  }, [isStudioOwner, selectedTargetUserId, userId]);

  useEffect(() => {
    if (!selectedTargetUserId) return;
    if (selectedTargetUserId === userId) return;
    if (!staff.some((person) => person.user_id === selectedTargetUserId)) {
      setSelectedTargetUserId(userId || null);
    }
  }, [selectedTargetUserId, staff, userId]);

  const { data: savedHours, isLoading } = useQuery({
    queryKey: ["working-hours", selectedTargetUserId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("working_hours")
          .select("*")
          .eq("user_id", selectedTargetUserId!)
          .order("day_of_week");
        if (error) throw error;
        return data;
      } catch (error: any) {
        if (isRlsError(error)) {
          toast.error("O banco ainda não recebeu a policy nova de horários. Aplicar a migration do Supabase resolve isso.");
          return [];
        }

        throw error;
      }
    },
    enabled: !!selectedTargetUserId,
  });

  const { data: savedDateOverride, isLoading: isLoadingDateOverride } = useQuery({
    queryKey: ["working-hours-override", selectedTargetUserId, selectedDate],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("working_hours_overrides")
          .select("*")
          .eq("user_id", selectedTargetUserId!)
          .eq("work_date", selectedDate)
          .maybeSingle();
        if (error) throw error;
        return data;
      } catch (error: any) {
        if (isMissingRelationError(error)) {
          return null;
        }

        throw error;
      }
    },
    enabled: !!selectedTargetUserId && !!selectedDate,
  });

  useEffect(() => {
    if (savedHours && savedHours.length > 0) {
      setHours(
        DEFAULT_HOURS.map((dh) => {
          const saved = savedHours.find((s: any) => s.day_of_week === dh.day_of_week);
          if (saved) {
            return {
              day_of_week: saved.day_of_week,
              is_open: saved.is_open,
              open_time: saved.open_time?.slice(0, 5) || "08:00",
              close_time: saved.close_time?.slice(0, 5) || "18:00",
            };
          }
          return dh;
        })
      );
    } else {
      setHours(DEFAULT_HOURS);
    }
  }, [savedHours]);

  useEffect(() => {
    if (savedDateOverride) {
      setDateHours({
        day_of_week: getDayOfWeekFromDateInput(selectedDate),
        is_open: savedDateOverride.is_open,
        open_time: savedDateOverride.open_time?.slice(0, 5) || "08:00",
        close_time: savedDateOverride.close_time?.slice(0, 5) || "18:00",
      });
      return;
    }

    setDateHours(createHoursForDate(selectedDate, hours));
  }, [hours, savedDateOverride, selectedDate]);

  const selectedOwnerName = selectedTargetUserId === userId ? profile?.full_name || "Meu horário" : staff.find((person) => person.user_id === selectedTargetUserId)?.full_name || "Funcionária";

  const targetOptions = [
    { value: userId || "", label: "Meu horário" },
    ...staff.map((person) => ({
      value: person.user_id,
      label: `${person.full_name}${person.is_active ? "" : " (inativa)"}`,
    })),
  ].filter((option, index, array) => option.value && array.findIndex((item) => item.value === option.value) === index);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTargetUserId) return;

      // Upsert all 7 days
      for (const h of hours) {
        const { error } = await supabase
          .from("working_hours")
          .upsert(
            { user_id: selectedTargetUserId, ...h },
            { onConflict: "user_id,day_of_week" }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["working-hours"] });
      toast.success("Horários salvos com sucesso!");
    },
    onError: (err: any) => {
      if (isRlsError(err)) {
        toast.error("Falha ao salvar porque a policy de horários ainda não foi aplicada no banco.");
        return;
      }

      toast.error(err.message);
    },
  });

  const saveDateOverrideMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTargetUserId) return;

      const { error } = await supabase
        .from("working_hours_overrides")
        .upsert(
          {
            user_id: selectedTargetUserId,
            work_date: selectedDate,
            is_open: dateHours.is_open,
            open_time: dateHours.open_time,
            close_time: dateHours.close_time,
          },
          { onConflict: "user_id,work_date" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["working-hours-override"] });
      toast.success("Horário do dia salvo com sucesso!");
    },
    onError: (err: any) => {
      if (isMissingRelationError(err)) {
        toast.error("A tabela de exceções de horário ainda não existe nesse banco. A migration precisa ser aplicada.");
        return;
      }

      toast.error(err.message);
    },
  });

  const updateDay = (dayIndex: number, field: keyof HourEntry, value: any) => {
    setHours((prev) =>
      prev.map((h) => (h.day_of_week === dayIndex ? { ...h, [field]: value } : h))
    );
  };

  const updateSelectedDateHour = (field: keyof HourEntry, value: any) => {
    setDateHours((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Horários de Atendimento</h1>
          <p className="text-muted-foreground">
            Defina os horários em que cada pessoa está disponível para atender
          </p>
        </div>
        {isStudioOwner && (
          <div className="w-full md:w-80 space-y-2">
            <Label htmlFor="schedule-owner-target">Selecionar horário</Label>
            <select
              id="schedule-owner-target"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedTargetUserId || ""}
              onChange={(e) => setSelectedTargetUserId(e.target.value)}
            >
              {targetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !selectedTargetUserId}>
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? "Salvando..." : "Salvar semana"}
        </Button>
      </div>

      {isStudioOwner && (
        <Card className="border-dashed">
          <CardContent className="py-4 text-sm text-muted-foreground">
            Editando horários de <strong className="text-foreground">{selectedOwnerName}</strong>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {DAYS.map((day) => {
          const h = hours.find((h) => h.day_of_week === day.value)!;
          return (
            <Card key={day.value} className={!h.is_open ? "opacity-60" : ""}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="w-40">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={h.is_open}
                      onCheckedChange={(checked) => updateDay(day.value, "is_open", checked)}
                    />
                    <span className="font-medium">{day.label}</span>
                  </div>
                </div>
                {h.is_open && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <Input
                      type="time"
                      value={h.open_time}
                      onChange={(e) => updateDay(day.value, "open_time", e.target.value)}
                      className="w-32"
                    />
                    <span className="text-muted-foreground">até</span>
                    <Input
                      type="time"
                      value={h.close_time}
                      onChange={(e) => updateDay(day.value, "close_time", e.target.value)}
                      className="w-32"
                    />
                  </div>
                )}
                {!h.is_open && (
                  <span className="text-sm text-muted-foreground">Fechado</span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Horário de um dia específico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[220px_1fr] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="specific-day">Data</Label>
              <Input
                id="specific-day"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              Ao mudar a data, o horário atual já aparece automaticamente. Se não houver exceção salva, o sistema usa o horário semanal desse dia.
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center">
            <div className="min-w-40">
              <div className="flex items-center gap-3">
                <Switch
                  checked={dateHours.is_open}
                  onCheckedChange={(checked) => updateSelectedDateHour("is_open", checked)}
                />
                <span className="font-medium">Dia aberto</span>
              </div>
            </div>

            {dateHours.is_open ? (
              <div className="flex flex-wrap items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <Input
                  type="time"
                  value={dateHours.open_time}
                  onChange={(e) => updateSelectedDateHour("open_time", e.target.value)}
                  className="w-32"
                />
                <span className="text-muted-foreground">até</span>
                <Input
                  type="time"
                  value={dateHours.close_time}
                  onChange={(e) => updateSelectedDateHour("close_time", e.target.value)}
                  className="w-32"
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Fechado nesse dia</span>
            )}

            <div className="md:ml-auto">
              <Button onClick={() => saveDateOverrideMutation.mutate()} disabled={saveDateOverrideMutation.isPending || !selectedTargetUserId}>
                <Save className="w-4 h-4 mr-2" />
                {saveDateOverrideMutation.isPending ? "Salvando..." : "Salvar dia"}
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {isLoadingDateOverride
              ? "Carregando horário salvo..."
              : savedDateOverride
                ? "Há uma exceção salva para esta data."
                : "Nenhuma exceção salva para esta data. O horário exibido vem da configuração semanal."}
          </p>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            💡 <strong>Dica:</strong> use a grade semanal para a rotina padrão e a seção de dia específico para ajustes pontuais, folgas ou mudanças de turno.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
