import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TellerPerformance = {
  today: {
    total: number;
    deposits: number;
    withdrawals: number;
    internal: number;
    value: number;
  };
  month: {
    total: number;
    value: number;
  };
};

export const getTellerPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TellerPerformance> => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const uid = context.userId;

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();

    // Resolve the teller_id (FK to tellers.id) used by internal_transactions
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("teller_id")
      .eq("user_id", uid)
      .maybeSingle();
    const tellerId = prof?.teller_id ?? null;

    // --- TODAY ---
    const [paysToday, swipesToday, advToday, intToday] = await Promise.all([
      supabaseAdmin
        .from("payments")
        .select("usd_amount")
        .eq("teller_id", uid as never)
        .eq("status", "successful")
        .gte("created_at", startOfDay),
      supabaseAdmin
        .from("cash_swipes")
        .select("usd_amount")
        .eq("teller_id", uid as never)
        .eq("status", "successful")
        .eq("transaction_type", "withdrawal")
        .gte("created_at", startOfDay),
      supabaseAdmin
        .from("cash_advance")
        .select("amount")
        .eq("teller_id", uid as never)
        .eq("status", "successful")
        .gte("created_at", startOfDay),
      tellerId
        ? supabaseAdmin
            .from("internal_transactions")
            .select("amount")
            .eq("initiating_teller_id", tellerId)
            .eq("status", "approved")
            .gte("created_at", startOfDay)
        : Promise.resolve({ data: [] as { amount: number }[] }),
    ]);

    const sumNum = (rows: any[] | null | undefined, key: string) =>
      (rows ?? []).reduce((s, r) => s + Number(r?.[key] ?? 0), 0);

    const depositsCount = paysToday.data?.length ?? 0;
    const withdrawalsCount =
      (swipesToday.data?.length ?? 0) + (advToday.data?.length ?? 0);
    const internalCount = intToday.data?.length ?? 0;

    const todayValue =
      sumNum(paysToday.data as any[], "usd_amount") +
      sumNum(swipesToday.data as any[], "usd_amount") +
      sumNum(advToday.data as any[], "amount") +
      sumNum(intToday.data as any[], "amount");

    const todayTotal = depositsCount + withdrawalsCount + internalCount;

    // --- MONTH ---
    const [paysMonth, swipesMonth, advMonth, intMonth] = await Promise.all([
      supabaseAdmin
        .from("payments")
        .select("usd_amount")
        .eq("teller_id", uid as never)
        .eq("status", "successful")
        .gte("created_at", startOfMonth),
      supabaseAdmin
        .from("cash_swipes")
        .select("usd_amount")
        .eq("teller_id", uid as never)
        .eq("status", "successful")
        .eq("transaction_type", "withdrawal")
        .gte("created_at", startOfMonth),
      supabaseAdmin
        .from("cash_advance")
        .select("amount")
        .eq("teller_id", uid as never)
        .eq("status", "successful")
        .gte("created_at", startOfMonth),
      tellerId
        ? supabaseAdmin
            .from("internal_transactions")
            .select("amount")
            .eq("initiating_teller_id", tellerId)
            .eq("status", "approved")
            .gte("created_at", startOfMonth)
        : Promise.resolve({ data: [] as { amount: number }[] }),
    ]);

    const monthTotal =
      (paysMonth.data?.length ?? 0) +
      (swipesMonth.data?.length ?? 0) +
      (advMonth.data?.length ?? 0) +
      (intMonth.data?.length ?? 0);

    const monthValue =
      sumNum(paysMonth.data as any[], "usd_amount") +
      sumNum(swipesMonth.data as any[], "usd_amount") +
      sumNum(advMonth.data as any[], "amount") +
      sumNum(intMonth.data as any[], "amount");

    return {
      today: {
        total: todayTotal,
        deposits: depositsCount,
        withdrawals: withdrawalsCount,
        internal: internalCount,
        value: todayValue,
      },
      month: { total: monthTotal, value: monthValue },
    };
  });
