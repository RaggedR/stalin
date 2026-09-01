// wire.ts — the boundary.  Everything a level knows about types dies here.
//
// Two things cross between levels: a JSON document, and a depth counter.  The
// depth rides in an HTTP header rather than in the prompt, because the prompt
// is the container's shape and nothing that isn't a prompt belongs in it.

/** The one divergence from upstream: `isRecord` is inlined rather than
 *  imported from the tower's bookkeeping domain, which has nothing to do with
 *  this game. Everything else in this file is verbatim. */
const isRecord = (u: unknown): u is Record<string, unknown> =>
  typeof u === "object" && u !== null && !Array.isArray(u);

const DEPTH_HEADER = "x-tower-depth";
const enc = new TextEncoder();

// ── Trace: control flows down, data flows back up ─────────────────────
// Written to stderr so stdout stays pure JSON and the CLI stays pipeable.
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

export function trace(depth: number, dir: "down" | "up", who: string, what: string) {
  const pad = "  ".repeat(depth);
  const arrow = dir === "down" ? "↓" : "↑";
  const line = `${pad}${arrow} ${bold(who.padEnd(9))} ${dim(what)}\n`;
  Deno.stderr.writeSync(enc.encode(line));
}

// ── Delegating: u : P -> Q, made executable ───────────────────────────
// The delegate leg of a container morphism is not a function call here — it
// is a PROCESS.  Firing the low-level prompt means spawning the CLI tool that
// carries it to the next server.  Control genuinely flows down.
export async function delegate(
  port: number,
  prompt: unknown,
  depth: number,
): Promise<unknown> {
  // A hop costs a process, which is the whole point: control genuinely flows
  // down, and the boundary is real rather than a function call wearing a
  // costume. It also costs about a fifth of a second, and a parameter search
  // that plays a hundred games pays that forty times per game. STALIN_INPROC
  // keeps the HTTP hop — same servers, same handlers, same books, same weather
  // — and skips only the spawn. It is off by default and no game the player
  // ever sees uses it; it exists so the balance harness can finish.
  if (Deno.env.get("STALIN_INPROC") === "1") {
    const res = await fetch(`http://localhost:${port}`, {
      method: "POST", headers: depthHeaders(depth), body: JSON.stringify(prompt),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`delegate to :${port} answered ${res.status} — ${text}`);
    return JSON.parse(text) as unknown;
  }
  const script = new URL("./delegate.ts", import.meta.url).pathname;
  const cmd = new Deno.Command("deno", {
    args: [
      "run", "--quiet", "--allow-net", "--allow-env",
      script, String(port), JSON.stringify(prompt), String(depth),
    ],
    stdout: "piped",
    stderr: "inherit", // the child's trace lines join ours
  });
  const { code, stdout } = await cmd.output();
  const text = new TextDecoder().decode(stdout);
  if (code !== 0) throw new Error(`delegate to :${port} exited ${code}`);
  return JSON.parse(text) as unknown;
}

/** Fire several prompts at once and require a reply from each — the tensor's defining move. */
export const delegateAll = <T extends readonly [number, unknown][]>(
  calls: T,
  depth: number,
): Promise<unknown[]> =>
  Promise.all(calls.map(([port, prompt]) => delegate(port, prompt, depth)));

// ── Listening: the runtime supplies the loop, we supply the handler ───
export function serveContainer<P extends { tag: string }>(opts: {
  name: string;
  port: number;
  parse: (u: unknown) => P | null;
  answer: (p: P, depth: number) => Promise<unknown>;
}): void {
  Deno.serve({ port: opts.port, onListen: () => {} }, async (req) => {
    const depth = Number(req.headers.get(DEPTH_HEADER) ?? "0");
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "not JSON" }, 400);
    }
    const prompt = opts.parse(body);
    if (prompt === null) {
      // The validator refused.  No cast was made, so nothing ill-typed is
      // downstream of this line — that is the whole point of validating.
      return json({ error: "not a valid prompt for this container", got: body }, 400);
    }
    trace(depth, "down", opts.name, describe(prompt));
    try {
      const reply = await opts.answer(prompt, depth + 1);
      trace(depth, "up", opts.name, summarise(reply));
      return json(reply, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      trace(depth, "up", opts.name, `FAILED: ${msg}`);
      return json({ error: msg }, 500);
    }
  });
}

const json = (v: unknown, status: number) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { "content-type": "application/json" },
  });

export const depthHeaders = (depth: number) => ({
  "content-type": "application/json",
  [DEPTH_HEADER]: String(depth),
});

// ── Trace formatting ──────────────────────────────────────────────────
function describe(p: { tag: string }): string {
  const rest = Object.entries(p)
    .filter(([k]) => k !== "tag")
    .map(([k, v]) => `${k}=${short(v)}`)
    .join(" ");
  return rest ? `${p.tag} ${rest}` : p.tag;
}

function summarise(v: unknown): string {
  if (Array.isArray(v)) return `[${v.length} item${v.length === 1 ? "" : "s"}]`;
  if (isRecord(v)) {
    const keys = Object.keys(v);
    return `{${keys.slice(0, 4).join(", ")}${keys.length > 4 ? ", …" : ""}}`;
  }
  return short(v);
}

function short(v: unknown): string {
  if (Array.isArray(v)) return `[${v.length}]`;
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 34 ? s.slice(0, 33) + "…" : s;
}
