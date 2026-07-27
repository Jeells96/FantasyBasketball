(() => {
  const S = window.__sim, C = window.__check;
  const T = 'PickPenalty: ';
  const lg = S.setupLeague('flb', { teams: 6, week: 2, name: 'PickPen',
    settings: { leagueType: 'dynasty', useSalaryCap: true, scoringFormat: 'regular',
                tradeDeadlineWeek: 20, playoffStartWeek: 23, playoffTeams: 4 } });
  lg.seasonYear = 2026;
  STATE.salaryDB = { flb: {} };
  lg.playerPool.slice(0, 150).forEach((p, i) => {
    STATE.salaryDB.flb[normName(p.name)] = { aav: 30000000 - i * 100000 };
  });
  S.runDraft(); S.genLogs(26);

  // t1 trades their 2027 R1 to t2 (1-for-1 so roster caps hold)
  S.as(1);
  window._trade = { to: 't2', fromPlayers: [String(teamRoster('t1')[5].espnId)],
    toPlayers: [String(teamRoster('t2')[5].espnId)],
    fromPicks: [{ year: 2027, round: 1 }], toPicks: [], money: [] };
  sendTradeProposal();
  S.as(2); acceptTrade(lg.trades[lg.trades.length - 1].id);
  C(T + 'setup: t1 2027 R1 owned by t2', String(pickOwner(2027, 1, 't1')) === 't2');

  // every team is over the tightened cap; t1's R1 penalty must respect the trade
  lg.settings.salaryCapDollars = 100000000;
  C(T + 'setup: t1 over cap, loses picks', teamCapPenalty('t1', 2026).picks >= 1,
    JSON.stringify(teamCapPenalty('t1', 2026)));
  window._masterUnlocked = true;
  confirmSeasonRollover();   // penalties target year 2027

  // the receiver's acquired pick must be untouched
  C(T + 'receiver KEEPS the acquired 2027 R1 (not moved, not removed)',
    String(pickOwner(2027, 1, 't1')) === 't2' && !pickRemoved(2027, 1, 't1'),
    'owner=' + pickOwner(2027, 1, 't1') + ' removed=' + pickRemoved(2027, 1, 't1'));
  // the penalized team must actually lose a pick — their next OWN R1 (2028)
  C(T + 'penalized team forfeits their next own R1 (2028)',
    pickRemoved(2028, 1, 't1'), JSON.stringify(lg.removedPicks?.[2028]));
  C(T + 'penalized team did NOT get their traded pick back',
    String(pickOwner(2027, 1, 't1')) !== 't1');

  // a team that traded away R1s for ALL of the next 3 years: penalty lands on year 4
  const lg2 = S.setupLeague('flb', { teams: 4, week: 2, name: 'PickPen2',
    settings: { leagueType: 'dynasty', useSalaryCap: true, scoringFormat: 'regular' } });
  lg2.seasonYear = 2026;
  lg2.draft = { started: true, complete: true, order: lg2.teams.map(t => t.id), picks: [], currentPick: 0 };
  lg2.draftPicks = { 2027: { 1: { t1: 't2' } }, 2028: { 1: { t1: 't3' } }, 2029: { 1: { t1: 't4' } } };
  removeOnePick('t1', 1, 2027, null);
  C(T + 'all near-term R1s traded: penalty hits first still-owned year (2030)',
    pickRemoved(2030, 1, 't1') && !pickRemoved(2027, 1, 't1') && !pickRemoved(2028, 1, 't1') && !pickRemoved(2029, 1, 't1'),
    JSON.stringify(lg2.removedPicks));
  C(T + 'receivers all keep their acquired picks',
    String(pickOwner(2027, 1, 't1')) === 't2' && String(pickOwner(2028, 1, 't1')) === 't3' && String(pickOwner(2029, 1, 't1')) === 't4');

  // second penalty in the same round cascades past the first removal
  removeOnePick('t1', 1, 2027, null);
  C(T + 'second R1 penalty cascades to 2031', pickRemoved(2031, 1, 't1'), JSON.stringify(lg2.removedPicks));

  // rookie draft: receiver picks with the acquired slot, penalized slot vanishes
  lg2.seasonYear = 2027;
  ensureRD(); lg2.rookieDraft.enabled = true; lg2.rookieDraft.rounds = 1; lg2.rookieDraft.snake = false;
  lg2.rookieDraft.order = lg2.teams.map(t => t.id);
  const seq = rookieSequence();
  C(T + 'rookie draft 2027: t2 picks twice (own + acquired), t1 not at all',
    seq.filter(x => String(x) === 't2').length === 2 && !seq.some(x => String(x) === 't1'),
    seq.join(','));
})();
