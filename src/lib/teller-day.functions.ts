import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Session = {
  id: string;
  session_code: string;
  branch_id: string | null;
  opened_at: string;
  opened_float_amount: number;
  closed_at: string | null;
  closing_cash_at_hand: number | null;
  status: "open" | "closed";
};

export type RecentTx = {
  id: string;
  ref: string;
  ts: string;
  client: string;
  type: string;
  amount: number;
  status: string;
};

export type EcocashSessionLite = {
  id: string;
  session_code: string;
  opened_at: string;
  opened_float_amount: number;
  status: "open" | "closed";
};

export type DashboardState = {
  profile: {
    user_id: string;
    username: string | null;
    display_name: string | null;
    branch_id: string | null;
    branch_name: string | null;
    ready_to_open_day: boolean;
    day_open: boolean;
  };
  session: Session | null;
  ecocashSession: EcocashSessionLite | null;
  lastClosedSession: Session | null;
  pendingFloat: { id: string; amount: number; created_at: string; reference: string | null } | null;
  totals: {
    payments: number;
    withdrawals: number;
    internalIn: number;
    internalOut: number;
    cashAtHand: number;
  };
  recent: RecentTx[];
};

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export const getDashboardState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardState> => {
    const uid = context.userId;
    const todayIso = startOfTodayIso();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_id, username, display_name, branch_id, ready_to_open_day, day_open")
      .eq("user_id", uid)
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

    const { data: openSess } = await supabaseAdmin
      .from("teller_sessions")
      .select("id, session_code, branch_id, opened_at, opened_float_amount, closed_at, closing_cash_at_hand, status")
      .eq("user_id", uid)
      .eq("status", "open")
      .maybeSingle();

    const { data: openEco } = await supabaseAdmin
      .from("ecocash_sessions")
      .select("id, session_code, opened_at, opened_float_amount, status")
      .eq("user_id", uid)
      .eq("status", "open")
      .maybeSingle();

    const { data: lastClosed } = await supabaseAdmin
      .from("teller_sessions")
      .select("id, session_code, branch_id, opened_at, opened_float_amount, closed_at, closing_cash_at_hand, status")
      .eq("user_id", uid)
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: pendingFloat } = await supabaseAdmin
      .from("float_assignments")
      .select("id, amount, created_at, reference")
      .eq("assigned_to_user_id", uid)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Activity is scoped strictly to the currently open session.
    // When the day is closed, totals reset to zero — historical data is
    // available in the End Day Summary tab.
    const sinceIso = openSess?.opened_at ?? null;

    const [pays, wds, itxIn, itxOut, uitFloat] = sinceIso
      ? await Promise.all([
          supabaseAdmin
            .from("payments")
            .select("id, date, created_at, account_number, phone_number, payment_type, usd_amount, zwg_amount, status")
            .eq("teller_id", uid as never)
            .gte("created_at", sinceIso)
            .order("created_at", { ascending: false }),
          supabaseAdmin
            .from("cash_advance")
            .select("id, date, created_at, name, amount, status")
            .eq("teller_id", uid as never)
            .gte("created_at", sinceIso)
            .order("created_at", { ascending: false }),
          supabaseAdmin
            .from("user_internal_transactions")
            .select("amount")
            .eq("user_id", uid)
            .eq("kind", "inflow")
            .gte("created_at", sinceIso),
          supabaseAdmin
            .from("user_internal_transactions")
            .select("amount")
            .eq("user_id", uid)
            .eq("kind", "outflow")
            .gte("created_at", sinceIso),
          supabaseAdmin
            .from("user_internal_transactions")
            .select("amount, kind")
            .eq("user_id", uid),
        ])
      : [
          { data: [] as any[] },
          { data: [] as any[] },
          { data: [] as any[] },
          { data: [] as any[] },
          { data: [] as any[] },
        ];

    const totalPayments = (pays.data ?? []).reduce(
      (a, r: any) => a + Number(r.usd_amount ?? 0) + Number(r.zwg_amount ?? 0),
      0,
    );
    const totalWithdrawals = (wds.data ?? []).reduce((a, r: any) => a + Number(r.amount ?? 0), 0);
    const internalIn = (itxIn.data ?? []).reduce((a, r: any) => a + Number(r.amount ?? 0), 0);
    const internalOut = (itxOut.data ?? []).reduce((a, r: any) => a + Number(r.amount ?? 0), 0);

    // Cash at hand is zero when no day is open; otherwise lifetime in/out
    // minus current session's net cash transactions.
    const allIn = (uitFloat.data ?? []).filter((r: any) => r.kind === "inflow").reduce((a, r: any) => a + Number(r.amount), 0);
    const allOut = (uitFloat.data ?? []).filter((r: any) => r.kind === "outflow").reduce((a, r: any) => a + Number(r.amount), 0);
    const cashAtHand = sinceIso ? allIn - allOut + totalPayments - totalWithdrawals : 0;

    const recent: RecentTx[] = [];
    (pays.data ?? []).forEach((r: any) =>
      recent.push({
        id: r.id,
        ref: `PAY-${r.id.slice(0, 6).toUpperCase()}`,
        ts: r.created_at,
        client: r.account_number || r.phone_number || "—",
        type: `Payment · ${r.payment_type ?? ""}`.trim(),
        amount: Number(r.usd_amount ?? 0) + Number(r.zwg_amount ?? 0),
        status: r.status,
      }),
    );
    (wds.data ?? []).forEach((r: any) =>
      recent.push({
        id: r.id,
        ref: `WD-${r.id.slice(0, 6).toUpperCase()}`,
        ts: r.created_at,
        client: r.name ?? "—",
        type: "Withdrawal",
        amount: -Number(r.amount ?? 0),
        status: r.status,
      }),
    );
    recent.sort((a, b) => (a.ts < b.ts ? 1 : -1));

    return {
      profile: {
        user_id: uid,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        branch_id: profile?.branch_id ?? null,
        branch_name: branchName,
        ready_to_open_day: profile?.ready_to_open_day ?? false,
        day_open: profile?.day_open ?? false,
      },
      session: (openSess as Session) ?? null,
      ecocashSession: (openEco as EcocashSessionLite) ?? null,
      lastClosedSession: (lastClosed as Session) ?? null,
      pendingFloat: pendingFloat
        ? {
            id: pendingFloat.id,
            amount: Number(pendingFloat.amount),
            created_at: pendingFloat.created_at,
            reference: pendingFloat.reference ?? null,
          }
        : null,
      totals: {
        payments: totalPayments,
        withdrawals: totalWithdrawals,
        internalIn,
        internalOut,
        cashAtHand,
      },
      recent: recent.slice(0, 20),
    };
  });

export const openDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        floatAmount: z.number().nonnegative().max(1_000_000_000),
        branchId: z.string().uuid().nullable().optional(),
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
    const { data: row, error } = await context.supabase.rpc("open_teller_day", {
      _float: data.floatAmount,
      _branch: (data.branchId ?? null) as never,
      _device: (data.device ?? null) as never,
      _ip: ip as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true, session: row };
  });

export const closeDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        cashAtHand: z.number().nonnegative().max(1_000_000_000),
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
    const { data: row, error } = await context.supabase.rpc("close_teller_day", {
      _cash_at_hand: data.cashAtHand,
      _device: (data.device ?? null) as never,
      _ip: ip as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true, session: row };
  });

/* =================== End Day Summary & Balancing =================== */

export type EodLine = {
  id: string;
  ts: string;
  narration: string;
  type: string;
  ref: string;
  usd: number;
  zwg: number;
};

export type EndDaySummary = {
  session: Session | null;
  isClosed: boolean;
  branchName: string | null;
  username: string | null;
  openingFloat: { reference: string | null; usd: number; zwg: number } | null;
  inflows: {
    internal: EodLine[];
    paymentsByBank: Record<string, EodLine[]>;
  };
  outflows: {
    swipes: EodLine[];
    advances: EodLine[];
    internal: EodLine[];
  };
  ecocash: EodLine[];
};

export const getEndDaySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EndDaySummary> => {
    const uid = context.userId;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("username, display_name, branch_id")
      .eq("user_id", uid)
      .maybeSingle();

    let branchName: string | null = null;
    if (profile?.branch_id) {
      const { data: br } = await supabaseAdmin
        .from("branches").select("name").eq("id", profile.branch_id).maybeSingle();
      branchName = br?.name ?? null;
    }

    // Prefer the currently OPEN session; fall back to the most recent CLOSED
    // session so the teller can still review their previous day after closing.
    const { data: openSession } = await supabaseAdmin
      .from("teller_sessions")
      .select("id, session_code, branch_id, opened_at, opened_float_amount, closed_at, closing_cash_at_hand, status")
      .eq("user_id", uid).eq("status", "open").maybeSingle();

    let session = openSession as Session | null;
    if (!session) {
      const { data: lastClosed } = await supabaseAdmin
        .from("teller_sessions")
        .select("id, session_code, branch_id, opened_at, opened_float_amount, closed_at, closing_cash_at_hand, status")
        .eq("user_id", uid).eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(1).maybeSingle();
      session = (lastClosed as Session) ?? null;
    }
    const isClosed = !!session && session.status === "closed";

    const empty: EndDaySummary = {
      session,
      isClosed,
      branchName,
      username: profile?.username ?? profile?.display_name ?? null,
      openingFloat: null,
      inflows: { internal: [], paymentsByBank: { ZB: [], CBZ: [], BANCABC: [], AFC: [] } },
      outflows: { swipes: [], advances: [], internal: [] },
      ecocash: [],
    };
    if (!session) return empty;

    const sinceIso = session.opened_at;
    const untilIso = session.closed_at ?? new Date().toISOString();

    // Opening float from approved float_assignment linked to opening_float UIT
    const { data: openingUit } = await supabaseAdmin
      .from("user_internal_transactions")
      .select("amount, related_float_assignment_id, created_at")
      .eq("user_id", uid)
      .eq("category", "opening_float")
      .gte("created_at", new Date(new Date(sinceIso).getTime() - 24 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let openingFloat = empty.openingFloat;
    if (openingUit) {
      let ref: string | null = null;
      if (openingUit.related_float_assignment_id) {
        const { data: fa } = await supabaseAdmin
          .from("float_assignments").select("reference")
          .eq("id", openingUit.related_float_assignment_id).maybeSingle();
        ref = fa?.reference ?? null;
      }
      openingFloat = { reference: ref, usd: Number(openingUit.amount ?? 0), zwg: 0 };
    } else {
      openingFloat = { reference: null, usd: Number(session.opened_float_amount ?? 0), zwg: 0 };
    }

    // Internal inflows (exclude opening_float)
    const { data: uitIn } = await supabaseAdmin
      .from("user_internal_transactions")
      .select("id, amount, category, notes, created_at")
      .eq("user_id", uid).eq("kind", "inflow")
      .neq("category", "opening_float")
      .gte("created_at", sinceIso).lte("created_at", untilIso)
      .order("created_at", { ascending: false });

    const { data: uitOut } = await supabaseAdmin
      .from("user_internal_transactions")
      .select("id, amount, category, notes, created_at")
      .eq("user_id", uid).eq("kind", "outflow")
      .gte("created_at", sinceIso).lte("created_at", untilIso)
      .order("created_at", { ascending: false });

    // Payments (successful) for this session
    const { data: pays } = await supabaseAdmin
      .from("payments")
      .select("id, created_at, bank, account_number, phone_number, payment_type, code, usd_amount, zwg_amount, category, status")
      .eq("teller_id", uid as never)
      .eq("status", "successful")
      .gte("created_at", sinceIso).lte("created_at", untilIso)
      .order("created_at", { ascending: false });

    // Cash swipes (withdrawals) for this session
    const { data: swipes } = await supabaseAdmin
      .from("cash_swipes")
      .select("id, created_at, name, transaction_type, code, usd_amount, zwg_amount, status")
      .eq("teller_id", uid as never)
      .eq("status", "successful")
      .eq("transaction_type", "withdrawal")
      .gte("created_at", sinceIso).lte("created_at", untilIso)
      .order("created_at", { ascending: false });

    // Cash advances
    const { data: advs } = await supabaseAdmin
      .from("cash_advance")
      .select("id, created_at, name, transaction_type, code, amount, status")
      .eq("teller_id", uid as never)
      .eq("status", "successful")
      .gte("created_at", sinceIso).lte("created_at", untilIso)
      .order("created_at", { ascending: false });

    // Ecocash transactions created by this user during the session window
    const { data: ecoTx } = await supabaseAdmin
      .from("ecocash_transactions")
      .select("id, created_at, description, transaction_type, inflow_amount, outflow_amount, amount, source")
      .eq("created_by", uid)
      .gte("created_at", sinceIso).lte("created_at", untilIso)
      .order("created_at", { ascending: false });

    const paymentsByBank: Record<string, EodLine[]> = { ZB: [], CBZ: [], BANCABC: [], AFC: [] };
    (pays ?? []).forEach((r: any) => {
      const line: EodLine = {
        id: r.id, ts: r.created_at,
        narration: r.account_number || r.phone_number || r.category || "—",
        type: r.payment_type ?? "payment",
        ref: r.code || `PAY-${r.id.slice(0, 6).toUpperCase()}`,
        usd: Number(r.usd_amount ?? 0), zwg: Number(r.zwg_amount ?? 0),
      };
      const bank = (r.bank as string) || "OTHER";
      if (!paymentsByBank[bank]) paymentsByBank[bank] = [];
      paymentsByBank[bank].push(line);
    });

    const mapUit = (rows: any[]): EodLine[] =>
      (rows ?? []).map((r) => {
        const note: string = r.notes || "";
        const refMatch = note.match(/TT-\d{12}-[A-Za-z0-9]{4}/);
        const isTransfer =
          r.category === "teller_transfer_sent" || r.category === "teller_transfer_received";
        const friendlyType = isTransfer
          ? r.category === "teller_transfer_sent"
            ? "Teller Transfer Sent"
            : "Teller Transfer Received"
          : String(r.category ?? "internal");
        return {
          id: r.id,
          ts: r.created_at,
          narration: note || r.category || "Internal transaction",
          type: friendlyType,
          ref: refMatch ? refMatch[0] : `INT-${r.id.slice(0, 6).toUpperCase()}`,
          usd: Number(r.amount ?? 0),
          zwg: 0,
        };
      });

    const ecocash: EodLine[] = (ecoTx ?? []).map((r: any) => {
      const inflow = Number(r.inflow_amount ?? 0);
      const outflow = Number(r.outflow_amount ?? 0);
      const signed = inflow - outflow || Number(r.amount ?? 0);
      return {
        id: r.id,
        ts: r.created_at,
        narration: r.description || r.source || "Ecocash transaction",
        type: String(r.transaction_type ?? "ecocash"),
        ref: `ECO-${r.id.slice(0, 6).toUpperCase()}`,
        usd: signed,
        zwg: 0,
      };
    });

    return {
      session: session as Session,
      isClosed,
      branchName,
      username: profile?.username ?? profile?.display_name ?? null,
      openingFloat,
      inflows: { internal: mapUit(uitIn ?? []), paymentsByBank },
      outflows: {
        swipes: (swipes ?? []).map((r: any) => ({
          id: r.id, ts: r.created_at,
          narration: r.name ?? "—",
          type: r.transaction_type ?? "withdrawal",
          ref: r.code || `SW-${r.id.slice(0, 6).toUpperCase()}`,
          usd: Number(r.usd_amount ?? 0), zwg: Number(r.zwg_amount ?? 0),
        })),
        advances: (advs ?? []).map((r: any) => ({
          id: r.id, ts: r.created_at,
          narration: r.name ?? "—",
          type: r.transaction_type ?? "cash_advance",
          ref: r.code || `CA-${r.id.slice(0, 6).toUpperCase()}`,
          usd: Number(r.amount ?? 0), zwg: 0,
        })),
        internal: mapUit(uitOut ?? []),
      },
      ecocash,
    };
  });

export const closeDayWithBalancing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        physicalUsd: z.number().nonnegative().max(1_000_000_000),
        physicalZwg: z.number().nonnegative().max(1_000_000_000).optional().default(0),
        expectedUsd: z.number().max(1_000_000_000),
        expectedZwg: z.number().max(1_000_000_000).optional().default(0),
        varianceReason: z.string().trim().max(2000).optional().nullable(),
        device: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    let ip: string | null = null;
    try { ip = getRequestIP({ xForwardedFor: true }) ?? null; } catch { ip = null; }

    const varianceUsd = data.physicalUsd - data.expectedUsd;
    const varianceZwg = data.physicalZwg - data.expectedZwg;

    // Variance no longer blocks closing — it is recorded and flagged for the manager.

    // Pre-close audit log capturing balancing snapshot
    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: uid,
      action: "end_day_balance",
      table_name: "teller_sessions",
      module: "teller_day",
      device_ip: ip,
      new_data: {
        physicalUsd: data.physicalUsd,
        physicalZwg: data.physicalZwg,
        expectedUsd: data.expectedUsd,
        expectedZwg: data.expectedZwg,
        varianceUsd,
        varianceZwg,
        reason: data.varianceReason ?? null,
        device: data.device ?? null,
      },
    });

    // Flag the day for the manager when there is a variance
    if (Math.abs(varianceUsd) > 0.005) {
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("branch_id").eq("user_id", uid).maybeSingle();
      const today = new Date().toISOString().slice(0, 10);
      await supabaseAdmin.from("teller_balancing").upsert({
        teller_user_id: uid,
        business_date: today,
        branch_id: prof?.branch_id ?? null,
        status: "in_review",
        expected_usd: data.expectedUsd,
        physical_usd: data.physicalUsd,
        variance_usd: varianceUsd,
        manager_comments: data.varianceReason ?? null,
      }, { onConflict: "teller_user_id,business_date" });
    }

    const { data: row, error } = await context.supabase.rpc("close_teller_day", {
      _cash_at_hand: data.physicalUsd,
      _device: (data.device ?? null) as never,
      _ip: ip as never,
    });
    if (error) throw new Error(error.message);

    return { ok: true, session: row, varianceUsd, varianceZwg };
  });
