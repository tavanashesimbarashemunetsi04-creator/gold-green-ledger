import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_my_balance",
  title: "Get my cash balance",
  description:
    "Return the signed-in user's current cash-at-hand balance and profile info.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const client = sb(ctx);
    const uid = ctx.getUserId();
    const [profile, roles] = await Promise.all([
      client.from("profiles").select("*").eq("id", uid).maybeSingle(),
      client.from("user_roles").select("role").eq("user_id", uid),
    ]);
    const result = {
      user_id: uid,
      email: ctx.getUserEmail(),
      profile: profile.data ?? null,
      roles: (roles.data ?? []).map((r: { role: string }) => r.role),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
