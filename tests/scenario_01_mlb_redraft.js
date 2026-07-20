(() => {
  const S = window.__sim, C = window.__check;
  const T = 'MLB-redraft: ';

  // ---- setup ----
  const lg = S.setupLeague('flb', { teams: 10, week: 1, name: 'Redraft',
    settings: { leagueType: 'redraft', snake: true, scoringFormat: 'regular', waiverMode: 'faab', faabBudget: 100, tradeDeadlineWeek: 26,
                waiverDays: 1, playoffStartWeek: 23, playoffTeams: 4, bonusWin: false } });

  // ---- draft ----
  const rounds = draftRounds();
  C(T + 'draftRounds = lineup+bench', rounds === activeLineupSlots().length + rosterBenchCount(), rounds);
  const d = S.runDraft();
  C(T + 'draft completes', d.complete, 'picks=' + d.picks);
  C(T + 'pick count = teams*rounds', d.picks === 10 * rounds, d.picks + ' vs ' + 10 * rounds);
  const ids = lg.draft.picks.map(p => String(p.playerId));
  C(T + 'no duplicate players drafted', new Set(ids).size === ids.length);
  const sizes = lg.teams.map(t => teamRoster(t.id).length);
  C(T + 'every roster full & even', sizes.every(s => s === rounds), sizes.join(','));
  // snake order: pick 11 (round 2 first pick) should be team 10
  C(T + 'snake order reverses round 2', String(lg.draft.picks[10].teamId) === 't10', lg.draft.picks[10].teamId);
  // every team can field a valid full lineup
  let allValid = true, detail = '';
  for (const t of lg.teams) {
    const assign = defaultLineup(t.id);
    const slots = activeLineupSlots();
    for (const [idx, pid] of Object.entries(assign)) {
      const p = teamRoster(t.id).find(r => String(r.espnId) === String(pid));
      if (!p || !slots[idx].eligible.some(e => p.eligible.includes(e))) { allValid = false; detail = t.id + ' slot ' + idx; }
    }
    if (Object.keys(assign).length < slots.length) { allValid = false; detail = t.id + ' only ' + Object.keys(assign).length + '/' + slots.length + ' filled'; }
  }
  C(T + 'default lineups valid+complete for all teams', allValid, detail);

  // ---- scoring engine ----
  S.genLogs(26);
  const p0 = lg.playerPool[1]; // a hitter
  const wk1 = playerWeekGames(p0.mlbId, 1);
  C(T + 'game logs land in week windows', wk1.length === 3, wk1.length);
  const manual = wk1.reduce((a, g) => a + gamePoints(g.stat, g.group), 0);
  C(T + 'playerWeekScore sums games (regular mode)', Math.abs(playerWeekScore(p0, 1) - Math.round(manual * 10) / 10) < 0.01,
    playerWeekScore(p0, 1) + ' vs ' + manual);
  // best-game mode
  lg.settings.scoringFormat = 'bestGame'; lg.settings.bestGameScope = 'all';
  const best = Math.max(...wk1.map(g => gamePoints(g.stat, g.group)));
  C(T + 'bestGame mode takes max game', playerWeekScore(p0, 1) === best, playerWeekScore(p0, 1) + ' vs ' + best);
  lg.settings.scoringFormat = 'regular';

  // score override
  STATE.scoreOverrides = {};
  STATE.scoreOverrides[`${STATE.activeLeagueDoc}|1|${p0.mlbId}`] = 99;
  C(T + 'score override adds as extra game (sum mode)', playerWeekScore(p0, 1) === Math.round((manual + 99) * 10) / 10, playerWeekScore(p0, 1));
  delete STATE.scoreOverrides[`${STATE.activeLeagueDoc}|1|${p0.mlbId}`];

  // ---- season: standings & records ----
  S.setWeek(22);
  const totals = lg.teams.map(t => teamWeekTotal(t.id, 5));
  C(T + 'team week totals > 0', totals.every(x => x > 0), totals.join(','));
  const rec = computeRecords();
  const gw = Object.values(rec).reduce((a, r) => a + r.w, 0);
  const gl = Object.values(rec).reduce((a, r) => a + r.l, 0);
  C(T + 'league W == league L over 22 wks', gw === gl, gw + '/' + gl);
  C(T + 'games played = weeks (each team w+l+t==22)', Object.values(rec).every(r => r.w + r.l + r.t === 22),
    Object.values(rec).map(r => r.w + r.l + r.t).join(','));
  // bonus win mode
  lg.settings.bonusWin = true;
  const rec2 = computeRecords();
  C(T + 'bonusWin adds a W or L each week', Object.values(rec2).every(r => r.w + r.l + r.t === 44),
    Object.values(rec2).map(r => r.w + r.l + r.t).join(','));
  lg.settings.bonusWin = false;

  // ---- matchup schedule sanity ----
  const sched = matchupSchedule();
  C(T + 'round robin covers 9 rounds of 5 pairs', Object.keys(sched).length === 9 && sched[1].length === 5);
  const opp = opponentFor('t1', 3);
  C(T + 'opponent symmetric', String(opponentFor(opp, 3)) === 't1', opp);

  // ---- lineup editing (future week, unlocked) ----
  lg.viewWeek = 24; // future
  S.as(1);
  const roster1 = teamRoster('t1');
  const benchGuy = roster1.find(p => !Object.values(getLineup('t1', 24).assignments).map(String).includes(String(p.espnId)));
  if (benchGuy) {
    const slots = activeLineupSlots();
    const idx = slots.findIndex(s => s.eligible.some(e => benchGuy.eligible.includes(e)));
    moveToSlot(benchGuy.espnId, idx);
    C(T + 'moveToSlot assigns benched player', String(LG().lineups['t1'][24].assignments[idx]) === String(benchGuy.espnId));
    // negative test: app allows assigning to an INELIGIBLE slot via direct call?
    const badIdx = slots.findIndex(s => !s.eligible.some(e => benchGuy.eligible.includes(e)));
    if (badIdx >= 0) {
      moveToSlot(benchGuy.espnId, badIdx);
      C(T + 'moveToSlot blocks ineligible slot (expected guard)',
        String(LG().lineups['t1'][24].assignments[badIdx]) !== String(benchGuy.espnId),
        'player elig ' + benchGuy.eligible.join('/') + ' placed in ' + slots[badIdx].slot);
    }
  } else C(T + 'found bench player for lineup test', false);
  // current-week lock
  lg.viewWeek = null;
  const lockedNow = isWeekLocked(currentWeekNow());
  C(T + 'current week is lineup-locked mid-week', lockedNow);

  // ---- add/drop + waivers (FAAB) ----
  S.as(1);
  const myDrop = teamRoster('t1')[teamRoster('t1').length - 1];
  confirmDrop(myDrop.espnId);
  C(T + 'drop puts player on waivers', !!LG().waivers[myDrop.espnId]);
  C(T + 'dropped player off roster', !teamRoster('t1').some(p => String(p.espnId) === String(myDrop.espnId)));
  // two claims: t2 bids 30, t3 bids 40 -> t3 wins, spends 40
  S.as(2); openClaimModal(myDrop.espnId); document.getElementById('claim-bid').value = 30; submitClaim(myDrop.espnId);
  // t2 needs roster room: drop someone first
  const t2drop = teamRoster('t2')[teamRoster('t2').length - 1];
  confirmDrop(t2drop.espnId);
  S.as(3);
  const t3drop = teamRoster('t3')[teamRoster('t3').length - 1];
  confirmDrop(t3drop.espnId);
  openClaimModal(myDrop.espnId); document.getElementById('claim-bid').value = 40; submitClaim(myDrop.espnId);
  LG().waivers[myDrop.espnId].until = Date.now() - 1000;   // expire window
  processWaivers();
  C(T + 'FAAB: higher bid wins claim', teamRoster('t3').some(p => String(p.espnId) === String(myDrop.espnId)));
  C(T + 'FAAB spent recorded', (LG().faabSpent || {})['t3'] === 40, JSON.stringify(LG().faabSpent));
  C(T + 'winner moves to back of priority', String(LG().waiverPriority[LG().waiverPriority.length - 1]) === 't3');
  // free-agent instant add after waivers cleared
  S.as(2);
  const fa = LG().playerPool.find(p => !LG().draft.picks.some(pk => String(pk.playerId) === String(p.espnId)) && !(LG().waivers || {})[p.espnId]);
  addPlayerFromPool(fa.espnId);
  C(T + 'FA instant add works', teamRoster('t2').some(p => String(p.espnId) === String(fa.espnId)));
  // roster-cap guard
  const fa2 = LG().playerPool.find(p => !LG().draft.picks.some(pk => String(pk.playerId) === String(p.espnId)) && !(LG().waivers || {})[p.espnId]);
  const before = teamRoster('t2').length;
  addPlayerFromPool(fa2.espnId);
  C(T + 'add blocked when roster full', teamRoster('t2').length === before, teamRoster('t2').length + ' vs cap ' + rosterCap());

  // ---- trades ----
  S.as(1);
  const give = teamRoster('t1')[2], get = teamRoster('t4')[2];
  window._trade = { to: 't4', fromPlayers: [String(give.espnId)], toPlayers: [String(get.espnId)], fromPicks: [], toPicks: [], money: [] };
  sendTradeProposal();
  const tr = LG().trades[LG().trades.length - 1];
  C(T + 'trade proposal pending', tr && tr.status === 'pending');
  // wrong team can't accept
  S.as(5); acceptTrade(tr.id);
  C(T + 'non-recipient cannot accept', tr.status === 'pending');
  S.as(4); acceptTrade(tr.id);
  C(T + 'trade executes on accept', tr.status === 'accepted' &&
    teamRoster('t4').some(p => String(p.espnId) === String(give.espnId)) &&
    teamRoster('t1').some(p => String(p.espnId) === String(get.espnId)));
  // trade after deadline — is anything blocking it?
  lg.settings.tradeDeadlineWeek = 10; // deadline long past (we're week 22)
  S.as(1);
  const give2 = teamRoster('t1')[3], get2 = teamRoster('t5')[3];
  window._trade = { to: 't5', fromPlayers: [String(give2.espnId)], toPlayers: [String(get2.espnId)], fromPicks: [], toPicks: [], money: [] };
  const nTradesBefore = LG().trades.length;
  sendTradeProposal();
  C(T + 'trade blocked after trade deadline (expected guard)',
    LG().trades.length === nTradesBefore && teamRoster('t1').some(p => String(p.espnId) === String(give2.espnId)),
    'deadline wk10, now wk22, trades ' + nTradesBefore + '->' + LG().trades.length);

  // ---- playoffs ----
  S.setWeek(23);
  let br = playoffBracket();
  C(T + 'bracket seeds 4 at wk23', br && br.rounds[0].pairs.length === 2 && !br.champ, JSON.stringify(br && br.rounds[0].pairs));
  S.setWeek(25); // past final week (24)
  br = playoffBracket();
  C(T + 'champion crowned after final week', !!(br && br.champ), br && br.champ);
  if (br && br.champ) {
    // verify champ actually beat its final opponent
    const fin = br.rounds[1].pairs[0];
    const a = teamWeekTotal(fin[0], 24), b = teamWeekTotal(fin[1], 24);
    const expected = a >= b ? fin[0] : fin[1];
    C(T + 'final decided by week-24 scores', String(br.champ) === String(expected), a + ' vs ' + b);
  }
  // rosters locked during playoffs
  C(T + 'rostersLocked() true in playoffs', rostersLocked());

  // ---- rendering ----
  const bad = S.renderAll();
  C(T + 'all 9 pages render without exception', bad.length === 0, bad.join(' ; '));
})();
