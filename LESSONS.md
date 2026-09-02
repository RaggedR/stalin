# LESSONS.md

Rules for writing `orestis.tex`, learned by getting them wrong.

## Examples

- **Illustrate with the smallest example that makes the point, not with code from
  the game.** Real code carries names the reader has not met (`opts`, `depth`,
  `AGRI`, `rec`, `Fib`), and every one of them becomes a question. Build a
  three-line example on the shelf of books instead. Show the game's version only
  where the game's own structure is the subject.
- **Run every example and paste what it printed.** Never hand-edit output, and
  never trim the code that produced it. A listing with no timing calls cannot
  print milliseconds; a listing without `performance.now` must not show a
  duration.
- **Reuse a function the reader already has** (`asBook` from §7) rather than
  introducing a new one to make the same point.

## Explanation

- **Do not answer a question by adding a paragraph.** Several small clarifications
  in a row turn a subsection into two pages of type arithmetic that explains
  nothing. When a passage attracts three questions, the passage is wrong. Cut it
  back to what it is for.
- **A heading must stand alone.** "Writing the third part by hand" refers to a
  list two pages earlier and means nothing where it appears.
- **A backwards pointer needs a target on the same page.** "The first line above",
  "the previous section", "the table above" all break the moment something is
  deleted or a `\newpage` is inserted. Restate the thing instead.
- **Never gesture at a mechanism with a metaphor.** "Compute freely and touch
  nothing" says nothing; enumerate what is permitted and what is forbidden.

## Terms

- **Every keyword and type name gets defined before use, in §4 if it is
  TypeScript.** `is`, `export`, `Extract`, `readonly`, `.map`, `.trim` were all
  used first and explained later or not at all.
- **`reply` for the container's second half; `response` only for HTTP.** The type
  `Response` is defined in §3.5, so using the same word for the algebra makes a
  sentence ambiguous between the wire and the interface.
- **When one word does two jobs, say so.** `extends` is a requirement and a
  question; `export` is a shell builtin and a TypeScript keyword.

## Facts

- **Check claims about the machine against the machine.** The kernel is not
  process 1. Deno is not a single-threaded process. The scheduler does not prefer
  sibling threads.

## Workflow

- **`open -a Skim` in the Bash tool is sandboxed and launches nothing while
  returning 0.** Pass `dangerouslyDisableSandbox`, and verify with `pgrep -l Skim`
  rather than trusting the exit code. Better: render the page with `pdftoppm` and
  read the PNG, which proves what is actually on the page.
