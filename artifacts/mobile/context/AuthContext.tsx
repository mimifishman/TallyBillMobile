import { useAuth as useClerkAuth, useUser } from "@clerk/expo";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  setAuthTokenGetter,
  customFetch,
} from "@workspace/api-client-react";
import {
  getOrCreateGuestOwnerId,
  loadJoinCodesIntoMemory,
  clearGuestBills,
} from "@/utils/guestBillStore";

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
  guestOwnerId: string | null;
  login: (token: string, user: UserInfo) => Promise<void>;
  logout: () => Promise<void>;
  continueAsGuest: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  isGuest: false,
  guestOwnerId: null,
  login: async () => {},
  logout: async () => {},
  continueAsGuest: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, signOut, getToken } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [isGuest, setIsGuest] = useState(false);
  const [guestOwnerId, setGuestOwnerId] = useState<string | null>(null);
  const hasClaimed = useRef(false);

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
    getOrCreateGuestOwnerId().then(setGuestOwnerId);
    loadJoinCodesIntoMemory();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      setIsGuest(false);
      setAuthTokenGetter(() => getToken());

      if (!hasClaimed.current && guestOwnerId) {
        hasClaimed.current = true;
        customFetch("/api/me/claim-guest-bills", {
          method: "POST",
          body: JSON.stringify({ guestOwnerId }),
          headers: { "Content-Type": "application/json" },
        })
          .then(() => clearGuestBills())
          .catch(() => {
            hasClaimed.current = false;
          });
      }
    } else {
      setAuthTokenGetter(() => null);
      hasClaimed.current = false;
    }
  }, [isLoaded, isSignedIn, getToken, guestOwnerId]);

  const login = useCallback(async (_token: string, _user: UserInfo) => {
  }, []);

  const logout = useCallback(async () => {
    setIsGuest(false);
    setAuthTokenGetter(() => null);
    hasClaimed.current = false;
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
        guestOwnerId,
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
