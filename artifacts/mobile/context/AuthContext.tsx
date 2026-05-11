import { useAuth as useClerkAuth, useUser } from "@clerk/expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  getGuestName,
  saveGuestName,
} from "@/utils/guestBillStore";

const GUEST_MODE_KEY = "is_guest_mode";

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
  /** null = never asked; "" = skipped; "John" = real name */
  guestName: string | null;
  saveGuestName: (name: string) => Promise<void>;
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
  guestName: null,
  saveGuestName: async () => {},
  login: async () => {},
  logout: async () => {},
  continueAsGuest: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, signOut, getToken } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [isGuest, setIsGuest] = useState(false);
  const [guestOwnerId, setGuestOwnerId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [storageLoaded, setStorageLoaded] = useState(false);
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
    async function init() {
      const [guestId, guestMode, storedName] = await Promise.all([
        getOrCreateGuestOwnerId(),
        AsyncStorage.getItem(GUEST_MODE_KEY),
        getGuestName(),
      ]);
      setGuestOwnerId(guestId);
      if (guestMode === "true") {
        setIsGuest(true);
      }
      setGuestName(storedName);
      loadJoinCodesIntoMemory();
      setStorageLoaded(true);
    }
    void init();
  }, []);

  useEffect(() => {
    if (!isLoaded || !storageLoaded) return;
    if (isSignedIn) {
      setIsGuest(false);
      void AsyncStorage.removeItem(GUEST_MODE_KEY);
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
  }, [isLoaded, isSignedIn, getToken, guestOwnerId, storageLoaded]);

  const login = useCallback(async (_token: string, _user: UserInfo) => {
  }, []);

  const logout = useCallback(async () => {
    setIsGuest(false);
    void AsyncStorage.removeItem(GUEST_MODE_KEY);
    setAuthTokenGetter(() => null);
    hasClaimed.current = false;
    await signOut();
  }, [signOut]);

  const continueAsGuest = useCallback(() => {
    setIsGuest(true);
    void AsyncStorage.setItem(GUEST_MODE_KEY, "true");
    setAuthTokenGetter(() => null);
  }, []);

  const handleSaveGuestName = useCallback(async (name: string) => {
    setGuestName(name);
    await saveGuestName(name);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token: null,
        isLoading: !isLoaded || !storageLoaded,
        isGuest,
        guestOwnerId,
        guestName,
        saveGuestName: handleSaveGuestName,
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
