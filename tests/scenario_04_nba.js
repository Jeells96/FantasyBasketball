(() => {
  const S = window.__sim, C = window.__check;
  const T = 'NBA: ';
  const lg = S.setupLeague('fba', { teams: 10, week: 1, name: 'Hoops',
    settings: { leagueType: 'redraft', snake: true, scoringFormat: 'regular',
                waiverMode: 'priority', playoffStartWeek: 20, playoffTeams: 4, tradeDeadlineWeek: 26 } });

  // basketball skips baseball's pitcher/arbitration concepts but gets everything
  // else — an IL with the same cap relief, and recent-form stat windows
  C(T + 'NBA skips the baseball-only concepts', !FEAT().pitchers && !FEAT().arb
    && !FEAT().probableStarters && FEAT().perGameScoring);
  C(T + 'NBA has an IL like ESPN basketball leagues do', FEAT().ir && SP().irCount > 0,
    SP().irCount);
  C(T + 'NBA gets recent-form stat windows too', FEAT().statWindows);
  C(T + 'and FP/G is its default, not season totals', statWindowOptions()[0][0] === 'fpg',
    JSON.stringify(statWindowOptions()[0]));
  C(T + 'every offered window maps to a real field',
    statWindowOptions().every(([w]) => !!PTS_FIELDS[w]));
  const rounds = draftRounds();
  C(T + 'roster = 6 starters + 10 bench', rounds === 16, rounds);
  const d = S.runDraft();
  C(T + 'draft completes', d.complete, 'picks=' + d.picks);
  C(T + 'pick count = 10 x 16', d.picks === 160, d.picks);
  const sizes = lg.teams.map(t => teamRoster(t.id).length);
  C(T + 'rosters even', sizes.every(s => s === 16), sizes.join(','));
  let allValid = true, det = '';
  for (const t of lg.teams) {
    const assign = defaultLineup(t.id);
    if (Object.keys(assign).length < activeLineupSlots().length) { allValid = false; det = t.id; }
  }
  C(T + 'default lineups fill all slots', allValid, det);

  // ---- weekly scoring: NBA now has a real stats provider (ESPN game logs) ----
  S.genLogs(26);
  S.setWeek(10);
  const totals = lg.teams.map(t => teamWeekTotal(t.id, 5));
  C(T + 'weekly team scores are non-zero', totals.every(x => x > 0),
    'week-5 totals: ' + totals.join(','));
  const rec = computeRecords();
  const played = Object.values(rec).map(r => r.w + r.l + r.t);
  C(T + 'records accumulate', played.every(x => x === 10), played.join(','));
  const gw = Object.values(rec).reduce((a,r)=>a+r.w,0), gl2 = Object.values(rec).reduce((a,r)=>a+r.l,0);
  C(T + 'league W == league L', gw === gl2, gw + '/' + gl2);
  // NBA scoring uses the basketball catalog (pts/reb/ast/stl*2/blk*2/to*-1)
  const nbaP = lg.playerPool[0];
  const g = (LG().gameLogs[nbaP.mlbId] || [])[0];
  const expect = g.stat.points + g.stat.rebounds + g.stat.assists
               + g.stat.steals*2 + g.stat.blocks*2 - g.stat.turnovers;
  C(T + 'a game scores per the NBA catalog', gamePoints(g.stat, g.group) === expect,
    gamePoints(g.stat, g.group) + ' vs ' + expect);
  C(T + 'NBA is schedule-backed (real tip-off times available)', FEAT().schedule === true);
  C(T + 'NBA gameLogs feature enabled', FEAT().gameLogs === true);
  const br = (S.setWeek(21), playoffBracket());
  C(T + 'playoff bracket forms', !!br, br && JSON.stringify(br.rounds[0].pairs));

  // waivers/trades still function mechanically
  S.as(1);
  const dropP = teamRoster('t1')[15];
  confirmDrop(dropP.espnId);
  C(T + 'drop -> waivers works', !!lg.waivers[dropP.espnId]);
  S.as(2); confirmDrop(teamRoster('t2')[15].espnId);
  openClaimModal(dropP.espnId); submitClaim(dropP.espnId);
  lg.waivers[dropP.espnId].until = Date.now() - 1;
  processWaivers();
  C(T + 'priority waiver claim works', teamRoster('t2').some(x => String(x.espnId) === String(dropP.espnId)));
  S.as(3);
  window._trade = { to: 't4', fromPlayers: [String(teamRoster('t3')[0].espnId)],
    toPlayers: [String(teamRoster('t4')[0].espnId)], fromPicks: [], toPicks: [], money: [] };
  const a = teamRoster('t3')[0], b = teamRoster('t4')[0];
  sendTradeProposal();
  S.as(4); acceptTrade(lg.trades[lg.trades.length - 1].id);
  C(T + 'trade works', teamRoster('t4').some(x => String(x.espnId) === String(a.espnId)) &&
    teamRoster('t3').some(x => String(x.espnId) === String(b.espnId)));

  // salary cap must be refused for non-dynasty; and dynasty for NBA?
  toggleSalaryCap();
  C(T + 'salary cap refused outside dynasty', !LSET().useSalaryCap);

  const bad = S.renderAll();
  C(T + 'all pages render', bad.length === 0, bad.join(' ; '));
})();
