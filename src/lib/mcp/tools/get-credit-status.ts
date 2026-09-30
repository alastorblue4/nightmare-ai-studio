import { defineTool } from "@lovable.dev/mcp-js";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_credit_status",
  title: "Get credit status",
  description: "Show the signed-in user's remaining daily free credits and purchased credits.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await supabaseForUser(ctx).rpc("credit_status", {});
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
});
