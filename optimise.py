#!/usr/bin/env python3
"""optimise.py — search the rule constants for the game Robin described.

The brief is eight statements the game must make at once (see calibrate.ts).
They are coupled: enemyPower decides who wins, but how much anyone CAN build
depends on eats, the grain price, the railway and the engineers — so tuning
one at a time walks in circles, which is what happened by hand.

Score is primary = criteria met, then tie-breaks that prefer a game which
makes its point clearly: the intended optimum should beat its runner-up by a
visible margin, and the totally-brutal line should be worse but not absurdly
worse.  Random restarts, then coordinate descent from the best.
"""
import json, random, re, subprocess, pathlib, sys, time

ROOT = pathlib.Path(__file__).parent
STATE = ROOT / "state.ts"

# name -> (regex to find it, candidate values)
KNOBS = {
    "enemyPower":       (r"(enemyPower: )(\d+(?:\.\d+)?)(,)",       [30, 40, 50, 60, 70, 80]),
    "eats":             (r"(eats: )(\d+(?:\.\d+)?)(,)",             [1.0, 1.05, 1.1, 1.15, 1.2]),
    "grainPerGold":     (r"(grainPerGold: )(\d+(?:\.\d+)?)(,)",     [1.0, 1.5, 2.0, 3.0, 4.0]),
    "railPerWorker":    (r"(railPerWorker: )(\d+(?:\.\d+)?)(,)",    [3.0, 4.5, 6.0, 8.0, 10.0]),
    "engineerGold":     (r"(engineerGold: )(\d+(?:\.\d+)?)(,)",     [8, 10, 15, 20]),
    "engineerCapacity": (r"(engineerCapacity: )(\d+(?:\.\d+)?)(,)", [15, 25, 35, 45]),
    "armamentYield":    (r"(armamentYield: )(\d+(?:\.\d+)?)(,)",    [0.3, 0.5, 0.7, 0.9]),
    "tractorSteel":     (r"(tractorSteel: )(\d+(?:\.\d+)?)(,)",     [1.0, 1.5, 2.0, 3.0]),
    "tractorGold":      (r"(tractorGold: )(\d+(?:\.\d+)?)(,)",      [6, 10, 14, 20]),
    "plantSteel":       (r"(plantSteel: )(\d+(?:\.\d+)?)(,)",       [6.0, 12.0, 20.0]),
    "fieldYield":       (r"(fieldYield: )(\d+(?:\.\d+)?)(,)",       [2.2, 2.6, 3.0]),
    "tractorYield":     (r"(tractorYield: )(\d+(?:\.\d+)?)(,)",     [5.0, 6.0, 8.0, 10.0]),
}

def write(cfg):
    s = STATE.read_text()
    for k, v in cfg.items():
        pat, _ = KNOBS[k]
        s = re.sub(pat, lambda m, v=v: f"{m.group(1)}{v}{m.group(3)}", s, count=1)
    STATE.write_text(s)

def read_current():
    s = STATE.read_text()
    out = {}
    for k, (pat, _) in KNOBS.items():
        m = re.search(pat, s)
        out[k] = float(m.group(2)) if m else None
    return out

def restart():
    subprocess.run([str(ROOT / "down.sh")], capture_output=True)
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin",
           "HOME": str(pathlib.Path.home()), "STALIN_INPROC": "1"}
    subprocess.run([str(ROOT / "up.sh")], capture_output=True, env=env)

def evaluate(cfg, seeds=(1928,)):
    write(cfg); restart()
    tot = {"met": 0, "gapSum": 0, "ok": True}
    for sd in seeds:
        try:
            r = subprocess.run(
                ["deno", "run", "--quiet", "--allow-net", "--allow-read", "--allow-env",
                 str(ROOT / "calibrate.ts"), str(sd), "--json"],
                capture_output=True, text=True, timeout=120,
                env={"PATH": "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin",
                     "HOME": str(pathlib.Path.home()), "STALIN_INPROC": "1"})
            d = json.loads(r.stdout.strip().splitlines()[-1])
        except Exception:
            return {"met": -1, "score": -1e9}
        tot["met"] += d["met"]
        opt, run_up, gap = d.get("optimum"), d.get("runnerUp"), d.get("brutalGap")
        # clarity: the optimum should beat the runner-up, and totally-brutal
        # should be worse than it but recognisably in the same game.
        clarity = 0
        if opt is not None and run_up:
            clarity += min(30, max(-30, run_up - opt))
        if gap is not None:
            clarity += 15 - abs(gap - 12)   # ideal: brutal costs ~12 more
        tot["gapSum"] += clarity
    n = len(seeds)
    tot["met"] /= n
    tot["score"] = tot["met"] * 1000 + tot["gapSum"] / n
    return tot

def main():
    random.seed(7)
    budget = int(sys.argv[1]) if len(sys.argv) > 1 else 120
    base = {k: v[len(v) // 2] for k, v in ((k, vv[1]) for k, vv in KNOBS.items())}
    best, bestres = dict(base), evaluate(base)
    print(f"start  met={bestres['met']:.2f} score={bestres['score']:.0f}", flush=True)

    used = 1
    # random restarts
    while used < budget // 2:
        cand = {k: random.choice(v[1]) for k, v in KNOBS.items()}
        res = evaluate(cand); used += 1
        if res["score"] > bestres["score"]:
            best, bestres = cand, res
            print(f"[{used:3}] random  met={res['met']:.2f} score={res['score']:.0f}  {cand}", flush=True)

    # coordinate descent from the best
    improved = True
    while improved and used < budget:
        improved = False
        for k, (_, vals) in KNOBS.items():
            for v in vals:
                if v == best[k]: continue
                cand = dict(best); cand[k] = v
                res = evaluate(cand); used += 1
                if res["score"] > bestres["score"]:
                    best, bestres, improved = cand, res, True
                    print(f"[{used:3}] {k}={v}  met={res['met']:.2f} score={res['score']:.0f}", flush=True)
                if used >= budget: break
            if used >= budget: break

    print("\nBEST", json.dumps(best, indent=2), flush=True)
    print(f"met={bestres['met']:.2f} score={bestres['score']:.0f}", flush=True)
    write(best); restart()

if __name__ == "__main__":
    main()
