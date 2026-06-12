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

export type DailyRoleRow = {
  assigned_role: DailyRole;
  business_date: string;
  status: string;
  branch_id: string | null;
  float_assignment_id: string | null;
  assigned_at: string;
} | null;

export const getMyDailyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DailyRoleRow> => {
    const today = new Date().toISOString().slice(0, 10);
    // Table is not yet in generated types; cast through unknown
    const db = context.supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              eq: (c: string, v: string) => {
                maybeSingle: () => Promise<{
                  data: DailyRoleRow;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
    try {
      const { data, error } = await db
        .from("daily_teller_assignments")
        .select("assigned_role, business_date, status, branch_id, float_assignment_id, assigned_at")
        .eq("teller_user_id", context.userId)
        .eq("status", "active")
        .eq("business_date", today)
        .maybeSingle();
      if (error) {
        // Table not yet created (migration pending) or any read failure — degrade gracefully
        console.warn("[getMyDailyRole] read failed, returning null:", error);
        return null;
      }
      return data ?? null;
    } catch (e) {
      console.warn("[getMyDailyRole] exception, returning null:", e);
      return null;
    }
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
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const rpc = context.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const { error } = await rpc("assign_daily_role", {
      _teller_user_id: data.teller_user_id,
      _role: data.role,
      _branch_id: data.branch_id ?? null,
      _float_assignment_id: data.float_assignment_id ?? null,
      _notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
