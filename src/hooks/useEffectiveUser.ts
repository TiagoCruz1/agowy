import { useAuth } from "@/contexts/AuthContext";
import { useAdminContext } from "@/contexts/AdminContext";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * Returns the effective user_id to use for queries.
 * If admin is impersonating someone, returns that user's id.
 * Otherwise returns the logged-in user's id.
 */
export function useEffectiveUser() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { effectiveUserId, impersonatedUser, isImpersonating } = useAdminContext();

  // Verifica se veio do painel admin externo (/admin-tiago)
  const adminImpersonate = sessionStorage.getItem("admin_impersonate");
  const adminImpersonateData = adminImpersonate ? JSON.parse(adminImpersonate) : null;
  const isAdminImpersonate = !!adminImpersonateData?.userId;

  const effectiveId = isAdminImpersonate
    ? adminImpersonateData.userId
    : (isAdmin && isImpersonating ? effectiveUserId : user?.id) || null;

  return {
    effectiveUserId: effectiveId,
    realUserId: user?.id || null,
    isImpersonating: isAdminImpersonate || (isAdmin && isImpersonating),
    impersonatedUser: adminImpersonateData ? {
      userId: adminImpersonateData.userId,
      fullName: adminImpersonateData.name,
      accountType: "studio",
      businessName: adminImpersonateData.name,
    } : impersonatedUser,
  };
}
