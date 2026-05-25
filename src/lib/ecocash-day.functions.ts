import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type EcocashSession = {
  id: string;
  session_code: string;
  user_id: string;
  branch_id: string | null;
  opened_at: string;
  opened_float_amount: number;
  closed_at: string | null;
  closing_cash_at_hand: number | null;
  physical_usd: number | null;
  expected_usd: number | null;
  variance_usd: number | null;
  variance_reason: string | null;
  status: "open" | "closed";
};

export type EcocashLine = {
  id: string;
  ts: string;
  narration: string;
  type: string;
  ref: string;
  usd: number;
};

export type EcocashSummary = {
  session: EcocashSession | null;
  branchName: string | null;
  username: string | null;
  openingFloat: { reference: string | null; usd: number } | null;
  inflows: {
    transfersReceived: EcocashLine[];
    deposits: EcocashLine[];   // manual ecocash inflows
    collections: EcocashLine[]; // imported approved internal_tx ecocash inflows
  };
  outflows: {
    cashOuts: EcocashLine[];    // manual ecocash outflows
    transfersSent: EcocashLine[];
    floatReturns: EcocashLine[]; // any "float_assignment" outflow during session
  };
  pendingTransfers: number;
};

export const getEcocashSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EcocashSummary> => {
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

    const { data: session } = await supabaseAdmin
      .from("ecocash_sessions")
      .select("*")
      .eq("user_id", uid)
      .eq("status", "open")
      .maybeSingle();

    const empty: EcocashSummary = {
      session: (session as EcocashSession) ?? null,
      branchName,
      username: profile?.username ?? profile?.display_name ?? null,
      openingFloat: null,
      inflows: { transfersReceived: [], deposits: [], collections: [] },
      outflows: { cashOuts: [], transfersSent: [], floatReturns: [] },
      pendingTransfers: 0,
    };
    if (!session) return empty;

    const sinceIso = session.opened_at;

    // Opening float (last opening_float UIT within session window)
    const { data: openingUit } = await supabaseAdmin
      .from("user_internal_transactions")
      .select("amount, related_float_assignment_id, created_at")
      .eq("user_id", uid)
      .eq("category", "opening_float")
      .gte("created_at", new Date(new Date(sinceIso).getTime() - 24 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let openingFloat: EcocashSummary["openingFloat"] = null;
    if (openingUit) {
      let ref: string | null = null;
      if (openingUit.related_float_assignment_id) {
        const { data: fa } = await supabaseAdmin
          .from("float_assignments").select("reference")
          .eq("id", openingUit.related_float_assignment_id).maybeSingle();
        ref = fa?.reference ?? null;
      }
      openingFloat = { reference: ref, usd: Number(openingUit.amount ?? 0) };
    } else {
      openingFloat = { reference: null, usd: Number(session.opened_float_amount ?? 0) };
    }

    const [uitIn, uitOut, ecoTx, pendingTr] = await Promise.all([
      supabaseAdmin.from("user_internal_transactions")
        .select("id, amount, category, notes, created_at")
        .eq("user_id", uid).eq("kind", "inflow")
        .neq("category", "opening_float")
        .gte("created_at", sinceIso),
      supabaseAdmin.from("user_internal_transactions")
        .select("id, amount, category, notes, created_at")
        .eq("user_id", uid).eq("kind", "outflow")
        .gte("created_at", sinceIso),
      supabaseAdmin.from("ecocash_transactions")
        .select("id, description, amount, transaction_type, source, created_at")
        .gte("created_at", sinceIso),
      supabaseAdmin.from("teller_transfers")
        .select("id", { count: "exact", head: true })
        .or(`requesting_user_id.eq.${uid},sending_user_id.eq.${uid}`)
        .eq("status", "pending"),
    ]);

    const mkRef = (id: string, p: string) => `${p}-${id.slice(0, 6).toUpperCase()}`;
    const refOfNote = (note: string | null) =>
      note ? note.match(/TT-\d{12}-[A-Za-z0-9]{4}/)?.[0] ?? null : null;

    const transfersReceived: EcocashLine[] = [];
    const collections: EcocashLine[] = [];
    (uitIn.data ?? []).forEach((r: any) => {
      const line: EcocashLine = {
        id: r.id, ts: r.created_at,
        narration: r.notes || String(r.category ?? "internal"),
        type: r.category === "teller_transfer_received" ? "Transfer Received" : String(r.category ?? "internal"),
        ref: refOfNote(r.notes) ?? mkRef(r.id, "INT"),
        usd: Number(r.amount ?? 0),
      };
      if (r.category === "teller_transfer_received") transfersReceived.push(line);
      else collections.push(line);
    });

    const transfersSent: EcocashLine[] = [];
    const floatReturns: EcocashLine[] = [];
    (uitOut.data ?? []).forEach((r: any) => {
      const line: EcocashLine = {
        id: r.id, ts: r.created_at,
        narration: r.notes || String(r.category ?? "internal"),
        type: r.category === "teller_transfer_sent" ? "Transfer Sent" : String(r.category ?? "internal"),
        ref: refOfNote(r.notes) ?? mkRef(r.id, "INT"),
        usd: Number(r.amount ?? 0),
      };
      if (r.category === "teller_transfer_sent") transfersSent.push(line);
      else floatReturns.push(line);
    });

    const deposits: EcocashLine[] = [];
    const cashOuts: EcocashLine[] = [];
    (ecoTx.data ?? []).forEach((r: any) => {
      const line: EcocashLine = {
        id: r.id, ts: r.created_at,
        narration: r.description ?? "EcoCash transaction",
        type: r.source === "internal_transaction" ? "Imported" : "Manual",
        ref: mkRef(r.id, "EC"),
        usd: Number(r.amount ?? 0),
      };
      if (r.transaction_type === "inflow") {
        if (r.source === "internal_transaction") collections.push(line);
        else deposits.push(line);
      } else {
        cashOuts.push(line);
      }
    });

    return {
      session: session as EcocashSession,
      branchName,
      username: profile?.username ?? profile?.display_name ?? null,
      openingFloat,
      inflows: { transfersReceived, deposits, collections },
      outflows: { cashOuts, transfersSent, floatReturns },
      pendingTransfers: pendingTr.count ?? 0,
    };
  });

export const openEcocashDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      floatAmount: z.number().nonnegative().max(1_000_000_000),
      branchId: z.string().uuid().nullable().optional(),
      device: z.string().trim().max(300).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let ip: string | null = null;
    try { ip = getRequestIP({ xForwardedFor: true }) ?? null; } catch { ip = null; }
    const { data: row, error } = await context.supabase.rpc("open_ecocash_day", {
      _float: data.floatAmount,
      _branch: (data.branchId ?? null) as never,
      _device: (data.device ?? null) as never,
      _ip: ip as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true, session: row };
  });

export const closeEcocashDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      physicalUsd: z.number().nonnegative().max(1_000_000_000),
      expectedUsd: z.number().max(1_000_000_000),
      varianceReason: z.string().trim().max(2000).optional().nullable(),
      device: z.string().trim().max(300).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let ip: string | null = null;
    try { ip = getRequestIP({ xForwardedFor: true }) ?? null; } catch { ip = null; }
    const { data: row, error } = await context.supabase.rpc("close_ecocash_day", {
      _physical_usd: data.physicalUsd,
      _expected_usd: data.expectedUsd,
      _variance_reason: (data.varianceReason ?? null) as never,
      _device: (data.device ?? null) as never,
      _ip: ip as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true, session: row };
  });
