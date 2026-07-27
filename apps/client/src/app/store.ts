import { create } from "zustand";

export type UserRole = "admin" | "mentor" | "mentee";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  groupId: string | null;
}

interface AuthStore {
  user: AuthUser | null;
  token: string | null;
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  setAuth: (user, token) => set({ user, token }),
  clearAuth: () => set({ user: null, token: null }),
}));
