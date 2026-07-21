import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTransactions from "./tools/list-transactions";
import myBalance from "./tools/my-balance";
import dayStatus from "./tools/day-status";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "afs-mcp",
  title: "Authentic Financial Services",
  version: "0.1.0",
  instructions:
    "Read-only tools for the signed-in AFS user: fetch recent transactions, current cash balance, and open-day status. All calls run as the authenticated user under RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTransactions, myBalance, dayStatus],
});
