import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type StaffRole = "admin" | "manager" | "supervisor" | "representative" | "user";

export interface StaffPermissions {
  role: StaffRole | null;
  loading: boolean;
  /** Full control over everything. */
  isAdmin: boolean;
  /** Everything except users & audit log. */
  isManager: boolean;
  /** Bookings tab only. */
  isSupervisor: boolean;
  /** Any staff member who may open the dashboard. */
  isStaff: boolean;
  canManageUsers: boolean;
  canViewAudit: boolean;
  canManageContent: boolean;
  canManageBookings: boolean;
}

/** Role ladder: admin > manager > supervisor > representative. */
export function useStaffRole(): StaffPermissions {
  const [role, setRole] = useState<StaffRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("my_staff_role" as never);
      if (cancelled) return;
      setRole(error ? "user" : ((data as unknown as StaffRole) ?? "user"));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isSupervisor = role === "supervisor";
  return {
    role,
    loading,
    isAdmin,
    isManager,
    isSupervisor,
    isStaff: isAdmin || isManager || isSupervisor,
    canManageUsers: isAdmin,
    canViewAudit: isAdmin,
    canManageContent: isAdmin || isManager,
    canManageBookings: isAdmin || isManager || isSupervisor,
  };
}
