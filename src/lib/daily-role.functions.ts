import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DAILY_ROLES = ["Ecocash_Teller", "Agency_Banking_Teller", "Dual_Role_Teller"] as const;
export type DailyRole = (typeof DAILY_ROLES)[number];

export const DAILY_ROLE_LABEL: Record<DailyRole, string> = {
  Ecocash_Teller: "Ecocash Teller",
  Agency_Banking_Teller: "Agency Banking Teller",
  Dual_Role_Teller: "Dual Role Teller",
};

export const getMyDailyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await context.supabase
      .from("daily_teller_assignments" as never)
      .select("assigned_role, business_date, status, branch_id, float_assignment_id, assigned_at")
      .eq("teller_user_id", context.userId)
      .eq("status", "active")
      .eq("business_date", today)
      .maybeSingle();
    if (error && !/relation .* does not exist/.test(error.message)) {
      throw new Error(error.message);
    }
    return (data as { assigned_role: DailyRole } | null) ?? null;
  });

export const assignDailyRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        teller_user_id: z.string().uuid(),
        role: z.enum(DAILY_ROLES),
        branch_id: z.string().uuid().nullable().optional(),
        float_assignment_id: z.string().uuid().nullable().optional(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("assign_daily_role" as never, {
      _teller_user_id: data.teller_user_id,
      _role: data.role,
      _branch_id: data.branch_id ?? null,
      _float_assignment_id: data.float_assignment_id ?? null,
      _notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return row;
  });
