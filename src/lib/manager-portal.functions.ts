import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertManager(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("manager") && !roles.includes("admin")) {
    throw new Error("Manager role required");
  }
}

export type TellerCard = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  full_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  opening_float: number;
  current_balance: number;
  status: "open_day" | "ecocash" | "closed" | "offline";
  variance_status: "balanced" | "pending" | "variance" | "none";
  last_activity: string | null;
  open_time: string | null;
  close_time: string | null;
  session_code: string | null;
  ecocash_session_code: string | null;
  balancing_status: "pending" | "in_review" | "balanced" | null;
  variance_usd: number | null;
};

async function buildTellerCards(businessDate: string | null): Promise<TellerCard[]> {
  // Pull all teller profiles (anyone with the 'teller' role OR any active session today)
  const { data: roleRows } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["teller", "finance_manager", "admin"]);
  const tellerIds = Array.from(new Set((roleRows ?? []).map((r: any) => r.user_id as string)));

  if (tellerIds.length === 0) return [];

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, username, display_name, full_name, branch_id")
    .in("user_id", tellerIds);

  const branchIds = Array.from(
    new Set((profiles ?? []).map((p: any) => p.branch_id).filter(Boolean) as string[]),
  );
  const { data: branches } = branchIds.length
    ? await supabaseAdmin.from("branches").select("id, name").in("id", branchIds)
    : { data: [] as any[] };
  const branchMap = new Map((branches ?? []).map((b: any) => [b.id, b.name]));

  const dateFilter = businessDate ?? new Date().toISOString().slice(0, 10);
  const dayStart = `${dateFilter}T00:00:00.000Z`;
  const dayEnd = `${dateFilter}T23:59:59.999Z`;

  // Sessions for the day
  const [{ data: sess }, { data: ecoSess }, { data: uit }, { data: bal }] = await Promise.all([
    supabaseAdmin
      .from("teller_sessions")
      .select("id, user_id, session_code, opened_at, closed_at, opened_float_amount, status")
      .in("user_id", tellerIds)
      .gte("opened_at", dayStart)
      .lte("opened_at", dayEnd),
    supabaseAdmin
      .from("ecocash_sessions")
      .select("id, user_id, session_code, opened_at, closed_at, opened_float_amount, status")
      .in("user_id", tellerIds)
      .gte("opened_at", dayStart)
      .lte("opened_at", dayEnd),
    supabaseAdmin
      .from("user_internal_transactions")
      .select("user_id, kind, amount, created_at")
      .in("user_id", tellerIds),
    supabaseAdmin
      .from("teller_balancing")
      .select("teller_user_id, status, variance_usd")
      .in("teller_user_id", tellerIds)
      .eq("business_date", dateFilter),
  ]);

  // Aggregate balances
  const balMap = new Map<string, { in: number; out: number; last: string | null }>();
  (uit ?? []).forEach((r: any) => {
    const cur = balMap.get(r.user_id) ?? { in: 0, out: 0, last: null };
    if (r.kind === "inflow") cur.in += Number(r.amount);
    else cur.out += Number(r.amount);
    if (!cur.last || r.created_at > cur.last) cur.last = r.created_at;
    balMap.set(r.user_id, cur);
  });

  const sessMap = new Map<string, any>();
  (sess ?? []).forEach((s: any) => sessMap.set(s.user_id, s));
  const ecoMap = new Map<string, any>();
  (ecoSess ?? []).forEach((s: any) => ecoMap.set(s.user_id, s));
  const balanceMap = new Map<string, any>();
  (bal ?? []).forEach((b: any) => balanceMap.set(b.teller_user_id, b));

  return (profiles ?? []).map((p: any): TellerCard => {
    const s = sessMap.get(p.user_id);
    const e = ecoMap.get(p.user_id);
    const b = balMap.get(p.user_id) ?? { in: 0, out: 0, last: null };
    const bz = balanceMap.get(p.user_id);
    const openingFloat = s
      ? Number(s.opened_float_amount ?? 0)
      : e
        ? Number(e.opened_float_amount ?? 0)
        : 0;

    let status: TellerCard["status"] = "offline";
    if (e && e.status === "open") status = "ecocash";
    else if (s && s.status === "open") status = "open_day";
    else if (s || e) status = "closed";

    let variance_status: TellerCard["variance_status"] = "none";
    if (bz) {
      if (bz.status === "balanced") {
        variance_status = Math.abs(Number(bz.variance_usd ?? 0)) > 0.005 ? "variance" : "balanced";
      } else {
        variance_status = "pending";
      }
    }

    return {
      user_id: p.user_id,
      username: p.username,
      display_name: p.display_name,
      full_name: p.full_name,
      branch_id: p.branch_id,
      branch_name: p.branch_id ? (branchMap.get(p.branch_id) ?? null) : null,
      opening_float: openingFloat,
      current_balance: b.in - b.out,
      status,
      variance_status,
      last_activity: b.last,
      open_time: s?.opened_at ?? e?.opened_at ?? null,
      close_time: s?.closed_at ?? e?.closed_at ?? null,
      session_code: s?.session_code ?? null,
      ecocash_session_code: e?.session_code ?? null,
      balancing_status: bz?.status ?? null,
      variance_usd: bz ? Number(bz.variance_usd ?? 0) : null,
    };
  });
}

export const getManagerDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertManager(context.userId);
    const today = new Date().toISOString().slice(0, 10);
    return { tellers: await buildTellerCards(today), business_date: today };
  });

export const getManagerBalancingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.userId);
    return { tellers: await buildTellerCards(data.businessDate), business_date: data.businessDate };
  });

/* ============ Teller day detail ============ */

export type TellerDayDetail = {
  teller: {
    user_id: string;
    username: string | null;
    display_name: string | null;
    full_name: string | null;
    branch_name: string | null;
  };
  business_date: string;
  session: any | null;
  ecocash_session: any | null;
  balancing: any | null;
  payments: any[];
  withdrawals: any[];
  internal: any[];
  pending: any[];
  failed: any[];
  changes_refunds: any[];
  ecocash: any[];
  totals: {
    openingFloat: number;
    payments: number;
    withdrawals: number;
    cashAdvance: number;
    cashSwipes: number;
    transfersIn: number;
    transfersOut: number;
    floatReturns: number;
    ecocashIn: number;
    ecocashOut: number;
    totalInflows: number;
    totalOutflows: number;
    expectedCash: number;
  };
};

export const getTellerDayDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tellerUserId: z.string().uuid(),
        businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<TellerDayDetail> => {
    await assertManager(context.userId);
    const { tellerUserId, businessDate } = data;
    const dayStart = `${businessDate}T00:00:00.000Z`;
    const dayEnd = `${businessDate}T23:59:59.999Z`;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_id, username, display_name, full_name, branch_id")
      .eq("user_id", tellerUserId)
      .maybeSingle();

    let branchName: string | null = null;
    if (profile?.branch_id) {
      const { data: br } = await supabaseAdmin
        .from("branches")
        .select("name")
        .eq("id", profile.branch_id)
        .maybeSingle();
      branchName = br?.name ?? null;
    }

    const [
      { data: session },
      { data: ecoSession },
      { data: balancing },
      { data: payments },
      { data: cashAdvance },
      { data: cashSwipes },
      { data: uit },
      { data: transfers },
      { data: ecocash },
      { data: auditChanges },
    ] = await Promise.all([
      supabaseAdmin
        .from("teller_sessions")
        .select("*")
        .eq("user_id", tellerUserId)
        .gte("opened_at", dayStart)
        .lte("opened_at", dayEnd)
        .maybeSingle(),
      supabaseAdmin
        .from("ecocash_sessions")
        .select("*")
        .eq("user_id", tellerUserId)
        .gte("opened_at", dayStart)
        .lte("opened_at", dayEnd)
        .maybeSingle(),
      supabaseAdmin
        .from("teller_balancing")
        .select("*")
        .eq("teller_user_id", tellerUserId)
        .eq("business_date", businessDate)
        .maybeSingle(),
      supabaseAdmin
        .from("payments")
        .select("*")
        .eq("teller_id", tellerUserId as never)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("cash_advance")
        .select("*")
        .eq("teller_id", tellerUserId as never)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("cash_swipes")
        .select("*")
        .eq("teller_id", tellerUserId as never)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("user_internal_transactions")
        .select("*")
        .eq("user_id", tellerUserId)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("teller_transfers")
        .select("*")
        .or(`requesting_user_id.eq.${tellerUserId},sending_user_id.eq.${tellerUserId}`)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("ecocash_transactions")
        .select("*")
        .eq("created_by", tellerUserId as never)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("audit_logs")
        .select("*")
        .eq("target_user_id", tellerUserId)
        .in("action", ["status_change", "manager_review", "manager_balance"])
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: false }),
    ]);

    const allPayments = payments ?? [];
    const allWithdrawals = [...(cashAdvance ?? []), ...(cashSwipes ?? [])];
    const allInternal = uit ?? [];
    const allTransfers = transfers ?? [];

    const isPending = (s: string) => s === "pending";
    const isFailed = (s: string) => ["failed", "rejected", "declined"].includes(s);

    const pending = [
      ...allPayments.filter((r: any) => isPending(r.status)).map((r: any) => ({ ...r, _kind: "payment" })),
      ...allWithdrawals.filter((r: any) => isPending(r.status)).map((r: any) => ({ ...r, _kind: "withdrawal" })),
      ...allTransfers.filter((r: any) => r.status === "pending").map((r: any) => ({ ...r, _kind: "transfer" })),
    ];
    const failed = [
      ...allPayments.filter((r: any) => isFailed(r.status)).map((r: any) => ({ ...r, _kind: "payment" })),
      ...allWithdrawals.filter((r: any) => isFailed(r.status)).map((r: any) => ({ ...r, _kind: "withdrawal" })),
      ...allTransfers.filter((r: any) => ["rejected", "cancelled"].includes(r.status)).map((r: any) => ({ ...r, _kind: "transfer" })),
    ];

    // Totals (successful only)
    const successful = (rows: any[]) => rows.filter((r) => r.status === "successful" || r.status === "approved");
    const sum = (rows: any[], field: string) => rows.reduce((a, r) => a + Number(r[field] ?? 0), 0);

    const openingFloat = allInternal
      .filter((r: any) => r.category === "opening_float")
      .reduce((a, r: any) => a + Number(r.amount), 0)
      || Number(session?.opened_float_amount ?? ecoSession?.opened_float_amount ?? 0);

    const paymentsSuccess = successful(allPayments);
    const totalPayments = sum(paymentsSuccess, "usd_amount");

    const cashAdvSuccess = successful(cashAdvance ?? []);
    const totalCashAdvance = sum(cashAdvSuccess, "amount");

    const cashSwipesSuccess = successful(cashSwipes ?? []);
    const totalCashSwipes = sum(cashSwipesSuccess, "usd_amount");

    const transfersIn = allInternal
      .filter((r: any) => r.category === "teller_transfer_received")
      .reduce((a, r: any) => a + Number(r.amount), 0);
    const transfersOut = allInternal
      .filter((r: any) => r.category === "teller_transfer_sent")
      .reduce((a, r: any) => a + Number(r.amount), 0);
    const floatReturns = allInternal
      .filter((r: any) => r.category === "float_return" || r.category === "float_assignment")
      .filter((r: any) => r.kind === "outflow")
      .reduce((a, r: any) => a + Number(r.amount), 0);

    const ecocashIn = (ecocash ?? [])
      .filter((r: any) => r.transaction_type === "inflow")
      .reduce((a, r: any) => a + Number(r.amount), 0);
    const ecocashOut = (ecocash ?? [])
      .filter((r: any) => r.transaction_type === "outflow")
      .reduce((a, r: any) => a + Number(r.amount), 0);

    const totalInflows = openingFloat + totalPayments + transfersIn + ecocashIn;
    const totalOutflows = totalCashAdvance + totalCashSwipes + transfersOut + floatReturns + ecocashOut;
    const expectedCash = totalInflows - totalOutflows;

    return {
      teller: {
        user_id: tellerUserId,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        full_name: profile?.full_name ?? null,
        branch_name: branchName,
      },
      business_date: businessDate,
      session: session ?? null,
      ecocash_session: ecoSession ?? null,
      balancing: balancing ?? null,
      payments: allPayments,
      withdrawals: allWithdrawals,
      internal: [...allInternal, ...allTransfers.filter((t: any) => t.status === "approved")],
      pending,
      failed,
      changes_refunds: auditChanges ?? [],
      ecocash: ecocash ?? [],
      totals: {
        openingFloat,
        payments: totalPayments,
        withdrawals: totalCashAdvance + totalCashSwipes,
        cashAdvance: totalCashAdvance,
        cashSwipes: totalCashSwipes,
        transfersIn,
        transfersOut,
        floatReturns,
        ecocashIn,
        ecocashOut,
        totalInflows,
        totalOutflows,
        expectedCash,
      },
    };
  });

export const saveManagerReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tellerUserId: z.string().uuid(),
        businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reviewedRefs: z.array(z.object({ table: z.string(), id: z.string(), ticked_at: z.string() })),
        comments: z.string().trim().max(4000).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("manager_save_review", {
      _teller_user_id: data.tellerUserId,
      _business_date: data.businessDate,
      _reviewed_refs: data.reviewedRefs as never,
      _comments: data.comments ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true, row };
  });

export const balanceTeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tellerUserId: z.string().uuid(),
        businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        physicalUsd: z.number().nonnegative().max(1_000_000_000),
        expectedUsd: z.number().max(1_000_000_000),
        comments: z.string().trim().max(4000).optional().default(""),
        device: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let ip: string | null = null;
    try {
      ip = getRequestIP({ xForwardedFor: true }) ?? null;
    } catch {
      ip = null;
    }
    const { data: row, error } = await context.supabase.rpc("manager_balance_teller", {
      _teller_user_id: data.tellerUserId,
      _business_date: data.businessDate,
      _physical_usd: data.physicalUsd,
      _expected_usd: data.expectedUsd,
      _comments: data.comments ?? null,
      _device: (data.device ?? null) as never,
      _ip: ip as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true, row };
  });

export const getManagerAuditFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertManager(context.userId);
    const { data } = await supabaseAdmin
      .from("audit_logs")
      .select("*")
      .eq("module", "manager_portal")
      .order("created_at", { ascending: false })
      .limit(200);
    return { logs: data ?? [] };
  });
