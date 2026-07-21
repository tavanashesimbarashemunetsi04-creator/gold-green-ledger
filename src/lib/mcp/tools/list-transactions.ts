import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_recent_transactions",
  title: "List recent transactions",
  description:
    "List the signed-in user's most recent transactions across payments, withdrawals, ecocash, and internal transactions, ordered by newest first.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max rows per source (1-100, default 20)."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const lim = limit ?? 20;
    const client = sb(ctx);
    const [payments, withdrawals, ecocash, internal] = await Promise.all([
      client.from("payments").select("*").order("created_at", { ascending: false }).limit(lim),
      client.from("cash_swipes").select("*").order("created_at", { ascending: false }).limit(lim),
      client
        .from("ecocash_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(lim),
      client
        .from("internal_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(lim),
    ]);
    const result = {
      payments: payments.data ?? [],
      cash_swipes: withdrawals.data ?? [],
      ecocash: ecocash.data ?? [],
      internal_transactions: internal.data ?? [],
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
