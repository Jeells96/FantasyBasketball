(() => {
  const S = window.__sim, C = window.__check;
  const T = 'MidWeekDrop: ';
  const lg = S.setupLeague('flb', { teams: 4, week: 6, name: 'MidDrop',
    settings: { leagueType: 'redraft', scoringFormat: 'regular', tradeDeadlineWeek: 26, playoffStartWeek: 23 } });
  S.runDraft(); S.genLogs(26);
  S.as(1);

  const wk = currentWeekNow();
  const nextWk = wk + 1;
  const slots = activeLineupSlots();
  ensureLineupExists(wk);
  const assignNow = () => lg.lineups['t1'][wk].assignments;

  // pick a starter who has already played this week (logs exist => locked)
  const startedIdx = Object.keys(assignNow()).find(k => assignNow()[k]);
  const startedId = assignNow()[startedIdx];
  const startedP = teamRoster('t1').find(p => String(p.espnId) === String(startedId));
  C(T + 'setup: starter is locked (already played this week)', playerLockedForWeek(startedP, wk));

  const theirPts = playerWeekScore(startedP, wk);
  const totalBefore = teamWeekTotal('t1', wk);
  C(T + 'setup: they are scoring points this week', theirPts > 0, theirPts);

  // ---- THE DROP ----
  confirmDrop(startedId);

  C(T + 'dropped player is off the actual roster', !teamRoster('t1').some(p => String(p.espnId) === String(startedId)));
  C(T + 'roster spot is freed immediately', rosterActiveCount('t1') === rosterCap() - 1,
    rosterActiveCount('t1') + '/' + rosterCap());
  // ...but this week is unchanged
  C(T + 'they STAY in this week\'s lineup', getStarters('t1', wk).includes(String(startedId)));
  C(T + 'you keep the points they already scored', teamWeekTotal('t1', wk) === totalBefore,
    teamWeekTotal('t1', wk) + ' vs ' + totalBefore);
  C(T + 'holdover is recorded for this week only', holdoversFor('t1', wk).includes(String(startedId))
    && !holdoversFor('t1', nextWk).includes(String(startedId)));
  C(T + 'rosterForWeek includes them this week', rosterForWeek('t1', wk).some(p => String(p.espnId) === String(startedId)));
  C(T + 'rosterForWeek excludes them next week', !rosterForWeek('t1', nextWk).some(p => String(p.espnId) === String(startedId)));
  C(T + 'held-over player is flagged for the UI', rosterForWeek('t1', wk).find(p => String(p.espnId) === String(startedId))?.heldOver === true);

  // ---- next week: gone, slot empty, spot usable ----
  C(T + 'not a starter next week', !getStarters('t1', nextWk).includes(String(startedId)));
  C(T + 'scores nothing for the team next week',
    !rosterForWeek('t1', nextWk).some(p => String(p.espnId) === String(startedId)));
  // the vacated slot is empty next week and can be filled by a replacement
  lg.viewWeek = nextWk;
  ensureLineupExists(nextWk);
  const nextAssign = lg.lineups['t1'][nextWk].assignments;
  C(T + 'their slot is empty next week', !nextAssign[startedIdx], JSON.stringify(nextAssign[startedIdx]));
  const fa = lg.playerPool.find(p => !lg.draft.picks.some(pk => String(pk.playerId) === String(p.espnId))
    && !(lg.waivers || {})[p.espnId]
    && slots[startedIdx].eligible.some(e => p.eligible.includes(e)));
  addPlayerFromPool(fa.espnId);
  moveToSlot(fa.espnId, Number(startedIdx));
  C(T + 'replacement can take the vacated slot next week',
    String(nextAssign[startedIdx]) === String(fa.espnId), JSON.stringify(nextAssign[startedIdx]));
  C(T + 'replacement does NOT retroactively join this week',
    !getStarters('t1', wk).includes(String(fa.espnId)));
  lg.viewWeek = null;

  // ---- no double-count: the week total is the holdover, not holdover + replacement ----
  C(T + 'this week still totals the same (no stacking two players in one slot)',
    teamWeekTotal('t1', wk) === totalBefore, teamWeekTotal('t1', wk) + ' vs ' + totalBefore);

  // ---- dropping an UNLOCKED player is still immediate/clean ----
  S.as(2);
  const wk2 = currentWeekNow();
  ensureLineupExists(wk2);
  const a2 = lg.lineups['t2'][wk2].assignments;
  const idx2 = Object.keys(a2).find(k => a2[k]);
  const p2 = teamRoster('t2').find(p => String(p.espnId) === String(a2[idx2]));
  // strip their logs + schedule so they read as "hasn't played yet"
  const savedLog = lg.gameLogs[p2.mlbId];
  lg.gameLogs[p2.mlbId] = [];
  lg.scheduleCache = {};
  C(T + 'setup: this player is NOT locked', !playerLockedForWeek(p2, wk2));
  confirmDrop(p2.espnId);
  C(T + 'unlocked drop takes effect immediately (no holdover)',
    !holdoversFor('t2', wk2).includes(String(p2.espnId)));
  C(T + 'unlocked drop clears them from this week\'s lineup',
    !getStarters('t2', wk2).includes(String(p2.espnId)));
  lg.gameLogs[p2.mlbId] = savedLog;

  // ---- a benched (non-starting) locked player needs no holdover ----
  S.as(3);
  const wk3 = currentWeekNow();
  ensureLineupExists(wk3);
  const starters3 = new Set(getStarters('t3', wk3));
  const benchP = teamRoster('t3').find(p => !starters3.has(String(p.espnId)));
  confirmDrop(benchP.espnId);
  C(T + 'benched player drop records no holdover (was not scoring)',
    !holdoversFor('t3', wk3).includes(String(benchP.espnId)));

  // ---- holdovers sync to the league doc so every member scores it the same ----
  const payload = leaguePayload();
  C(T + 'holdovers are included in the synced league payload', !!payload.holdovers,
    JSON.stringify(payload.holdovers || {}).slice(0, 80));
  const fresh = blankLeague('x');
  C(T + 'blankLeague seeds holdovers', !!fresh.holdovers);

  // ---- the old blanket "cannot drop a locked player" rule is gone ----
  C(T + 'playerDropLocked removed (drops are always allowed now)',
    typeof window.playerDropLocked === 'undefined' && typeof playerDropLocked === 'undefined');

  const bad = S.renderAll();
  C(T + 'all pages render', bad.length === 0, bad.join(' ; '));
})();
