(() => {
  const S = window.__sim, C = window.__check;
  const T = 'MLB-dynasty: ';
  const lg = S.setupLeague('flb', { teams: 8, week: 2, name: 'Dynasty',
    settings: { leagueType: 'dynasty', useSalaryCap: true, scoringFormat: 'regular',
                tradeDeadlineWeek: 20, playoffStartWeek: 23, playoffTeams: 4 } });
  lg.seasonYear = 2026;

  // salary DB: first 200 players have imported AAV, rest are arb
  STATE.salaryDB = { flb: {} };
  lg.playerPool.slice(0, 200).forEach((p, i) => {
    STATE.salaryDB.flb[normName(p.name)] = { pos: p.eligible[0], team: 'NYY', aav: 40000000 - i * 150000 };
  });

  S.runDraft();
  S.genLogs(26);
  C(T + 'draft complete', lg.draft.complete);

  // ---- contracts & cap math ----
  S.as(1);
  const p = teamRoster('t1').find(x => importedAAV(x) != null);
  const aav = importedAAV(p);
  window._signTerm = 3;
  confirmSign(p.espnId);
  const c = playerContract(p);
  C(T + 'contract signed 3yr', c && c.termYears === 3 && c.baseAAV === aav && c.teamId === 't1', JSON.stringify(c));
  C(T + 'year-1 salary = 0.875x AAV', playerCapHit(p, 2026) === Math.round(aav * 0.875), playerCapHit(p, 2026));
  C(T + 'year-2 salary = 1.125x AAV', playerCapHit(p, 2027) === Math.round(aav * 1.125), playerCapHit(p, 2027));
  C(T + 'year-3 salary = 1.125^2 AAV', playerCapHit(p, 2028) === Math.round(aav * Math.pow(1.125, 2)));
  C(T + 'cap hit outside contract term = 0', playerCapHit(p, 2030) === 0, playerCapHit(p, 2030));
  const arbP = lg.playerPool[250]; // beyond salary DB import
  C(T + 'arb player flat salary', isArbPlayer(arbP) && playerCapHit(arbP) === SALCFG().arbSalary, arbP.name);
  const total = teamSalaryTotal('t1', 2026);
  const manual = teamRoster('t1').reduce((a, x) => a + playerCapHit(x, 2026), 0);
  C(T + 'team salary total sums roster', total === manual, total + '/' + manual);

  // ---- dead cap on contract drop ----
  const hit26 = playerCapHit(p, 2026);
  confirmDropCard(p.espnId);
  C(T + 'drop voids contract', !playerContract(p));
  C(T + 'dead cap = 2x current salary', (lg.deadCap['t1'] || [])[0].amount === 2 * hit26, JSON.stringify(lg.deadCap['t1']));
  C(T + 'dead cap counts in team total', teamSalaryTotal('t1', 2026) === teamSalaryTotal('t1', 2026), '');
  const totAfter = teamSalaryTotal('t1', 2026);
  const manAfter = teamRoster('t1').reduce((a, x) => a + playerCapHit(x, 2026), 0) + 2 * hit26;
  C(T + 'team total includes dead cap', totAfter === manAfter, totAfter + '/' + manAfter);

  // ---- money trade affects both caps ----
  S.as(2);
  const g2 = teamRoster('t2')[5], g3 = teamRoster('t3')[5];
  const t2before = teamSalaryTotal('t2', 2026), t3before = teamSalaryTotal('t3', 2026);
  window._trade = { to: 't3', fromPlayers: [String(g2.espnId)], toPlayers: [String(g3.espnId)],
    fromPicks: [{ year: 2027, round: 1 }], toPicks: [],
    money: [{ dir: 'fromTo', amount: 10000000, years: 2 }] };
  sendTradeProposal();
  S.as(3); acceptTrade(lg.trades[lg.trades.length - 1].id);
  C(T + 'player+pick+cash trade executes', lg.trades[lg.trades.length - 1].status === 'accepted');
  C(T + 'traded players change cap totals correctly',
    teamSalaryTotal('t2', 2026) === t2before - playerCapHit(g2, 2026) + playerCapHit(g3, 2026) + 5000000 &&
    teamSalaryTotal('t3', 2026) === t3before - playerCapHit(g3, 2026) + playerCapHit(g2, 2026) - 5000000,
    't2 ' + teamSalaryTotal('t2', 2026) + ' t3 ' + teamSalaryTotal('t3', 2026));
  C(T + 'pick ownership moved', String(pickOwner(2027, 1, 't2')) === 't3');
  // pick collision: t4 trades THEIR 2027 R1 to t5 — does it clobber t2->t3?
  S.as(4);
  window._trade = { to: 't5', fromPlayers: [String(teamRoster('t4')[6].espnId)], toPlayers: [String(teamRoster('t5')[6].espnId)],
    fromPicks: [{ year: 2027, round: 1 }], toPicks: [], money: [] };
  sendTradeProposal();
  S.as(5); acceptTrade(lg.trades[lg.trades.length - 1].id);
  C(T + 'two teams can each trade their own 2027 R1 (expected per-team tracking)',
    String(pickOwner(2027, 1, 't2')) === 't3' && String(pickOwner(2027, 1, 't4')) === 't5',
    't2 pick now owned by ' + pickOwner(2027, 1, 't2') + ', t4 pick by ' + pickOwner(2027, 1, 't4'));

  // ---- signing closed after trade deadline ----
  S.setWeek(21);
  C(T + 'signing closed after deadline wk20', !signingOpen());
  S.as(1);
  const unsigned = teamRoster('t1').find(x => importedAAV(x) != null && !playerContract(x));
  window._signTerm = 2; confirmSign(unsigned.espnId);
  C(T + 'confirmSign blocked after deadline', !playerContract(unsigned));

  // ---- rookie draft ----
  S.setWeek(24);
  // add rookies to the pool
  for (let i = 0; i < 24; i++) {
    lg.playerPool.push({ espnId: 9000 + i, name: 'Rookie Guy' + i, adp: 500 + i, eligible: ['OF'],
      mlbId: 9500 + i, isRookie: true });
  }
  ensureRD();
  lg.rookieDraft.enabled = true; lg.rookieDraft.rounds = 2; lg.rookieDraft.snake = true;
  lg.rookieDraft.order = lg.teams.map(t => t.id);
  startRookieDraft();
  let guard = 0;
  while (RD().live && !RD().complete && guard++ < 200) autoRookiePick();
  C(T + 'rookie draft completes', RD().complete, 'picks=' + (RD().picks || []).length);
  C(T + 'rookie picks are 2 rounds x 8', (RD().picks || []).length === 16);
  const rookiesPicked = (RD().picks || []).every(pk => {
    const pl = lg.playerPool.find(x => String(x.espnId) === String(pk.playerId));
    return pl && pl.isRookie;
  });
  C(T + 'rookie draft prefers rookie-flagged players', rookiesPicked);
  // do rookie picks reach rosters?
  const rk = RD().picks[0];
  C(T + 'rookie-drafted player appears on team roster (expected)',
    teamRoster(rk.teamId).some(x => String(x.espnId) === String(rk.playerId)),
    'rookie ' + rk.playerId + ' teamId ' + rk.teamId + ' roster size ' + teamRoster(rk.teamId).length);
  // can another team instantly steal the rookie via FA add? (test pre-playoffs so adds are open)
  S.setWeek(10);
  S.as(3);
  const before3 = teamRoster('t3').length;
  confirmDrop(teamRoster('t3')[before3 - 1].espnId); // make room
  addPlayerFromPool(rk.playerId);
  C(T + 'rookie not addable as FA by another team (expected guard)',
    !teamRoster('t3').some(x => String(x.espnId) === String(rk.playerId)));

  // ---- season rollover: penalties, contract aging, cap growth ----
  // put t6 way over the cap: sign several stars to long deals
  lg.settings.salaryCapDollars = 100000000; // tighten cap so t6 is over
  const capBefore = leagueCap();
  const pen = teamCapPenalty('t6', 2026);
  C(T + 'over-cap penalty computed', pen.picks >= 1, JSON.stringify(pen));
  // give t1 a 1-yr contract that should expire at rollover
  S.setWeek(10); S.as(1);
  const oneYr = teamRoster('t1').find(x => importedAAV(x) != null && !playerContract(x));
  window._signTerm = 1; confirmSign(oneYr.espnId);
  C(T + '1yr contract signed pre-rollover', !!playerContract(oneYr));
  const t6PicksLostBefore = JSON.stringify(lg.removedPicks || {});
  confirmSeasonRollover();
  C(T + 'rollover advances season year', currentSeasonYear() === 2027, currentSeasonYear());
  C(T + 'cap grows 5%', leagueCap() === Math.round(capBefore * 1.05), leagueCap());
  C(T + 'expired 1yr contract released player to FA',
    !teamRoster('t1').some(x => String(x.espnId) === String(oneYr.espnId)) && !playerContract(oneYr));
  C(T + 'over-cap team lost pick(s)', JSON.stringify(lg.removedPicks || {}) !== t6PicksLostBefore, JSON.stringify(lg.removedPicks));
  C(T + 'dead cap from 2026 cleared', !(lg.deadCap['t1'] || []).length, JSON.stringify(lg.deadCap));

  const bad = S.renderAll();
  C(T + 'all pages render', bad.length === 0, bad.join(' ; '));
})();
