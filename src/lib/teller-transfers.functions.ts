import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TransferStatus = "pending" | "approved" | "rejected" | "cancelled";

export type TellerTransfer = {
  id: string;
  reference_code: string;
  requesting_user_id: string;
  sending_user_id: string;
  requesting_username: string | null;
  sending_username: string | null;
  currency: "USD";
  amount: number;
  reason: string | null;
  status: TransferStatus;
  branch_id: string | null;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  rejection_reason: string | null;
  request_device: string | null;
  approval_device: string | null;
};

export type TransferTeller = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  day_open: boolean;
};

function ipFromRequest(): string | null {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? null;
  } catch {
    return null;
  }
}

async function joinUsernames(rows: any[]): Promise<TellerTransfer[]> {
  const ids = new Set<string>();
  rows.forEach((r) => {
    ids.add(r.requesting_user_id);
    ids.add(r.sending_user_id);
  });
  if (!ids.size) return [];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, username, display_name")
    .in("user_id", Array.from(ids));
  const map = new Map<string, string>();
  (profiles ?? []).forEach((p: any) =>
    map.set(p.user_id, p.username || p.display_name || "—"),
  );
  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
    requesting_username: map.get(r.requesting_user_id) ?? null,
    sending_username: map.get(r.sending_user_id) ?? null,
  })) as TellerTransfer[];
}

export const listOpenTellers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TransferTeller[]> => {
    const uid = context.userId;
    const { data: sessions } = await supabaseAdmin
      .from("teller_sessions")
      .select("user_id")
      .eq("status", "open");
    const openIds = (sessions ?? []).map((s: any) => s.user_id).filter((id: string) => id !== uid);
    if (!openIds.length) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, username, display_name, day_open")
      .in("user_id", openIds);
    return ((profiles ?? []) as any[]).map((p) => ({
      user_id: p.user_id,
      username: p.username,
      display_name: p.display_name,
      day_open: p.day_open,
    }));
  });

export const listTransfers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TellerTransfer[]> => {
    const uid = context.userId;
    const { data } = await supabaseAdmin
      .from("teller_transfers")
      .select("*")
      .or(`requesting_user_id.eq.${uid},sending_user_id.eq.${uid}`)
      .order("requested_at", { ascending: false })
      .limit(500);
    return joinUsernames(data ?? []);
  });

export const requestTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sendingUserId: z.string().uuid(),
        amount: z.number().positive().max(1_000_000),
        reason: z.string().trim().min(1).max(500),
        device: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ip = ipFromRequest();
    const { data: row, error } = await context.supabase.rpc("request_teller_transfer", {
      _sending_user: data.sendingUserId as never,
      _amount: data.amount,
      _reason: data.reason as never,
      _device: (data.device ?? null) as never,
      _ip: ip as never,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const approveTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), device: z.string().trim().max(300).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ip = ipFromRequest();
    const { data: row, error } = await context.supabase.rpc("approve_teller_transfer", {
      _id: data.id as never,
      _device: (data.device ?? null) as never,
      _ip: ip as never,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const rejectTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(1).max(500),
        device: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ip = ipFromRequest();
    const { data: row, error } = await context.supabase.rpc("reject_teller_transfer", {
      _id: data.id as never,
      _reason: data.reason as never,
      _device: (data.device ?? null) as never,
      _ip: ip as never,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const cancelTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), device: z.string().trim().max(300).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ip = ipFromRequest();
    const { data: row, error } = await context.supabase.rpc("cancel_teller_transfer", {
      _id: data.id as never,
      _device: (data.device ?? null) as never,
      _ip: ip as never,
    });
    if (error) throw new Error(error.message);
    return row;
  });
