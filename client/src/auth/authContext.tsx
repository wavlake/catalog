import useAuth from "@/auth/useAuth";
import { User } from "firebase/auth";
import { createContext, useContext } from "react";

export interface AuthContext {
  user?: User | null;
  logOut?: () => Promise<{ success: boolean; error?: string; }>;
  logInEmail?: (email: string, password: string) => Promise<{ success: boolean; error?: string; }>;
};

export const AuthContext = createContext<AuthContext>({
  user: undefined,
  logOut: undefined,
  logInEmail: undefined,
  // logInGoogle: undefined,
  // logInTwitter: undefined,
  // createEmailUser: undefined,
  // handleSendEmailVerification: undefined,
  // handleVerifyEmail: undefined,
  
});

export function AuthProvider({ children }: {children: React.ReactNode}) {
  const authMethods = useAuth();
  console.log('authprovier', authMethods);
  return (
    <AuthContext.Provider value={authMethods}>{children}</AuthContext.Provider>
  );
}

export const useAuthContext = () => useContext(AuthContext);
