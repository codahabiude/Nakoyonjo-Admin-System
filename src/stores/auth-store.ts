import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "TEACHER" | "PARENT";
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!data.ok) return false;

      const { token, user } = data;
      localStorage.setItem("nakoyonjo_token", token);
      localStorage.setItem(
        "nakoyonjo_user",
        JSON.stringify(user)
      );
      set({ user, token, isAuthenticated: true });
      return true;
    } catch {
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem("nakoyonjo_token");
    localStorage.removeItem("nakoyonjo_user");
    set({ user: null, token: null, isAuthenticated: false });
  },

  hydrate: () => {
    const token = localStorage.getItem("nakoyonjo_token");
    const raw = localStorage.getItem("nakoyonjo_user");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          localStorage.removeItem("nakoyonjo_token");
          localStorage.removeItem("nakoyonjo_user");
          return set({ user: null, token: null, isAuthenticated: false });
        }
      } catch {
        localStorage.removeItem("nakoyonjo_token");
        localStorage.removeItem("nakoyonjo_user");
        return set({ user: null, token: null, isAuthenticated: false });
      }
    }
    if (token && raw) {
      try {
        const user = JSON.parse(raw);
        set({ user, token, isAuthenticated: true });
      } catch {
        get().logout();
      }
    }
  },
}));
