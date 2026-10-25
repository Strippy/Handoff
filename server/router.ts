// Routes /api/<name> to the API functions. All of them run in one Vercel function.
import { setDispatcher } from "./compat.js";
import billing from "./functions/billing.js";
import dealRoom from "./functions/deal-room.js";
import github from "./functions/github.js";
import listingSync from "./functions/listing-sync.js";
import scanProject from "./functions/scan-project.js";

const routes: Record<string, (req: Request) => Promise<Response>> = {
  billing,
  "deal-room": dealRoom,
  github,
  "listing-sync": listingSync,
  "scan-project": scanProject,
};

const MAX_BODY = 1_000_000; // JSON actions only; files go straight to storage

export async function dispatch(req: Request): Promise<Response> {
  const name = new URL(req.url).pathname.replace(/^\/api\/?/, "").split("/")[0];
  const handler = routes[name];
  if (!handler) return Response.json({ error: "Not found" }, { status: 404 });
  if (req.method !== "POST") return Response.json({ error: "Use POST" }, { status: 405, headers: { allow: "POST" } });
  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_BODY) return Response.json({ error: "Request too large" }, { status: 413 });
  try {
    const res = await handler(req);
    res.headers.set("cache-control", "no-store");
    return res;
  } catch (error) {
    console.error(`[api/${name}]`, error);
    return Response.json({ error: "Something went wrong — try again." }, { status: 500 });
  }
}

setDispatcher(dispatch);
