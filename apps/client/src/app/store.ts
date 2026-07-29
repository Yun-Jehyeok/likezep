import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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
  updateUser: (partial: Partial<AuthUser>) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        sessionStorage.setItem("auth_token", token);
        set({ user, token });
      },
      updateUser: (partial) =>
        set((s) => ({ user: s.user ? { ...s.user, ...partial } : null })),
      clearAuth: () => {
        sessionStorage.removeItem("auth_token");
        set({ user: null, token: null });
      },
    }),
    {
      name: "auth_store",
      storage: createJSONStorage(() => sessionStorage),
      // 복구 시 auth_token도 sessionStorage에 재동기화
      onRehydrateStorage: () => (state) => {
        if (state?.token) sessionStorage.setItem("auth_token", state.token);
      },
    }
  )
);
