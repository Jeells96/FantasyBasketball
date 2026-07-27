(() => {
  const S = window.__sim, C = window.__check;
  const T = 'MLB-keeper: ';
  const lg = S.setupLeague('flb', { teams: 8, week: 1, name: 'Keeper',
    settings: { leagueType: 'keeper', keeperCount: 2, scoringFormat: 'bestGame', bestGameScope: 'all',
                waiverMode: 'priority', waiverDays: 1, playoffStartWeek: 21, playoffTeams: 2 } });

  // season 1 draft + season
  S.runDraft();
  C(T + 'season-1 draft complete', lg.draft.complete);
  S.genLogs(26);
  S.setWeek(20);

  // best-game scoping: pitchersOnly
  lg.settings.bestGameScope = 'pitchersOnly';
  const hitter = lg.playerPool[1], pitcher = lg.playerPool.find(p => p.eligible.includes('SP'));
  const hGames = playerWeekGames(hitter.mlbId, 3).map(g => g.pts);
  const pGames = playerWeekGames(pitcher.mlbId, 3).map(g => g.pts);
  C(T + 'scope pitchersOnly: hitter sums', playerWeekScore(hitter, 3) === Math.round(hGames.reduce((a, b) => a + b, 0) * 10) / 10);
  C(T + 'scope pitchersOnly: pitcher best-game', playerWeekScore(pitcher, 3) === Math.max(...pGames));
  lg.settings.bestGameScope = 'all';

  // priority waivers: worst team should win contested claim
  const rec = computeRecords();
  S.as(1);
  const dropP = teamRoster('t1')[teamRoster('t1').length - 1];
  confirmDrop(dropP.espnId);
  // make room + claims from t2 and t5
  S.as(2); confirmDrop(teamRoster('t2')[20].espnId); openClaimModal(dropP.espnId); submitClaim(dropP.espnId);
  S.as(5); confirmDrop(teamRoster('t5')[20].espnId); openClaimModal(dropP.espnId); submitClaim(dropP.espnId);
  const wp = ensureWaiverPriority().map(String);
  const expected = wp.indexOf('t2') < wp.indexOf('t5') ? 't2' : 't5';
  LG().waivers[dropP.espnId].until = Date.now() - 1;
  processWaivers();
  const gotIt = ['t2', 't5'].find(t => teamRoster(t).some(p => String(p.espnId) === String(dropP.espnId)));
  C(T + 'priority waivers: higher-priority claimant wins', gotIt === expected, 'winner=' + gotIt + ' expected=' + expected);

  // 2-team playoff (single championship week)
  S.setWeek(22);
  const br = playoffBracket();
  C(T + '2-team playoff = single championship', br && br.rounds.length === 1 && !!br.champ, JSON.stringify(br && br.rounds[0]));

  // ---- keeper flow into season 2 ----
  window._masterUnlocked = true;
  openKeeperFlow();
  C(T + 'keeper flow opens for keeper league', !!window._keep);
  // each team keeps its first 2 draftees
  for (let ti = 0; ti < lg.teams.length; ti++) {
    const team = lg.teams[window._keep.ti];
    const roster = teamRoster(team.id);
    toggleKeeperSel(team.id, roster[0].espnId);
    toggleKeeperSel(team.id, roster[1].espnId);
    // over-limit guard
    if (ti === 0) {
      toggleKeeperSel(team.id, roster[2].espnId);
      C(T + 'keeperCount limit enforced', (window._keep.sel[team.id] || []).length === 2);
    }
    keeperNextTeam();
  }
  C(T + 'keeper flow resets draft for new season', !lg.draft.complete && lg.draft.picks.length === 0);
  C(T + 'keepers recorded for all teams', Object.keys(lg.keepers || {}).length === 8, Object.keys(lg.keepers || {}).length);
  const t1k = (lg.keepers['t1'] || []).map(k => k.costRound).sort().join(',');
  C(T + 'same-round keepers bumped to next round', t1k === '1,2', t1k);

  // season 2 draft honors keepers
  lg.draft.order = lg.teams.map(t => t.id);
  startLiveDraft();
  let guard = 0;
  while (lg.draft.live && !lg.draft.complete && guard++ < 3000) { checkKeeperSkips(); autoPickForCurrent(); }
  C(T + 'season-2 draft completes with keepers', lg.draft.complete, 'picks=' + lg.draft.picks.length);
  let ok = true, det = '';
  for (const t of lg.teams) {
    for (const k of (lg.keepers[t.id] || [])) {
      const pk = lg.draft.picks.find(p => String(p.playerId) === String(k.espnId));
      if (!pk || String(pk.teamId) !== String(t.id)) { ok = false; det = t.id + ' lost ' + k.name; }
      else if (pk.round !== k.costRound && !pk.addedFA) { ok = false; det = k.name + ' at rd ' + pk.round + ' not ' + k.costRound; }
    }
  }
  C(T + 'every keeper lands on their team at cost round', ok, det);
  const ids2 = lg.draft.picks.map(p => String(p.playerId));
  C(T + 'season-2 no duplicate players', new Set(ids2).size === ids2.length);
  const sizes = lg.teams.map(t => teamRoster(t.id).length);
  C(T + 'season-2 rosters even', sizes.every(s => s === sizes[0]), sizes.join(','));

  const bad = S.renderAll();
  C(T + 'all pages render', bad.length === 0, bad.join(' ; '));
})();
