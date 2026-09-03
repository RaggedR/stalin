// commissar.server.ts (:8806) — the typed agent.
//
// Every other commissariat answers with arithmetic a person wrote. This one
// spawns the `claude` binary and answers with whatever comes back on its
// standard output. Structurally it is the same thing: a container served over
// a socket, prompted by a CLI hop, answering a position indexed by the shape
// it was given. The Plan cannot tell the difference from above, and that is
// the entire claim of the note — a CLI tool is already a container, and the
// Claude Code harness is a CLI tool.
//
// What it costs is stated plainly in `containers.ts`: nothing checks that the
// text coming back is an `Advice`. The decoder below is the only place in the
// system where that is ever established, and it is a runtime check on a value
// that arrived as bytes. The type is a promise. The decoder is the audit.

import { type Steel, isNum, isRecord, isStr } from "./state.ts";
import type { Advice, Dispatch, ResetAck } from "./containers.ts";
import { Books } from "./commissariat.ts";
import { serveContainer } from "./lib/wire.ts";

export type CommissarPrompt =
  | { tag: "Advise"; year: number; steel: Steel; gold: number;
      tractors: number; warReserve: Steel }
  | { tag: "Report"; year: number }
  | { tag: "Reset"; seed: number };

export interface CommissarResponses {
  Advise: Advice;
  Report: Dispatch;
  Reset: ResetAck;
}
type Reply<K extends CommissarPrompt["tag"]> = CommissarResponses[K];

let seed = Number(Deno.env.get("STALIN_SEED") ?? "1928");
// He files dispatches like the rest of them, and lies about as much as trade.
let books = new Books("The Commissar", seed + 5, 0.6, 1);
let asked = 0;
let followed = 0;

// ── The three words he is allowed to say ──────────────────────────────
const CHOICES = ["tractors", "armaments", "buy"] as const;
type Choice = (typeof CHOICES)[number];
const isChoice = (u: unknown): u is Choice =>
  isStr(u) && (CHOICES as readonly string[]).includes(u);

/** The brief. It asks for one JSON object and nothing else, because the reply
 *  is parsed and not read. Note what it does NOT do: it does not describe the
 *  game's scoring, and it does not say which answer is wanted. He has ideas of
 *  his own, and the point of the exercise is that they are his. */
function brief(p: Extract<CommissarPrompt, { tag: "Advise" }>): string {
  return [
    "You are a commissar in the Soviet command economy, advising Gosplan in",
    `the year ${p.year} of the First Five-Year Plan.`,
    "",
    "The state currently holds:",
    `  steel        ${p.steel}`,
    `  gold         ${p.gold}`,
    `  tractors     ${p.tractors}`,
    `  war reserve  ${p.warReserve}`,
    "",
    "Steel may be spent on tractors, which raise the harvest, or on armaments,",
    "which are worth nothing unless there is a war. Gold may instead be spent",
    "abroad on foreign tractors, which costs no steel at all.",
    "",
    "Reply with a single JSON object and no other text, of exactly this form:",
    '  {"recommend": "tractors" | "armaments" | "buy", "note": "<one sentence>"}',
  ].join("\n");
}

/** Spawn the harness. This is the same `Deno.Command` the note's §"Deno can
 *  call Claude Code" listing uses, and it is the same mechanism by which every
 *  other hop in this game is made: a process, an argument vector, and standard
 *  output. */
async function askClaude(prompt: string): Promise<string> {
  const cmd = new Deno.Command("claude", {
    args: ["-p", prompt],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout } = await cmd.output();
  if (code !== 0) throw new Error(`claude exited ${code}`);
  return new TextDecoder().decode(stdout).trim();
}

/** The first of the two boundaries. Text in, `Advice` out, or an exception.
 *
 *  A model asked for bare JSON will sometimes wrap it in a fenced block, so
 *  the fence is stripped. Nothing else is forgiven: a reply whose `recommend`
 *  is not one of the three words fails here rather than being coerced to a
 *  default, because a default would silently turn an unchecked type into a
 *  checked-looking one. */
export function decodeAdvice(text: string): Advice | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  let u: unknown;
  try {
    u = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isRecord(u)) return null;
  if (!isChoice(u.recommend)) return null;
  if (!isStr(u.note)) return null;
  return { recommend: u.recommend, note: u.note };
}

const handlers = {
  Advise: async (p: Extract<CommissarPrompt, { tag: "Advise" }>): Promise<Advice> => {
    asked += 1;
    const text = await askClaude(brief(p));
    const advice = decodeAdvice(text);
    if (advice === null) {
      // Loudly. A commissariat that cannot answer its own container is not a
      // commissariat that should be allowed to answer approximately.
      throw new Error(`commissar: reply did not decode as Advice: ${text.slice(0, 200)}`);
    }
    followed += 1;
    return advice;
  },

  // He is judged on how often he was asked and how often he answered, which
  // is not a quota anyone can fail. He inflates it anyway.
  Report: (p: Extract<CommissarPrompt, { tag: "Report" }>): Dispatch =>
    books.record(p.year, asked, followed),

  Reset: (p: Extract<CommissarPrompt, { tag: "Reset" }>): ResetAck => {
    seed = p.seed;
    books = new Books("The Commissar", seed + 5, 0.6, 1);
    asked = 0;
    followed = 0;
    return { ok: true };
  },
};

function answer<P extends CommissarPrompt>(p: P): Promise<Reply<P["tag"]>> {
  const h = handlers[p.tag] as (q: CommissarPrompt) => Reply<P["tag"]> | Promise<Reply<P["tag"]>>;
  return Promise.resolve(h(p));
}

export function parseCommissar(u: unknown): CommissarPrompt | null {
  if (!isRecord(u) || !isStr(u.tag)) return null;
  switch (u.tag) {
    case "Advise":
      return isNum(u.year) && isNum(u.steel) && isNum(u.gold) &&
        isNum(u.tractors) && isNum(u.warReserve)
        ? { tag: "Advise", year: u.year, steel: u.steel, gold: u.gold,
            tractors: u.tractors, warReserve: u.warReserve }
        : null;
    case "Report":
      return isNum(u.year) ? { tag: "Report", year: u.year } : null;
    case "Reset":
      return isNum(u.seed) ? { tag: "Reset", seed: u.seed } : null;
    default:
      return null;
  }
}

if (import.meta.main) {
  serveContainer({ name: "commissar", port: 8806, parse: parseCommissar, answer });
}
