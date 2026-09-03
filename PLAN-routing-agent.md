# Routing and a typed agent for Stalin: The Game

## Context

`stalin` is a command-economy game built as five HTTP servers composed with Ghani's
container combinators. `lib/algebra.ts` implements all four, but the game uses only three.
The note says so twice, and both slides in the new deck repeat it:

- §"The game": *"We only use the first three in this game. Adding routing to the game is
  another future project."*
- §"Delegation": *"Our example game `stalin` does not yet include a typed agent, but all
  the machinery is here to add one. Perhaps a corrupt commissariat who has some ideas of
  his own about how to run the country."*

This change closes both gaps, and closes them together: the agent's reply is what selects
the branch of the sum. The deterministic five-server game is unchanged when the agent is
not running, so `playthrough.sh`, `search.ts`, `calibrate.ts` and `optimise.py` keep
working untouched.

## A constraint that changes the shape of the answer

The composite we discussed was `seqC(commissar, route)` — ask the commissar, and let his
reply compute which branch of the sum to prompt. **I do not believe that typechecks**, and
the reason is documented in `lib/algebra.ts` itself, in the comment on `SeqC`:

> *What is lost is a `next` that branches between shapes of `d`; such a function has a
> union return type and lies in no single fibre.*

`SeqC<A, B>` distributes over `B`'s fibres, so each composite fibre demands a `next`
landing in **one** fibre of `B`. `SumC` has two fibres by construction, and a `next` that
returns `left(...) | right(...)` lands in neither. This is precisely the leak §"Two
limits" describes, met in the wild.

So the agent still chooses the route — that intent is preserved exactly — but the choosing
is an `await` and a branch, not a `◁` composite:

```ts
const route = sumC(build, importTractors)   // (tractors × armaments) + buyAbroad

const word = await commissar.run(
  { tag: "Advise", year, steel: s.steel, gold: s.gold, tractors: s.tractors }, depth);

const shape = word.recommend === "buy"
  ? route.right({ tag: "BuyTractors", gold: s.gold, year })
  : route.left(build.offer(
      { tag: "BuildTractors",  steel: word.recommend === "tractors" ? s.steel : 0,
        plantCapacity: s.plantCapacity, year },
      { tag: "BuildArmaments", steel: word.recommend === "armaments" ? s.steel : 0, year }));

const outcome = await route.run(shape, depth);
```

**Step 0 of implementation is to verify this**, with a ten-line spike and `deno check`
before anything else is written. If `seqC(commissar, route)` *does* typecheck, the plan
gets better and I will say so. If it does not, that failure is worth a paragraph in
`orestis-v1.tex` §"Two limits" and a slide, because it is the sharpest concrete instance
of the leak the note only describes abstractly.

A second honest wrinkle, visible in the code above: `sumC` deliberately does **not** re-tag
positions (`pos (Left p) = c.Pos p`, as its comment says), so `outcome` is a bare union of
the product's `{side, value}` and the import's `{tractors, goldUsed}`. The caller must
discriminate structurally with `"side" in outcome`. That is not a defect — it is what the
sum means — but it should be commented at the call site.

## Files to change

**New: `commissar.server.ts`, port 8806.** Modelled line for line on `industry.server.ts`,
which is the shortest existing leaf: a discriminated `CommissarPrompt` union, a `handlers`
table with one function per tag, an `answer` dispatcher, a `parseCommissar` wire validator
that checks every field rather than casting, and the `if (import.meta.main)
serveContainer({...})` footer. Fibres: `Advise`, `Report`, `Reset` — `Reset` is mandatory,
per the `ResetAck` comment in `containers.ts`.

Its `Advise` handler shells out to the `claude` binary, present at
`/opt/homebrew/bin/claude`, version 2.1.231:

```ts
const cmd = new Deno.Command("claude", { args: ["-p", prompt], stdout: "piped" });
```

The prompt casts Claude as the commissar and demands a bare JSON object back. **The
decoder is the whole point of the exercise** and must be strict: an unparseable or
out-of-union reply fails the fibre rather than being coerced. That is the "Unchecked types"
slide made executable — the type is a promise, and the decoder at the boundary is the only
thing that ever checks it.

**`containers.ts`** — add `CommissarC` (the three fibres above, `Advise` answering
`{ recommend: "tractors" | "armaments" | "buy"; note: string }`) and `ImportC`, a
single-fibre container for `BuyTractors` on the trade port. `ImportC` mirrors how
`TractorWorksC` and `ArmamentsC` already split one port into two single-fibre containers so
they can be the two sides of a `productC`.

**`gosplan.server.ts`** — add the `commissar` and `importTractors` leaves with their
decoders (alongside the existing block at lines 44-78), build `route = sumC(build,
importTractors)`, and add the branch above inside `runAutumn`, where the existing `build`
call sits at lines 395-411. The leaf is built only when the agent is enabled, so the
existing deterministic path at those lines stays exactly as it is:

```ts
const commissar = agentEnabled ? leaf<CommissarC>("commissar", CM, decoders) : null;
```

Add `trace(depth, "down", "gosplan", route.label)` before `route.run`, mirroring the
existing calls at lines 258 and 377, so the trace shows the algebraic label above the hops.

**`ReapOrder` and `parseGos`** — extend `build` with a `"commissar"` option, meaning *let
him decide*. `parseGos` (lines 553-586) is the wire validator and must accept it. This
keeps the agent a player choice rather than a hidden mode, and it is the only new prompt
surface.

**`play.ts`** — offer the new option in `autumnOptions` (lines 302-364) only when the agent
is up, following the existing `why:` pattern that explains why a move is unavailable.
`stalin.ts` needs `--build commissar` to parse.

**`up.sh` / `down.sh` / `wait-ports.sh`** — start the sixth server only under `--agent`.
`wait-ports.sh` currently blocks on exactly five ports (`[ "$n" -eq 5 ]`) and must take an
expected count instead, or `up.sh --agent` will hang. `down.sh` must learn 8806 or the
process survives. Scope the new server's permissions to `--allow-run=deno,claude` rather
than inheriting the unscoped `--allow-run` the other five get.

**`type-tests.ts`** — add a block in the existing `expect<T>` / `@ts-expect-error` style
asserting that the two summands stay disjoint: a `BuildTractors` shape must not be
accepted by `route.right`, and an `Advise` reply outside the three-way union must not
typecheck.

**Docs** — the ASCII diagram in `README.md` (lines 21-27) gains a sixth box; its four-
combinators table (lines 175-188) gains the `+` row it currently cannot fill; and §"What
the reports are worth" (line 190) is exactly where the agent's non-determinism belongs,
since it already says a dispatch's type guarantees its shape and says nothing about its
truth.

**`lib/` is not to be touched.** `lib/README.md` records that `algebra.ts`, `wire.ts` and
`delegate.ts` are vendored verbatim from the `tower` project with exactly one deliberate
divergence. `sumC` is already there and already correct; nothing in this plan needs a new
primitive.

## Verification

1. **Types.** `deno check *.ts lib/*.ts`. `type-tests.ts` is checked and never run, and it
   fails both when a legal move is rejected and when an illegal one is accepted.
2. **No regression, agent off.** Capture `./playthrough.sh` output before the change,
   re-run after, and diff. It is seeded and must be byte-identical — its own comment calls
   it a regression test. Then `deno run search.ts` on a small grid to confirm strategy
   ranking is unchanged.
3. **Routing, agent off.** The sum must be exercisable without an LLM: drive
   `route.right(...)` directly from a one-off script against a running trade server, and
   confirm the trace shows the `+` label.
4. **The agent, end to end.** `./up.sh --agent`, then `stalin new --seed 1928`, `stalin sow
   ...`, `stalin reap --build commissar`. Watch the ↓/↑ trace: the commissar hop, then the
   branch actually taken. Run it three times and confirm the recommendation can differ,
   which is the honest demonstration that this leaf is not deterministic.
5. **The decoder holds.** Point the server at a stub that returns `{"recommend":"potatoes"}`
   and confirm the fibre fails loudly rather than coercing.

## Confidence

High on everything except the `seqC` question, which is why it is step 0. The rest is
additive: a new leaf on the pattern of an existing one, a combinator already implemented
and tested, and an opt-in flag that leaves every deterministic path alone. My estimate is
that the code lands in one session, and that the most valuable output is not the feature
but the paragraph explaining why `◁` could not wrap `+`.
