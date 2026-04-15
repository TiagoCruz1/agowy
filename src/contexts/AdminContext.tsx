import { createContext, useContext, useState, ReactNode } from "react";

interface ImpersonatedUser {
  userId: string;
  fullName: string;
  accountType: string;
  businessName?: string;
}

interface AdminContextType {
  impersonatedUser: ImpersonatedUser | null;
  setImpersonatedUser: (user: ImpersonatedUser | null) => void;
  effectiveUserId: string | null;
  isImpersonating: boolean;
}

const AdminContext = createContext<AdminContextType>({
  impersonatedUser: null,
  setImpersonatedUser: () => {},
  effectiveUserId: null,
  isImpersonating: false,
});

export const useAdminContext = () => useContext(AdminContext);

export function AdminProvider({ children, realUserId }: { children: ReactNode; realUserId: string | null }) {
  const [impersonatedUser, setImpersonatedUser] = useState<ImpersonatedUser | null>(null);

  return (
    <AdminContext.Provider value={{
      impersonatedUser,
      setImpersonatedUser,
      effectiveUserId: impersonatedUser?.userId || realUserId,
      isImpersonating: !!impersonatedUser,
    }}>
      {children}
    </AdminContext.Provider>
  );
}
