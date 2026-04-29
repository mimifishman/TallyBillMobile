import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Platform } from "react-native";
import { setAuthTokenGetter } from "@workspace/api-client-react";

interface UserInfo {
  id: number;
  email: string;
  displayName: string;
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

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

async function storeToken(token: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

async function getStoredToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function removeToken() {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
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
  const [user, setUser] = useState<UserInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await getStoredToken();
        const storedUser = await AsyncStorage.getItem(USER_KEY);
        if (storedToken && storedUser) {
          const parsedUser = JSON.parse(storedUser) as UserInfo;
          setToken(storedToken);
          setUser(parsedUser);
          setAuthTokenGetter(() => storedToken);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (newToken: string, newUser: UserInfo) => {
    await storeToken(newToken);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setIsGuest(false);
    setAuthTokenGetter(() => newToken);
  }, []);

  const logout = useCallback(async () => {
    await removeToken();
    await AsyncStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setIsGuest(false);
    setAuthTokenGetter(() => null);
  }, []);

  const continueAsGuest = useCallback(() => {
    setIsGuest(true);
    setAuthTokenGetter(() => null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isGuest, login, logout, continueAsGuest }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
