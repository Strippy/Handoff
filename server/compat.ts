// Server context for the API functions: who is calling, a service-role data layer, file links,
// the AI model, and calls between functions. Runs on Vercel (Node.js) next to the web app.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createEntities } from "../src/api/entities.js";
import { PUBLIC_SUPABASE_URL } from "../src/api/public-config.js";

export type Row = Record<string, any>;

export const env = (name: string): string => process.env[name] || "";

const supabaseUrl = () => env("SUPABASE_URL") || env("VITE_SUPABASE_URL") || PUBLIC_SUPABASE_URL;
const serviceKey = () => env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");

let service: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient {
  if (!service) {
    if (!serviceKey()) throw new Error("Server isn't configured yet: add SUPABASE_SERVICE_ROLE_KEY in Vercel.");
    service = createClient(supabaseUrl(), serviceKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return service;
}

/** The site's own origin(s). Checkout and GitHub redirects only ever go back to one of these. */
export function allowedOrigins(): string[] {
  const list = [env("APP_URL"), ...env("APP_ORIGINS").split(",")]
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const vercel = env("VERCEL_URL");
  if (vercel) list.push(`https://${vercel}`);
  const branch = env("VERCEL_BRANCH_URL");
  if (branch) list.push(`https://${branch}`);
  return [...new Set(list)];
}
export const isAllowedOrigin = (o: unknown): o is string =>
  typeof o === "string" && allowedOrigins().includes(o.replace(/\/+$/, ""));
export const publicOrigin = (): string => allowedOrigins()[0] || "";

const PRIVATE_BUCKET = "private-files";

/** Private uploads are stored as "private-files/<owner id>/<file>". */
export function ownsPrivateFile(fileUri: unknown, userId: string): boolean {
  if (typeof fileUri !== "string" || !userId) return false;
  const [bucket, owner, ...rest] = fileUri.split("/");
  return bucket === PRIVATE_BUCKET && owner === userId && rest.length > 0 && !rest.includes("..");
}

async function createFileSignedUrl({ file_uri, expires_in = 600 }: { file_uri: string; expires_in?: number }) {
  const [bucket, ...rest] = String(file_uri || "").split("/");
  if (bucket !== PRIVATE_BUCKET || !rest.length) throw new Error("Unknown file.");
  const { data, error } = await serviceClient().storage.from(bucket).createSignedUrl(rest.join("/"), Math.max(30, Math.min(expires_in, 3600)));
  if (error || !data?.signedUrl) throw new Error(error?.message || "Couldn't create a download link.");
  return { signed_url: data.signedUrl };
}

/** Structured output from Claude: the JSON schema becomes a forced tool call. */
async function invokeLLM({ prompt, response_json_schema }: { prompt: string; response_json_schema?: Row }) {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) throw new Error("AI summaries aren't configured.");
  const body: Row = {
    model: env("ANTHROPIC_MODEL") || "claude-haiku-5-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  };
  if (response_json_schema) {
    body.tools = [{ name: "respond", description: "Return the result in this exact shape.", input_schema: response_json_schema }];
    body.tool_choice = { type: "tool", name: "respond" };
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const j: Row = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `AI request failed (${r.status})`);
  const content: Row[] = Array.isArray(j.content) ? j.content : [];
  if (response_json_schema) {
    const call = content.find((c) => c.type === "tool_use");
    if (!call) throw new Error("AI returned no result.");
    return call.input;
  }
  return content.filter((c) => c.type === "text").map((c) => c.text).join("");
}

type Dispatcher = (req: Request) => Promise<Response>;
let dispatcher: Dispatcher | null = null;
export const setDispatcher = (fn: Dispatcher) => {
  dispatcher = fn;
};

const bearer = (req: Request) => {
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : "";
};

export type CurrentUser = { id: string; email: string; full_name: string; role: string; created_date?: string };

/** Everything a function needs about the request it's handling. */
export function createClientFromRequest(req: Request) {
  const token = bearer(req);
  let me: Promise<CurrentUser> | null = null;

  const loadMe = async (): Promise<CurrentUser> => {
    if (!token) throw Object.assign(new Error("Not signed in"), { status: 401 });
    const db = serviceClient();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) throw Object.assign(new Error("Not signed in"), { status: 401 });
    const { data: row } = await db.from("users").select("*").eq("id", data.user.id).maybeSingle();
    return {
      id: data.user.id,
      email: data.user.email || row?.email || "",
      full_name: row?.full_name || (data.user.user_metadata?.full_name as string) || "",
      role: row?.role || "user",
      created_date: row?.created_date,
    };
  };

  return {
    auth: {
      me: (): Promise<CurrentUser> => (me ??= loadMe()),
    },
    asServiceRole: {
      entities: createEntities(serviceClient()) as Record<string, any>,
      integrations: {
        Core: {
          CreateFileSignedUrl: createFileSignedUrl,
          InvokeLLM: invokeLLM,
        },
      },
    },
    functions: {
      /** Call another API function as the same user, in-process. */
      async invoke(name: string, payload: Row = {}) {
        if (!dispatcher) throw new Error("Function calls aren't wired up.");
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (token) headers.authorization = `Bearer ${token}`;
        const res = await dispatcher(new Request(`http://internal/api/${name}`, { method: "POST", headers, body: JSON.stringify(payload) }));
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(data?.error || `${name} failed`), { response: { status: res.status, data } });
        return { data };
      },
    },
  };
}
