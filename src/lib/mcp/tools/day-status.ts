import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_day_status",
  title: "Get open-day status",
  description:
    "Return the signed-in user's current teller and ecocash session status (open/closed and opened_at).",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const client = sb(ctx);
    const uid = ctx.getUserId();
    const [teller, eco] = await Promise.all([
      client
        .from("teller_sessions")
        .select("*")
        .eq("teller_user_id", uid)
        .is("closed_at", null)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("ecocash_sessions")
        .select("*")
        .eq("teller_user_id", uid)
        .is("closed_at", null)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const result = {
      teller_session: teller.data ?? null,
      ecocash_session: eco.data ?? null,
      day_open: Boolean(teller.data),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
