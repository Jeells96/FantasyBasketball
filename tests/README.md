# Season simulation test harness

Drives the real app (index.html) headlessly in Chromium and simulates full
fantasy seasons for both sports and every league type: drafts (snake/linear,
keeper cost-round slotting, rookie drafts), weekly scoring (regular + best-game
with scopes), standings/records, lineups and locks, add/drop, waivers
(FAAB + rolling priority), trades (players, picks, cash), trade deadline,
playoffs, contracts/salary cap/dead cap, and season rollover.

The harness serves index.html with Firebase stubbed out (classic-script
transform) so the app runs fully offline and its internals are scriptable.
Synthetic player pools and deterministic game logs stand in for the
ESPN/MLB APIs.

Run:

    npm install playwright-core
    node sim.js            # CHROMIUM_PATH=/path/to/chromium if not auto-found

Each `scenario_*.js` file is evaluated in the page and reports PASS/FAIL
checks; results are also written to results.json.

Known expected failures (missing feature, not a regression):
- `NBA: weekly team scores are non-zero` / `NBA: records accumulate` —
  no NBA stats provider is wired yet, so NBA weekly H2H scoring is always 0.
