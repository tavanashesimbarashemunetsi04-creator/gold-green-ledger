import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const addFinanceCash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        amount: z.number().positive().max(1_000_000_000),
        reference: z.string().trim().max(200).optional(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase.rpc("add_finance_cash", {
      _amount: data.amount,
      _reference: (data.reference ?? null) as unknown as string,
      _notes: (data.notes ?? null) as unknown as string,
    });
    if (error) throw new Error(error.message);
    return row;
  });
