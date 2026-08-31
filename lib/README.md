# lib — vendored

`algebra.ts`, `wire.ts` and `delegate.ts` are copied verbatim from the `tower` project, an
implementation of §4–§5 of Neil Ghani's *Containers for Typed Agentic AI*:
the four combinators (`+`, `⊠`, `◁`, `×`) as first-class values, and a
delegate/serve pair that makes each hop between servers an actual CLI process.

They are vendored rather than depended on so this repository stands alone.
Nothing in them is specific to the game — that is the point of copying them
unchanged.

There is exactly **one** deliberate divergence from upstream: `wire.ts`
originally imported `isRecord` from the tower's double-entry bookkeeping
module, which has nothing to do with this game, so the four-line helper is
inlined instead. Any other difference is a bug here, not a feature.
