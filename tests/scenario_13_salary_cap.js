(() => {
  const S = window.__sim, C = window.__check;
  const T = 'CapDefault: ';

  // ---- salary rules are PER SPORT ----
  STATE.salaryConfig = {};
  STATE.salaryDB = {};        // isolate: earlier scenarios leave a salary DB behind
  S.setupLeague('flb', { teams: 10, week: 2, name: 'MlbCap', settings: { leagueType: 'dynasty' } });
  const mlb = SALCFG();
  S.setupLeague('fba', { teams: 10, week: 2, name: 'NbaCap', settings: { leagueType: 'dynasty' } });
  const nba = SALCFG();
  C(T + 'baseball and basketball have different default caps',
    mlb.defaultCap !== nba.defaultCap, `mlb ${mlb.defaultCap} vs nba ${nba.defaultCap}`);
  C(T + 'NBA cap default is NBA-scale, not MLB-scale',
    nba.defaultCap > 100e6 && nba.defaultCap < 200e6, nba.defaultCap);
  C(T + 'NBA minimum salary is lower than MLB\'s', nba.arbSalary < mlb.arbSalary,
    `${nba.arbSalary} vs ${mlb.arbSalary}`);
  C(T + 'NBA max contract term is shorter than MLB\'s', nba.maxTerm < mlb.maxTerm,
    `${nba.maxTerm} vs ${mlb.maxTerm}`);

  // ---- editing one sport must not move the other ----
  STATE.sport = 'fba';
  setSalCfgM('defaultCap', 99);                 // 99M, basketball only
  setCapHeadroom('dynasty', 1.4);
  C(T + 'editing NBA rules changes NBA', SALCFG('fba').defaultCap === 99000000, SALCFG('fba').defaultCap);
  C(T + 'editing NBA rules leaves MLB untouched', SALCFG('flb').defaultCap === mlb.defaultCap,
    SALCFG('flb').defaultCap);
  C(T + 'headroom edit is per sport too',
    SALCFG('fba').headroom.dynasty === 1.4 && SALCFG('flb').headroom.dynasty === mlb.headroom.dynasty,
    `nba ${SALCFG('fba').headroom.dynasty} / mlb ${SALCFG('flb').headroom.dynasty}`);

  // The multiplier defaults to 1: the cap IS the average team payroll, so about half
  // the league starts over it. Anything higher and a snake draft's natural spread
  // keeps everyone under, which makes the cap decorative.
  C(T + 'the multiplier defaults to 1 for every league type',
    ['dynasty','keeper','redraft'].every(t => mlb.headroom[t] === 1 && nba.headroom[t] === 1),
    JSON.stringify(mlb.headroom));

  // ---- legacy migration: one flat config becomes the baseball config ----
  STATE.salaryConfig = { defaultCap: 300000000, arbSalary: 7000000, maxTerm: 12 };
  normalizeSalaryConfig();
  C(T + 'legacy flat config migrates to baseball', SALCFG('flb').defaultCap === 300000000,
    SALCFG('flb').defaultCap);
  C(T + 'legacy migration does not corrupt basketball', SALCFG('fba').defaultCap === 155000000,
    SALCFG('fba').defaultCap);
  C(T + 'migration is idempotent', (normalizeSalaryConfig(), SALCFG('flb').defaultCap) === 300000000);
  STATE.salaryConfig = {};

  // ---- the suggestion scales with league shape ----
  const capFor = (sport, teams, type) => {
    const lg = S.setupLeague(sport, { teams, week: 2, name: 'X', settings: { leagueType: type } });
    return capBasis();
  };
  // With every player at the minimum, team count can't matter — all rosters cost the same.
  STATE.salaryDB = {};
  const small = capFor('flb', 8, 'dynasty');
  const big   = capFor('flb', 16, 'dynasty');
  C(T + 'with no salary data, team count does not change the cap',
    small.cap === big.cap, `8t ${small.cap} vs 16t ${big.cap}`);
  C(T + 'basis reports the league shape it used',
    small.teams === 8 && big.teams === 16 && small.spots === big.spots,
    `${small.teams}/${big.teams} teams, ${small.spots} spots`);

  // roster size is the real driver of a team's payroll
  const lg = S.setupLeague('flb', { teams: 10, week: 2, name: 'RosterSize', settings: { leagueType: 'dynasty' } });
  const baseSpots = rosterCap();
  const baseCap = suggestedCap();
  LG().rosterOverride = { lineupSlots: activeLineupSlots(), benchCount: rosterBenchCount() + 8, irCount: 0 };
  const bigRosterCap = suggestedCap();
  C(T + 'a bigger roster needs a bigger cap', bigRosterCap > baseCap,
    `${baseSpots} spots => ${baseCap}, ${rosterCap()} spots => ${bigRosterCap}`);
  LG().rosterOverride = null;

  // the multiplier is still PER league type, so a commissioner can differentiate
  STATE.sport = 'flb';
  setCapHeadroom('dynasty', 1.2);
  const dyn = capFor('flb', 10, 'dynasty');
  const red = capFor('flb', 10, 'redraft');
  C(T + 'raising one type raises only that type', dyn.headroom === 1.2 && red.headroom === 1,
    `${dyn.headroom} vs ${red.headroom}`);
  C(T + 'and it moves that type\'s cap', dyn.cap > red.cap, `${dyn.cap} vs ${red.cap}`);
  STATE.salaryConfig = {};

  // ---- suggestion uses real salaries when a database exists ----
  const lg2 = S.setupLeague('flb', { teams: 10, week: 2, name: 'WithSalaries', settings: { leagueType: 'dynasty' } });
  const noDb = capBasis();
  C(T + 'without a salary DB it prices everyone at the minimum', noDb.usingRealSalaries === false);
  STATE.salaryDB = { flb: {} };
  lg2.playerPool.slice(0, 250).forEach((p, i) => {
    STATE.salaryDB.flb[normName(p.name)] = { aav: 30000000 - i * 100000 };
  });
  const withDb = capBasis();
  C(T + 'with a salary DB it uses the real numbers', withDb.usingRealSalaries === true);
  C(T + 'real salaries move the suggestion', withDb.cap !== noDb.cap, `${noDb.cap} -> ${withDb.cap}`);
  C(T + 'suggested cap is a clean $5M multiple', withDb.cap % 5000000 === 0, withDb.cap);
  C(T + 'suggested cap covers at least a minimum-salary roster',
    withDb.cap >= SALCFG().arbSalary * withDb.spots);
  // With real salaries, a deeper league rosters more marginal players, so the
  // average team payroll — and the cap — is genuinely lower.
  const deep = (S.setupLeague('flb', { teams: 20, week: 2, name: 'Deep', settings: { leagueType: 'dynasty' } }), capBasis());
  const shallow = (S.setupLeague('flb', { teams: 8, week: 2, name: 'Shallow', settings: { leagueType: 'dynasty' } }), capBasis());
  C(T + 'a deeper league needs a smaller per-team cap (rosters run cheaper)',
    deep.cap < shallow.cap, `20t ${deep.cap} vs 8t ${shallow.cap}`);

  // ---- enabling the cap seeds THIS league's cap ----
  const lg3 = S.setupLeague('flb', { teams: 12, week: 2, name: 'SeedCap', settings: { leagueType: 'dynasty' } });
  C(T + 'no cap stored before enabling', !(LSET().salaryCapDollars > 0));
  toggleSalaryCap();
  C(T + 'enabling the cap turns it on', LSET().useSalaryCap === true);
  C(T + 'enabling seeds a league-specific cap', LSET().salaryCapDollars === suggestedCap(),
    `${LSET().salaryCapDollars} vs ${suggestedCap()}`);
  C(T + 'leagueCap() reports the seeded value', leagueCap() === LSET().salaryCapDollars);

  // an existing custom cap must not be overwritten by toggling
  LG().settings.salaryCapDollars = 123000000;
  toggleSalaryCap();  // off
  toggleSalaryCap();  // on again
  C(T + 're-enabling never clobbers a cap the commissioner set',
    LSET().salaryCapDollars === 123000000, LSET().salaryCapDollars);

  // ---- explicit controls ----
  applySuggestedCap();
  C(T + 'applySuggestedCap writes the suggestion', LSET().salaryCapDollars === suggestedCap());
  C(T + 'per-league cap setter exists', typeof window.saveLeagueCap === 'function'
    && typeof window.openLeagueCap === 'function');

  // two leagues in the same sport can hold different caps
  const capA = LSET().salaryCapDollars;
  const lg4 = S.setupLeague('flb', { teams: 10, week: 2, name: 'OtherLeague',
    settings: { leagueType: 'dynasty', useSalaryCap: true, salaryCapDollars: 200000000 } });
  C(T + 'cap is per league, not per sport', leagueCap() === 200000000 && capA !== 200000000,
    `${capA} vs ${leagueCap()}`);

  // ---- the minimum salary tracks the data, not a constant ----
  const M = 'CapMinimum: ';
  STATE.salaryConfig = {};
  STATE.salaryDB = {};
  S.setupLeague('flb', { teams: 10, week: 2, name: 'MinSalary', settings: { leagueType: 'dynasty' } });
  const bakedIn = SALCFG().arbSalary;
  C(M + 'with no data it falls back to the built-in minimum', bakedIn === 5000000, bakedIn);
  C(M + 'and says so', SALCFG().arbSalaryDerived === false);
  // a salary world where everything costs 10x today's money — a league started years from now
  STATE.salaryDB = { flb: {} };
  LG().playerPool.forEach((p, i) => {
    STATE.salaryDB.flb[normName(p.name)] = { aav: i < 60 ? 300000000 - i * 1000000 : 40000000 };
  });
  const future = SALCFG();
  C(M + 'a loaded salary database sets the minimum itself', future.arbSalaryDerived === true);
  C(M + 'the derived minimum reflects that data, not 2026 money',
    future.arbSalary === 40000000, future.arbSalary);
  C(M + 'so the suggested cap is priced in that era\'s money',
    capBasis().minSalary === 40000000);
  // an explicit number in master settings still wins
  setSalCfgM('arbSalary', 3);
  C(M + 'a hand-set minimum overrides the derived one',
    SALCFG().arbSalary === 3000000 && SALCFG().arbSalaryDerived !== true, SALCFG().arbSalary);
  setSalCfgM('arbSalary', 0);   // clearing it hands control back to the data
  C(M + 'clearing it hands control back to the data',
    SALCFG().arbSalary === 40000000 && SALCFG().arbSalaryDerived === true, SALCFG().arbSalary);
  C(M + 'and never leaves the minimum at zero', SALCFG().arbSalary > 0);
  STATE.salaryConfig = {};

  STATE.salaryDB = {};
  const bad = S.renderAll();
  C(T + 'all pages render', bad.length === 0, bad.join(' ; '));
})();
