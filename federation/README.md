# federation

Seven cases, one structure. Working notes, not a document.

## The structure

Each member **has** a container and **is** a morphism, and keeping those apart is
what makes the rest legible.

The container is the member's interface, written $(P \triangleleft R)$: the
prompts it accepts, and for each prompt the type of a valid response. A tribe
accepts *muster*, *contribute*, *adjudicate*. A satrapy accepts *tribute*,
*levy*, *keep the peace*. A state accepts *requisition*. A firm accepts an order.

The morphism is the member's behaviour. It answers prompts on its own interface by
issuing prompts on its neighbours' interfaces and translating the replies back,
which is exactly $(u, f)$: forward on prompts, backward on responses.

So a federation is not a composite of containers. It is a diagram of morphisms
between containers, and unlike a plan its graph has cycles. The four combinators
build trees.

The failure is entirely in the response direction. Prompts travel round the cycle
because the forward map is covariant and composes freely. Replies never come back,
because a response type ends up defined in terms of itself. That is deadlock, and
it is the same thing as a decision that never concludes.

There are four ways to restore well-foundedness. Each one is a real political
mechanism.

| | Formally | Politically |
|---|---|---|
| **Orient** | choose a spanning tree, recover a root | elect a coordinator. Termination bought with a centre |
| **Unroll** | take the nth approximation, not the fixpoint | adopt a provisional decision because the evening ended |
| **Guard** | every cycle passes through a delay | the mandated delegate. An answer next round, not now |
| **Commute** | operations form a commutative monoid | act locally, reconcile later. No coordination needed |

## The cases

| Case | Repair | The distinctive move |
|---|---|---|
| [Persia](persia.md) | orient | the root specifies the interface and declines to know the interior |
| [Abraham](abraham.md) | orient | the root is placed behind, in time, rather than above |
| [Muhammad](muhammad.md) | orient | the root is a living person, so the federation has a succession problem |
| [Putin](putin.md) | orient, past the point of collapse | a federation that ate itself and destroyed its own information |
| [USA](usa.md) | orient, unroll and guard | three repairs in one document, and one commutativity failure it could not survive |
| [EU](eu.md) | all four, unresolved | the only case still openly arguing about whether it has a root |
| [Mergers](mergers.md) | contested | the merger of equals is the confederation claim, and it usually fails |

## The claim worth testing

A federation is well typed exactly where its operations commute, and grows a
centre exactly where they do not.

Building a bakery commutes with building another bakery. Allocating the last of
the steel does not. Slavery in one state and freedom in another do not commute
once a person moves, which is the entire content of Dred Scott.

## The second claim

The root must lie outside the set of members. No tribe accepts another tribe as
sovereign, because that is submission rather than federation. One god works
because none of them is it. A common ancestor works because he is dead. A written
constitution works because it is not a person. Where the root is inside the set,
as with Putin and with most mergers, the federation is already over and the
paperwork has not caught up.
