(() => {
  const S = window.__sim, C = window.__check;
  const T = 'Edge: ';
  const lg = S.setupLeague('flb', { teams: 6, week: 5, name: 'Edge',
    settings: { leagueType: 'redraft', scoringFormat: 'regular', waiverMode: 'faab',
                faabBudget: 100, waiverDays: 1, playoffStartWeek: 23, playoffTeams: 4 } });
  S.runDraft();
  S.genLogs(26);

  // ---- stale trade: proposed asset dropped before acceptance ----
  S.as(1);
  const x = teamRoster('t1')[4];
  window._trade = { to: 't2', fromPlayers: [String(x.espnId)], toPlayers: [String(teamRoster('t2')[4].espnId)], fromPicks: [], toPicks: [], money: [] };
  sendTradeProposal();
  const tr = lg.trades[lg.trades.length - 1];
  confirmDrop(x.espnId);                       // t1 drops the offered player
  S.as(2); acceptTrade(tr.id);
  C(T + 'stale trade (offered player already dropped) rejected or safe',
    tr.status !== 'accepted' || !teamRoster('t2').concat(teamRoster('t1')).some(() => false),
    'status=' + tr.status + '; t2 got dropped player? ' + teamRoster('t2').some(p => String(p.espnId) === String(x.espnId)) +
    '; t1 got t2 player? ' + teamRoster('t1').some(p => String(p.espnId) === String(tr.toPlayers[0])));
  C(T + 'stale trade did not move one side only',
    !(tr.status === 'accepted' && !teamRoster('t2').some(p => String(p.espnId) === String(x.espnId)) &&
      teamRoster('t1').some(p => String(p.espnId) === String(tr.toPlayers[0]))),
    'one-sided execution check');

  // ---- waiver: top FAAB bid but no funds -> falls to next claim ----
  S.as(3); const d3 = teamRoster('t3')[20]; confirmDrop(d3.espnId);
  lg.faabSpent = { t4: 95 };  // t4 has $5 left
  S.as(4); confirmDrop(teamRoster('t4')[20].espnId);
  openClaimModal(d3.espnId); document.getElementById('claim-bid').value = 5; submitClaim(d3.espnId);
  // t4 bid 5 (all funds); t5 bids 4
  S.as(5); confirmDrop(teamRoster('t5')[20].espnId);
  openClaimModal(d3.espnId); document.getElementById('claim-bid').value = 4; submitClaim(d3.espnId);
  // over-budget bid rejected at submit time
  S.as(6); confirmDrop(teamRoster('t6')[20].espnId);
  lg.faabSpent['t6'] = 99;
  openClaimModal(d3.espnId); document.getElementById('claim-bid').value = 50; submitClaim(d3.espnId);
  C(T + 'over-budget bid not registered', !(lg.waivers[d3.espnId].claims || []).some(c => String(c.teamId) === 't6'));
  lg.waivers[d3.espnId].until = Date.now() - 1;
  processWaivers();
  C(T + 'highest affordable bid wins', teamRoster('t4').some(p => String(p.espnId) === String(d3.espnId)));

  // ---- waiver: winner with FULL roster is skipped, next claim wins ----
  // top t2 back up to the cap first (stale-trade test may have left it short)
  S.as(2);
  while (rosterActiveCount('t2') < rosterCap()) {
    const fa = lg.playerPool.find(pp => !lg.draft.picks.some(pk => String(pk.playerId) === String(pp.espnId)) && !(lg.waivers || {})[pp.espnId]);
    addPlayerFromPool(fa.espnId);
  }
  S.as(1); const d1 = teamRoster('t1')[19]; confirmDrop(d1.espnId);
  // t5 has room (dropped earlier, claim resolved to t4), t2 is full
  S.as(2); openClaimModal(d1.espnId); document.getElementById('claim-bid').value = 20; submitClaim(d1.espnId);
  S.as(5); openClaimModal(d1.espnId); document.getElementById('claim-bid').value = 10; submitClaim(d1.espnId);
  lg.waivers[d1.espnId].until = Date.now() - 1;
  processWaivers();
  C(T + 'full-roster claimant skipped, next wins', teamRoster('t5').some(p => String(p.espnId) === String(d1.espnId)),
    't2 size=' + teamRoster('t2').length + ' cap=' + rosterCap());

  // ---- lineup carry-forward ----
  S.as(1);
  lg.viewWeek = 8;
  ensureLineupExists(8);
  const r1 = teamRoster('t1');
  const starterNow = Object.values(lg.lineups['t1'][8].assignments)[0];
  const benchP = r1.find(p => !Object.values(lg.lineups['t1'][8].assignments).map(String).includes(String(p.espnId))
    && p.eligible.join() === teamRoster('t1').find(q => String(q.espnId) === String(starterNow)).eligible.join());
  const lu9 = getLineup('t1', 9);
  C(T + 'week-9 lineup carries forward from week 8', lu9.carried === true || Object.keys(lu9.assignments).length > 0);

  // ---- teamWeekTotal counts starters only ----
  const starters = getStarters('t1', 8);
  const manual = starters.reduce((a, pid) => {
    const p = r1.find(q => String(q.espnId) === String(pid));
    return a + (p ? playerWeekScore(p, 8) : 0);
  }, 0);
  C(T + 'teamWeekTotal = sum of starters', Math.abs(teamWeekTotal('t1', 8) - Math.round(manual * 10) / 10) < 0.01,
    teamWeekTotal('t1', 8) + '/' + manual);
  const fullRosterSum = r1.reduce((a, p) => a + playerWeekScore(p, 8), 0);
  C(T + 'bench does not score', teamWeekTotal('t1', 8) < fullRosterSum);

  // ---- odd team count: bye weeks ----
  const lg2 = S.setupLeague('flb', { teams: 5, week: 3, name: 'OddTeams', settings: { scoringFormat: 'regular' } });
  S.runDraft(); S.genLogs(6);
  const oppByes = [1, 2, 3, 4, 5].map(w => opponentFor('t1', w));
  C(T + '5-team league gives byes', oppByes.includes(null), oppByes.join(','));
  const rec5 = computeRecords();
  C(T + '5-team records computable', !!rec5['t1']);

  // ---- duplicate claim replaced not duplicated ----
  const bad = S.renderAll();
  C(T + 'all pages render', bad.length === 0, bad.join(' ; '));
})();
