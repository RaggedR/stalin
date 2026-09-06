# Making the Labyrinth worth playing

## What this is

`dungeon-crawler.pdf` describes the architecture completely and, until recently, described a
game with almost no decisions in it. Two sections have since been added — §4 *The economy* and
§7 *Tuning* — and `research-report.pdf` is the evidence behind them.

This plan is what remains. It has three parts: the four places the spec now contradicts itself
or stops short, the questions that need answering before code, and a build order in which every
phase ends in a measurement rather than a feature.

**The short version of the answer to "do we need more monsters and weapons and items?" is no.**
The argument is in §2 and it is the most important judgement in this document.

**Superseded in one respect.** §2 said monsters need an *interest* and treated it as one of three
small content changes. It has since become the centre of the game and has its own section in the
spec, §5 *A monster is a market*. There are now two economies rather than one. The physical
economy is bounded by hands and cannot lie to you; the information economy is bounded by light,
weighs nothing, and can. Monsters are the exchange between them, and they publish no rates. The
consequence for tuning is that the primary parameter is no longer rounds per torch but the
distribution of wants.

---

## 1. Where the spec is now broken

Four items. The first is a real contradiction, the second is a hole, the third is a definition
that does not yet compute, and the fourth is cosmetic.

### 1.1 Light has no scope, and two sections disagree about it

§4.1 calls light *the one scarce thing* and describes a torch burning down across a descent,
half of it reserved for the climb. §6.4 says going back down is a fresh prompt and not a
resumption, because the old call finished when the response came up.

So: does a party re-entering the labyrinth get a fresh torch?

- **If yes**, light is per-descent and it cannot be the resource that makes depth costly across
  a run, because a player simply goes back up and comes down again.
- **If no**, light is per-run and re-descending is nearly impossible, which kills the
  go-back-for-the-piece-you-missed loop that §6.4 exists to protect.

**Resolution: two clocks, nested.** Light is the tactical clock and it resets per descent.
Descents are the strategic clock and they never reset. This is the same shape as the
accompanying game, where sowing and reaping are the tactical turn and the five-year plan is
the strategic one, and it is why that game can ask a question in March and answer it in August
without either clock swallowing the other.

Every mechanic then attaches to exactly one clock, and that is the test of whether this is
right:

| clock | resets | what it prices |
|---|---|---|
| light, in rounds | each descent | rooms entered, shots fired, conversations held, the climb out |
| descents, counted | never | how many trips the whole game gets |

### 1.2 The third end is paid for in parties, and there is no party model

§4.7 says the bottom-in-time is paid for in parties. §1.2 fixes a party as one thing with a
number of hands, and says nothing about how many parties exist or where they come from.

**Recommendation, and it is the best idea in this plan.** There is a roster of people at the
surface. A party is a subset of the roster that you send down, and hands-per-party is chosen
at the outfit step. Death removes people from the roster permanently.

Then **hands are people**, and people are simultaneously the carrying capacity of a descent and
the supply of future descents. One resource serving two different ends is exactly the coupling
that makes the accompanying game more than three sliders, and it makes §4.8's trap literal
rather than analogical: a person lost to carry one more relic is a descent you cannot make in
the last year.

It also promotes the outfit `×`, which currently fires once and decides almost nothing, into a
real decision every trip. Send four hands and carry more and risk more. Send two and carry less
and keep a reserve.

### 1.3 Front breadth is asserted, not defined

§7.4 says to take the non-dominated set and measure *how wide it is*, and width is not a number.
It needs one before the tuner can hold it.

Two candidates, and both should be computed because they say different things:

- **Count**: how many of the ladder's runs are non-dominated. Cheap, interpretable, and coarse.
- **Spread**: the hypervolume of the non-dominated set against a fixed reference point. Standard,
  comparable between settings, and the right thing to put in an objective.

The README table of the accompanying game is the count version, printed by hand, and it is
already convincing. So start with count and add hypervolume when two fronts have to be ranked
against each other.

### 1.4 Stale headings

§4.9 is titled *What the five have in common* and there are now more than five. §7.1's opening
paragraph lists only the four numeric knobs and predates the three ends and the deadline.
Cosmetic, but this is a spec.

---

## 2. Do we need more monsters, weapons and items?

No. Adding content is the standard answer to *this game is boring* and here it is the wrong one,
for three reasons.

**The census already told us where the fault was.** §4's operator count showed zero decisions in
the body of a level and one uninformed coin flip per level. That is a decision-density problem.
Content variety does not raise decision density, it lengthens the game at the same density, so
more monsters would have produced a longer boring game.

**Content is paid for in the thing that makes generation safe.** §6 argues that a generated level
is checkable precisely because the actions and the loot kinds are finite tables the compiler
holds. Every new monster kind widens the response table and every new item kind widens the depth
table. The budget for generated content is exactly the narrowness of those two tables, so
spending it on variety spends it on the wrong thing.

**Two weapons and five distances is already ten cases with eight misses.** A third weapon adds
cases, not decisions, unless it competes for something the first two do not. Nothing currently
proposed does.

### What content *does* need

Three changes, none of which is a new kind of thing.

1. **Monsters get an interest.** A private thing each one wants, discoverable by asking. Not a
   new action, because §5.1 already lists `answer` and `bargain` among the six. A field on the
   prompt, which the generator was writing anyway. This is what turns conversation from rhetoric
   into a trade, and it is the fix that makes the non-determinism load-bearing.

2. **Loot gets a second number.** Not new kinds, but weight as well as value. A relic worth forty
   taking two hands against gold worth twenty taking one. This makes the hands product continuous
   instead of binary and it is the highest-value single change in this section.

3. **The five item kinds are already the three ends** and should be labelled as such rather than
   extended:

   | item | end it serves | notes |
   |---|---|---|
   | gold, relics | the haul | the only sellable things |
   | puzzle pieces | the labyrinth opened | explicitly unsellable, and they cost a hand |
   | keys | both | opens a way, and the way holds haul |
   | torches | the means | buys light, which buys everything else |
   | arrows | the means | buys distance |

   Nothing is missing from that table. What was missing was the statement that it maps onto the
   ends, which is now §4.7.

---

## 3. Answers to the standing questions

Compressed, because most of these are now in the spec and this is the index to them.

### The objectives

Three, held apart, with no exchange rate. Spec §4.7.

1. **The haul.** Gold and relics sold at the surface. Paid for in depth and hands.
2. **The labyrinth opened.** Locks opened from below, puzzles solved, wings entered. Permanent,
   compounding, survives death. Paid for in hands, light, and pieces that cannot be sold.
3. **The bottom, in time.** Level eight before the descents run out. A threshold, not a quantity.
   Paid for in people.

The reckoning prints all three and does not add them up.

### The trade-offs

| against | over | mechanism |
|---|---|---|
| haul vs opened | hands | a piece cannot be sold and occupies a hand |
| opened vs bottom | light and descents | rounds spent arguing with a keeper are rounds not spent going down |
| haul vs bottom | people | a person lost carrying one more relic is a descent not made later |

And the coupling that makes it a position rather than a menu: the costs arrive on different
schedules. People spent early are absent late, so the aggressive line runs out of roster
holding the most thoroughly unlocked labyrinth nobody ever reached the bottom of.

### The rewards

| reward | schedule | honest because |
|---|---|---|
| loot inside the depth-typed bound | variable ratio, variance rising with depth | the type bound is fixed, only the draw varies |
| the keeper's verdict | variable ratio | nothing in the program knows the answer |
| the informative refusal, ~30% | near miss | it names the missing piece, so it teaches |
| a lock opened from below | fixed and permanent | this is the one that survives death |

Nothing in this game can be repeated without spending a clock, which is what structurally
prevents any of it becoming a lever.

### The decisions

| when | operator | the decision |
|---|---|---|
| each descent | `×` | how many people to send, and what they carry down |
| each room | `×` | is this room worth the rounds, given the rounds are also the way home |
| each round | `×` | swing, spend an arrow, or draw |
| each round | `+` | strike, trade, move, or speak, as position permits |
| before the stair | `+` | which way down, informed by whatever a monster was persuaded to say |
| at the bottom | `×` | which of the things found comes up, hand by hand |
| at a keeper | `◁*` | what argument to make, with the verdict unknowable in advance |
| at the surface | `×` | torches, arrows, or a weapon, out of one purse |

### The strategies to expect

These are the acceptance test and they should be written before the numbers are chosen. Names
deliberately in the style of the accompanying game's eight lines.

| line | shape | expected to |
|---|---|---|
| the Prospector | shallow, repeated, all haul, no pieces | win on gold, never reach the bottom |
| the Locksmith | carries only pieces, sells nothing | open everything, arrive poor and unarmed |
| the Sprinter | one room a level, straight down | reach the bottom or lose the party trying |
| the Fordson | spends the purse on torches and arrows every trip, builds no route | pay again every descent, and stall |
| the Brutalist | full parties deep and early | open fast, then have nobody for the last descent |
| the drifter | one room, climb out, repeat | measurably worst, and it must be |

At least three of those should be non-dominated at a good setting. If one dominates the rest on
all three ends, the ends are not really three.

### The parameters

Two kinds, because two different optimisers are needed. Spec §7.6.

**Numeric.** Rounds per torch, deepest level bearing a torch, arrows per quiver, hands per
person, roster size, descents allowed, sword and bow damage, monster closing speed, rooms per
level, monsters per room, labyrinth depth, loot value by depth, loot weight by depth, loot
variance by depth, informative-refusal rate.

**Prompt.** What a monster is told it wants. How readily it is told to lie. How strict a standard
a keeper holds. How much a monster is told it knows about the level beneath.

### How they get tuned

Numeric knobs by non-dominated sorting with crowding distance, against the table-driven cheap
tier, thousands of runs. Prompt knobs by a model reading the run logs and rewriting them, against
the real monsters, tens of runs. Output is an archive of settings, one per region of behaviour,
not a single winner. Spec §7.6 through §7.8.

---

## 4. Questions I should not answer alone

1. **Roster size and descents allowed.** These two numbers between them decide whether the game
   is a campaign or an afternoon. The tuner can find them, but the range it searches is a
   judgement about what the game is.
2. **Does the keeper's obligation rule survive a deadline?** §6.3 says looking at a locked way is
   what plants its keys beneath you, so a player must explore early to have anything to solve.
   The deadline punishes exploring. That is either the best tension in the game or a trap that
   makes puzzles a losing line, and it is the first thing the cheap tier should be asked.
3. **Is the reckoning really scoreless?** Printing three numbers and refusing to rank them is
   right for a design document. Whether a player will accept it is a different question, and the
   accompanying game is the evidence that they might.

---

## 5. Build order

Every phase ends in a measurement. That ordering is not tidiness — the whole thesis is that the
numbers get chosen by playing, so the measuring apparatus is a dependency of the design and not
a follow-up to it.

**Phase 0 — the spec. DONE.** Two clocks (spec §4.1, replacing *Light*), the roster (spec §1.3,
new), hands as people with loot carrying a weight (§4.4), the item-to-end mapping (§4.7), the
monster's interest alongside its fact (§4.5), breadth defined as a count with spread as the
comparable version (§7.4), the muster and the reckoning added to the algebra, the operator table
split in two, the build order rewritten as measurements, and the trace updated to show the record
that now exists. `dungeon-crawler.pdf` is 30 pages and compiles clean.

**Phase 1 — descent and one clock.** Three levels, one room each, hand written, no monsters.
Light burns, the climb costs, the trace shows both columns.
*Measure:* Timid beats Random. If not, stop.

**Phase 2 — the calibrate file, before any tuning.** Write the six lines of §3 as a test that
runs them all on one seed and prints one scorecard. This is what the accompanying game learned
and it learned it the expensive way. The design brief belongs in an executable file before the
constants have values.
*Measure:* the file runs and all six lines are refused or scored.

**Phase 3 — hands, pieces, one keeper.** Two ends now exist. Loot gets weight as well as value.
*Measure:* the front over (haul, opened) has more than one point. If it is a point, the two ends
are one end and the fix is in the design.

**Phase 4 — roster, deaths, descents.** The third end. The outfit `×` becomes a real decision.
*Measure:* the full three-dimensional front, and bindingness across light, arrows, hands and
people. If light binds in ninety-five runs out of a hundred, three of the four are decoration.

**Phase 5 — table monsters and the ladder.** The cheap tier. Four policies as a tensor.
Non-dominated sorting over the numeric box.
*Measure:* depth and breadth across the whole box, and the archive. Also the first real answer to
question 4.2.

**Phase 6 — the command as a sum, and a round of fighting.** The operators with the most work to
do, now with something to spend.
*Measure:* counterfactual regret at the way down, which needs the same party record sent both
ways against two fresh levels.

**Phase 7 — Claude behind the interface.** One monster you can talk to, with an interest. The
dear tier. Prompt knobs tuned by reading logs.
*Measure:* does the region found in Phase 5 survive a monster that can lie.

**Phase 8 — the generator.** Last, because everything above is what it has to produce.

### What is already done

Phase 0 is finished. `research-report.pdf` is the evidence, §4 and §7 of `dungeon-crawler.pdf`
are the design, §1.1 through §1.4 of this file are closed, and no code exists yet. Phase 1 is next
and it is the first line of TypeScript.

One thing changed in the algebra while closing §1.1, and it was not planned. The reckoning is a
tensor. Three ends computed from the same final state, none a function of another, and no operator
anywhere joining them. The refusal to give a score turns out to be an operator the note already
had.
