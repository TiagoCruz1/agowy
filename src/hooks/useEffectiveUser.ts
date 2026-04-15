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

  return {
    effectiveUserId: (isAdmin && isImpersonating ? effectiveUserId : user?.id) || null,
    realUserId: user?.id || null,
    isImpersonating: isAdmin && isImpersonating,
    impersonatedUser,
  };
}
