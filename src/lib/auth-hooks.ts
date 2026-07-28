import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, loading };
}

export type Role = "admin" | "tesoureiro" | "secretario" | "irmao";

export function useRoles() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["user_roles", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Role[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.role);
    },
  });
}

export function useCan() {
  const { data: roles = [] } = useRoles();
  const has = (r: Role) => roles.includes(r);
  return {
    roles,
    isAdmin: has("admin"),
    isTesoureiro: has("admin") || has("tesoureiro"),
    isSecretario: has("admin") || has("secretario"),
    canManageIrmaos: has("admin") || has("secretario"),
    canManageFinancas: has("admin") || has("tesoureiro"),
  };
}
