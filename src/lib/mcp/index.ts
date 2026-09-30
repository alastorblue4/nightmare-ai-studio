import { auth, defineMcp } from "@lovable.dev/mcp-js";

import getCreditStatus from "./tools/get-credit-status";
import listGenerations from "./tools/list-generations";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "nightmare-ai-studio",
  title: "Nightmare AI Studio",
  version: "0.1.0",
  instructions:
    "Tools for Nightmare AI. Use `list_generations` to browse the user's image/video generations and `get_credit_status` to check remaining credits.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listGenerations, getCreditStatus],
});
