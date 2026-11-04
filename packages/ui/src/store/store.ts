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
    _hasHydrated: boolean;
    user: AuthUser | null;
    token: string | null;
    setHasHydrated: (v: boolean) => void;
    setAuth: (user: AuthUser, token: string) => void;
    setToken: (token: string) => void;
    updateUser: (partial: Partial<AuthUser>) => void;
    clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>()(
    persist(
        (set) => ({
            _hasHydrated: false,
            user: null,
            token: null,
            setHasHydrated: (v) => set({ _hasHydrated: v }),
            setAuth: (user, token) => {
                localStorage.setItem("auth_token", token);
                set({ user, token });
            },
            setToken: (token) => {
                localStorage.setItem("auth_token", token);
                set({ token });
            },
            updateUser: (partial) =>
                set((s) => ({
                    user: s.user ? { ...s.user, ...partial } : null,
                })),
            clearAuth: () => {
                localStorage.removeItem("auth_token");
                set({ user: null, token: null });
            },
        }),
        {
            name: "auth_store",
            storage: createJSONStorage(() => localStorage),
            // _hasHydrated는 런타임 전용 — persist 대상에서 제외
            partialize: (state) => ({ user: state.user, token: state.token }),
            onRehydrateStorage: () => (state) => {
                if (state?.token) localStorage.setItem("auth_token", state.token);
                state?.setHasHydrated(true);
            },
        },
    ),
);
