import { useAuth as useClerkAuth, useUser } from "@clerk/expo";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export interface UserInfo {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
}

interface AuthContextType {
  user: UserInfo | null;
  token: string | null;
  isLoading: boolean;
  isGuest: boolean;
  login: (token: string, user: UserInfo) => Promise<void>;
  logout: () => Promise<void>;
  continueAsGuest: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  isGuest: false,
  login: async () => {},
  logout: async () => {},
  continueAsGuest: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, signOut, getToken } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [isGuest, setIsGuest] = useState(false);

  const user: UserInfo | null =
    isSignedIn && clerkUser
      ? {
          id: clerkUser.id,
          email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
          displayName:
            clerkUser.fullName ||
            clerkUser.firstName ||
            clerkUser.username ||
            "User",
          firstName: clerkUser.firstName ?? null,
          lastName: clerkUser.lastName ?? null,
        }
      : null;

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      setIsGuest(false);
      setAuthTokenGetter(() => getToken());
    } else {
      setAuthTokenGetter(() => null);
    }
  }, [isLoaded, isSignedIn, getToken]);

  const login = useCallback(async (_token: string, _user: UserInfo) => {
  }, []);

  const logout = useCallback(async () => {
    setIsGuest(false);
    setAuthTokenGetter(() => null);
    await signOut();
  }, [signOut]);

  const continueAsGuest = useCallback(() => {
    setIsGuest(true);
    setAuthTokenGetter(() => null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token: null,
        isLoading: !isLoaded,
        isGuest,
        login,
        logout,
        continueAsGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
