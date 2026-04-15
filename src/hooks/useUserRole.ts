import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useUserRole() {
  const { user } = useAuth();

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["user-roles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data.map((r: any) => r.role as string);
    },
    enabled: !!user,
  });

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile-type", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("account_type, business_name, full_name")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const isLoading = rolesLoading || profileLoading;

  return {
    roles,
    isAdmin: roles.includes("admin"),
    isStudioOwner: roles.includes("studio_owner") || profile?.account_type === "studio",
    isSolo: profile?.account_type === "solo" && !roles.includes("studio_owner"),
    accountType: profile?.account_type,
    profile,
    isLoading,
    isManicure: roles.includes("manicure"),
  };
}
