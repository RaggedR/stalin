// delegate.ts — the CLI tool a server spawns to fire a lower-level prompt.
//
// This file IS the delegate leg  u : P -> Q  of a container morphism, made
// executable.  It knows nothing about any container: it takes a port, a JSON
// prompt, and a depth, and carries the text across.  That ignorance is the
// point — u is a map of SHAPES, and shapes are exactly what survives the wire.
//
//     usage: delegate.ts <port> <json-prompt> <depth>
//     stdout: the reply, as JSON.  stderr: nothing (the server traces).

import { depthHeaders } from "./wire.ts";

const [portArg, promptArg, depthArg] = Deno.args;
if (!portArg || !promptArg) {
  console.error("usage: delegate.ts <port> <json-prompt> [depth]");
  Deno.exit(2);
}

const port = Number(portArg);
const depth = Number(depthArg ?? "0");

// The prompt was serialised by the caller and is re-parsed here purely to
// fail fast on malformed input; it is forwarded as text either way.
try {
  JSON.parse(promptArg);
} catch {
  console.error(`delegate: argument is not JSON: ${promptArg}`);
  Deno.exit(2);
}

let res: Response;
try {
  res = await fetch(`http://localhost:${port}`, {
    method: "POST",
    headers: depthHeaders(depth),
    body: promptArg,
  });
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`delegate: cannot reach :${port} — ${msg}`);
  Deno.exit(1);
}

const text = await res.text();
if (!res.ok) {
  console.error(`delegate: :${port} answered ${res.status} — ${text}`);
  Deno.exit(1);
}

// stdout is the reply and nothing else, so the parent can JSON.parse it whole.
console.log(text);
