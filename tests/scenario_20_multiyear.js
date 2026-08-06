/* YEAR AFTER YEAR. A league is not a season, it is a succession of them — and
   every piece of bookkeeping has to survive the turn: stats must re-point, caps
   must grow, contracts must age, penalties must land in the right draft, counters
   must reset, and none of it may leak from one season into the next. Run for BOTH
   sports and all three league types. */
(() => {
  const S = window.__sim, C = window.__check;
  const grab = () => document.getElementById('modal-body')?.innerHTML || '';

  ['flb', 'fba'].forEach(sport => {

    // ============================================================
    // DYNASTY — three consecutive seasons
    // ============================================================
    const D = `Years[${sport}-dynasty]: `;
    S.setupLeague(sport, { teams: 4, week: 20, name: 'Dyn' + sport,
      settings: { leagueType: 'dynasty', useSalaryCap: true } });
    STATE.salaryDB = { [sport]: {} };
    LG().playerPool.forEach((p, i) => {
      STATE.salaryDB[sport][normName(p.name)] = { aav: Math.max(1000000, 30000000 - i * 90000) };
    });
    S.runDraft();
    S.genLogs(26);
    LG().playerPool.forEach(p => { if (p.mlbId && LG().gameLogs[p.mlbId]) applyPointFields(p, LG().gameLogs[p.mlbId]); });
    const y0 = currentSeasonYear();
    C(D + 'the league clock and the stat clock agree from day one',
      statSeasonNow() === y0, `${statSeasonNow()} vs ${y0}`);

    // contracts of every length, all signed in year 0
    const dTeam = 't1';
    const r0 = teamRoster(dTeam);
    LG().contracts = {};
    [[0, 3], [1, 2], [2, 1]].forEach(([i, term]) => {
      LG().contracts[String(r0[i].espnId)] = { baseAAV: importedAAV(r0[i]),
        signedYear: y0, termYears: term, teamId: dTeam };
    });
    const hit3 = playerCapHit(r0[0]);   // year-1 contract price under TODAY's salary DB

    // the frozen-contract rule: a new salary import never touches a signed deal
    STATE.salaryDB[sport][normName(r0[0].name)] = { aav: importedAAV(r0[0]) * 4 };
    C(D + 'a salary update does not touch a player under contract',
      playerCapHit(r0[0]) === hit3, `${playerCapHit(r0[0])} vs ${hit3}`);
    C(D + 'but an unsigned player follows the import immediately',
      playerCapHit(r0[5]) === importedAAV(r0[5]));

    // over-cap on purpose: cap below everyone's payroll
    const payrolls = LG().teams.map(t => teamSalaryTotal(t.id, y0));
    LG().settings.salaryCapDollars = Math.round(Math.min(...payrolls) * 0.9);
    const penBefore = {};
    LG().teams.forEach(t => { penBefore[t.id] = teamCapPenalty(t.id, y0); });
    C(D + 'the fixture puts teams over the cap', Object.values(penBefore).some(p => p.picks > 0));

    // a pending trade and a live waiver, to prove they die with the season
    LG().trades = [{ id: 'zz1', status: 'pending', from: 't1', to: 't2',
                     fromPlayers: [], toPlayers: [], created: Date.now() }];
    LG().waivers = { 999123: { until: Date.now() + 86400000, claims: [] } };
    // a completed rookie draft, to prove the board resets
    ensureRD();
    LG().rookieDraft.enabled = true; LG().rookieDraft.rounds = 2;
    LG().rookieDraft.complete = true; LG().rookieDraft.picks = [{ pick: 1, teamId: 't1', playerId: r0[0].espnId }];
    // season-limit adds used this year (timestamps pushed back so the season
    // boundary, not the same test millisecond, is what separates them)
    LG().settings.maxAddsPerSeason = 5;
    logTxn('add', `${teamName(dTeam)} added Somebody`);
    logTxn('add', `${teamName(dTeam)} added Somebody Else`);
    LG().transactions.forEach(t => { t.ts -= 120000; });
    C(D + 'adds are counted before the turn', addsUsed(dTeam, 'season') === 2, addsUsed(dTeam, 'season'));

    const capY0 = leagueCap();
    const growth = (SALCFG().capGrowthPct || 0) / 100;
    const logsY0 = Object.keys(LG().gameLogs).length;
    const p0 = LG().playerPool.find(p => p.ptsSeason > 0);
    const p0Season = p0.ptsSeason, p0Best = p0.bestAvg;
    const rosterY0 = teamRoster(dTeam).length;

    // ---- the full state must come back on undo before we commit to the year ----
    window._masterUnlocked = true;
    confirmSeasonRollover(); closeModal();
    C(D + 'rollover advances the year', currentSeasonYear() === y0 + 1);
    undoSeasonRollover();
    C(D + 'undo: the year comes back', currentSeasonYear() === y0);
    C(D + 'undo: the cap comes back', leagueCap() === capY0);
    C(D + 'undo: contracts come back', Object.keys(LG().contracts).length === 3);
    C(D + 'undo: the roster comes back', teamRoster(dTeam).length === rosterY0);
    C(D + 'undo: forfeited picks come back', Object.keys(LG().removedPicks || {}).length === 0,
      JSON.stringify(LG().removedPicks));
    C(D + 'undo: the game logs come back', Object.keys(LG().gameLogs).length === logsY0);
    C(D + 'undo: computed points come back', p0.ptsSeason === p0Season, `${p0.ptsSeason} vs ${p0Season}`);
    C(D + 'undo: the pending trade is pending again', LG().trades[0].status === 'pending');
    C(D + 'undo: the rookie board is back', LG().rookieDraft.complete === true);

    // ---- now the real turn ----
    confirmSeasonRollover(); closeModal();
    const y1 = currentSeasonYear();
    C(D + 'year 1: the league is a year on', y1 === y0 + 1);
    C(D + 'year 1: stats point at the new season', statSeasonNow() === y1);
    C(D + 'year 1: last season is the season just played', priorStatSeason() === y0
      && LG().gameLogsPrevYear === y0, `${priorStatSeason()} / ${LG().gameLogsPrevYear}`);
    C(D + 'year 1: the cap grew by the configured rate',
      leagueCap() === Math.round(capY0 * (1 + growth)), `${leagueCap()} vs ${capY0}`);
    C(D + 'year 1: the 1-year contract expired', !LG().contracts[String(r0[2].espnId)]);
    C(D + 'year 1: its player left the roster',
      !teamRoster(dTeam).some(x => String(x.espnId) === String(r0[2].espnId)));
    C(D + 'year 1: the 2- and 3-year deals survive',
      !!LG().contracts[String(r0[0].espnId)] && !!LG().contracts[String(r0[1].espnId)]);
    C(D + 'year 1: a surviving contract still ignores the new salary import',
      playerCapHit(r0[0]) === contractSalaryForYear(LG().contracts[String(r0[0].espnId)], y1));
    C(D + 'year 1: the whole overage landed as dead cap for the new season', (() => {
      return LG().teams.every(t => {
        const pen = penBefore[t.id];
        if (!pen || pen.picks <= 0) return true;
        const dead = ((LG().deadCap || {})[t.id] || []).filter(d => d.year === y1 && /over-cap/.test(d.name || ''));
        return dead.reduce((s, d) => s + d.amount, 0) === pen.over;
      });
    })(), JSON.stringify(LG().deadCap));
    C(D + 'year 1: this season\'s logs are gone from the current slot',
      Object.keys(LG().gameLogs).length === 0);
    C(D + 'year 1: and filed as last season, numbers intact',
      p0.prevPts === p0Season && p0.prevSeason === y0, `${p0.prevPts} vs ${p0Season}`);
    C(D + 'year 1: the best-of-week average survives the filing',
      p0.prevBestAvg > 0 && Math.abs(p0.prevBestAvg - p0Best) < 3, `${p0.prevBestAvg} vs ${p0Best}`);
    C(D + 'year 1: current-season points read as not-yet-played',
      p0.ptsSeason == null && p0.gamesPlayed === 0);
    C(D + 'year 1: the pending trade expired with the season', LG().trades[0].status === 'expired');
    C(D + 'year 1: waivers cleared', Object.keys(LG().waivers).length === 0);
    C(D + 'year 1: the rookie board reset for the new year',
      LG().rookieDraft.complete === false && LG().rookieDraft.picks.length === 0
      && LG().rookieDraft.enabled === true);
    C(D + 'year 1: the season add counter starts at zero', addsUsed(dTeam, 'season') === 0,
      addsUsed(dTeam, 'season'));
    C(D + 'year 1: the league waits for the new schedule',
      preseason() === true && currentWeekNow() === 1);
    C(D + 'year 1: final standings were written down',
      (LG().transactions || []).some(t => new RegExp(`Final ${y0} standings`).test(t.text)));
    C(D + 'year 1: rosters are otherwise untouched — it is a dynasty',
      teamRoster(dTeam).length === rosterY0 - 1);

    // ---- play year 1 and turn again ----
    S.setWeek(20); S.genLogs(26);
    LG().playerPool.forEach(p => { if (p.mlbId && LG().gameLogs[p.mlbId]) applyPointFields(p, LG().gameLogs[p.mlbId]); });
    C(D + 'year 1 plays: points compute again after the reset', p0.ptsSeason > 0);
    const capY1 = leagueCap();
    confirmSeasonRollover(); closeModal();
    const y2 = currentSeasonYear();
    C(D + 'year 2: the year turns again', y2 === y0 + 2);
    C(D + 'year 2: the cap compounds', leagueCap() === Math.round(capY1 * (1 + growth)));
    C(D + 'year 2: the 2-year deal has now expired', !LG().contracts[String(r0[1].espnId)]);
    C(D + 'year 2: the 3-year deal is in its final season', !!LG().contracts[String(r0[0].espnId)]);
    C(D + 'year 2: last year\'s dead cap cleared with its season', (() => {
      const all = Object.values(LG().deadCap || {}).flat();
      return all.every(d => d.year > y1);
    })(), JSON.stringify(LG().deadCap));
    C(D + 'year 2: last season is now year 1, not year 0',
      priorStatSeason() === y1 && LG().gameLogsPrevYear === y1);

    // ---- and a third time ----
    S.setWeek(20); S.genLogs(26);
    LG().playerPool.forEach(p => { if (p.mlbId && LG().gameLogs[p.mlbId]) applyPointFields(p, LG().gameLogs[p.mlbId]); });
    confirmSeasonRollover(); closeModal();
    C(D + 'year 3: the 3-year deal has run its course', !LG().contracts[String(r0[0].espnId)]);
    C(D + 'year 3: three turns in, the clocks still agree',
      currentSeasonYear() === y0 + 3 && statSeasonNow() === y0 + 3 && priorStatSeason() === y0 + 2);
    C(D + 'year 3: no contracts left behind', Object.keys(LG().contracts).length === 0);
    let bad = S.renderAll();
    C(D + 'every page renders three seasons in', bad.length === 0, bad.join(' ; '));

    // ============================================================
    // REDRAFT — the year ends with an empty board, and penalties
    // still bite in next year's draft
    // ============================================================
    const R = `Years[${sport}-redraft]: `;
    S.setupLeague(sport, { teams: 4, week: 20, name: 'Red' + sport,
      settings: { leagueType: 'redraft', useSalaryCap: true } });
    STATE.salaryDB = { [sport]: {} };
    LG().playerPool.forEach((p, i) => {
      STATE.salaryDB[sport][normName(p.name)] = { aav: Math.max(1000000, 30000000 - i * 90000) };
    });
    S.runDraft();
    S.genLogs(26);
    const ry0 = currentSeasonYear();
    C(R + 'the draft fixed the cap', !!LSET().capSetFrom && leagueCap() > 0);
    const rPayrolls = LG().teams.map(t => teamSalaryTotal(t.id, ry0));
    LG().settings.salaryCapDollars = Math.round(Math.min(...rPayrolls) * 0.9);
    const rPen = {};
    LG().teams.forEach(t => { rPen[t.id] = teamCapPenalty(t.id, ry0); });
    C(R + 'the fixture has over-cap teams', Object.values(rPen).some(p => p.picks > 0));

    confirmSeasonRollover(); closeModal();
    const ry1 = currentSeasonYear();
    C(R + 'the year turns', ry1 === ry0 + 1);
    C(R + 'every roster is cleared for the new draft',
      LG().teams.every(t => teamRoster(t.id).length === 0),
      LG().teams.map(t => teamRoster(t.id).length).join(','));
    C(R + 'the draft is reset, not complete',
      !LG().draft.complete && !LG().draft.started && LG().draft.picks.length === 0);
    C(R + 'contracts ended with the season', Object.keys(LG().contracts).length === 0);
    C(R + 'ending them cost no dead cap — only the over-cap money is charged', (() => {
      const all = Object.values(LG().deadCap || {}).flat();
      return all.every(d => /over-cap/.test(d.name || ''));
    })(), JSON.stringify(LG().deadCap));
    C(R + 'the cap is unfixed so the new draft can re-derive it', !LSET().capSetFrom);
    C(R + 'the forfeited picks are on the book for the new draft', (() => {
      return LG().teams.every(t => {
        const pen = rPen[t.id];
        if (!pen || pen.picks <= 0) return true;
        return pickRemoved(ry1, 1, t.id);
      });
    })(), JSON.stringify(LG().removedPicks));

    // the new season's draft: the penalty seats stay empty
    LG().draft.order = LG().teams.map(t => t.id);
    startLiveDraft();
    let guard = 0;
    while (LG().draft.live && !LG().draft.complete && guard++ < 3000) autoPickForCurrent();
    C(R + 'the year-2 draft completes', LG().draft.complete);
    C(R + 'an over-cap team drafts short — the forfeit is real', (() => {
      return LG().teams.every(t => {
        const pen = rPen[t.id];
        const short = (pen && pen.picks > 0) ? pen.picks : 0;
        return teamRoster(t.id).length === draftRounds() - short;
      });
    })(), LG().teams.map(t => `${t.id}:${teamRoster(t.id).length}/${draftRounds()}`).join(' '));
    C(R + 'the empty seats are marked as forfeits, and every removed pick has one', (() => {
      const owed = Object.values((LG().removedPicks || {})[ry1] || {})
        .reduce((s, byRound) => s + Object.keys(byRound).length, 0);
      return LG().draft.picks.filter(pk => pk.forfeited).length === owed && owed > 0;
    })(), LG().draft.picks.filter(pk => pk.forfeited).length);
    C(R + 'and the new draft re-fixed the cap', !!LSET().capSetFrom);
    bad = S.renderAll();
    C(R + 'every page renders in season two', bad.length === 0, bad.join(' ; '));

    // ============================================================
    // KEEPER — ending the season routes through keeper selection,
    // and finishing it IS the season end
    // ============================================================
    const K = `Years[${sport}-keeper]: `;
    S.setupLeague(sport, { teams: 4, week: 20, name: 'Keep' + sport,
      settings: { leagueType: 'keeper', keeperCount: 2, useSalaryCap: true } });
    STATE.salaryDB = { [sport]: {} };
    LG().playerPool.forEach((p, i) => {
      STATE.salaryDB[sport][normName(p.name)] = { aav: Math.max(1000000, 30000000 - i * 90000) };
    });
    S.runDraft();
    S.genLogs(26);
    const ky0 = currentSeasonYear();
    const kTeam = 't1';
    const kr = teamRoster(kTeam);
    // three 3-year deals: the first two will be kept, the third will walk
    LG().contracts = {
      [String(kr[0].espnId)]: { baseAAV: importedAAV(kr[0]), signedYear: ky0, termYears: 3, teamId: kTeam },
      [String(kr[1].espnId)]: { baseAAV: importedAAV(kr[1]), signedYear: ky0, termYears: 3, teamId: kTeam },
      [String(kr[2].espnId)]: { baseAAV: importedAAV(kr[2]), signedYear: ky0, termYears: 3, teamId: kTeam },
    };
    const kCap0 = leagueCap();
    confirmSeasonRollover();
    C(K + 'ending a keeper season opens keeper selection first', !!window._keep);
    // every team keeps its first two picks
    for (let ti = 0; ti < LG().teams.length; ti++) {
      const team = LG().teams[window._keep.ti];
      const roster = teamRoster(team.id);
      toggleKeeperSel(team.id, roster[0].espnId);
      toggleKeeperSel(team.id, roster[1].espnId);
      keeperNextTeam();
    }
    const ky1 = currentSeasonYear();
    C(K + 'finishing the keeper flow advances the year', ky1 === ky0 + 1, ky1);
    C(K + 'and grows the cap — a keeper year is a real season end',
      leagueCap() === Math.round(kCap0 * (1 + growth)), `${leagueCap()} vs ${kCap0}`);
    C(K + 'the kept players keep their contracts',
      !!LG().contracts[String(kr[0].espnId)] && !!LG().contracts[String(kr[1].espnId)]);
    C(K + 'an unkept player\'s contract walks with him',
      !LG().contracts[String(kr[2].espnId)], JSON.stringify(Object.keys(LG().contracts)));
    C(K + 'so a team that re-drafts him does not inherit the old team\'s deal',
      playerContract(kr[2]) === null);
    C(K + 'no dead cap from letting players walk',
      Object.values(LG().deadCap || {}).flat().every(d => /over-cap/.test(d.name || '')),
      JSON.stringify(LG().deadCap));
    C(K + 'the draft reset for the new season', !LG().draft.complete && LG().draft.picks.length === 0);
    C(K + 'keepers are recorded for every team', Object.keys(LG().keepers || {}).length === 4);
    C(K + 'last season\'s stats filed', LG().gameLogsPrevYear === ky0
      && Object.keys(LG().gameLogs).length === 0);

    // the new draft honours the keepers
    LG().draft.order = LG().teams.map(t => t.id);
    startLiveDraft();
    guard = 0;
    while (LG().draft.live && !LG().draft.complete && guard++ < 3000) { checkKeeperSkips(); autoPickForCurrent(); }
    C(K + 'the year-2 draft completes with keepers', LG().draft.complete);
    C(K + 'every keeper landed back on his team', LG().teams.every(t =>
      (LG().keepers[t.id] || []).every(k =>
        teamRoster(t.id).some(p => String(p.espnId) === String(k.espnId)))));
    C(K + 'the kept contract survived the whole turn',
      !!LG().contracts[String(kr[0].espnId)]
      && playerCapHit(kr[0]) === contractSalaryForYear(LG().contracts[String(kr[0].espnId)], ky1));
    bad = S.renderAll();
    C(K + 'every page renders in keeper season two', bad.length === 0, bad.join(' ; '));

    // ============================================================
    // the plain advance-a-year still turns the stats page
    // ============================================================
    const A = `Years[${sport}-advance]: `;
    S.setupLeague(sport, { teams: 4, week: 20, name: 'Adv' + sport,
      settings: { leagueType: 'dynasty' } });
    S.runDraft(); S.genLogs(26);
    LG().playerPool.forEach(p => { if (p.mlbId && LG().gameLogs[p.mlbId]) applyPointFields(p, LG().gameLogs[p.mlbId]); });
    const aP = LG().playerPool.find(p => p.ptsSeason > 0);
    const aPts = aP.ptsSeason;
    const ay0 = currentSeasonYear();
    const aRoster = teamRoster('t1').length;
    window._masterUnlocked = true;
    confirmAdvanceYear();
    C(A + 'the year moves', currentSeasonYear() === ay0 + 1);
    C(A + 'rosters really are untouched', teamRoster('t1').length === aRoster);
    C(A + 'but the finished season\'s stats are filed, not carried',
      Object.keys(LG().gameLogs).length === 0 && aP.prevPts === aPts && aP.ptsSeason == null,
      `${aP.prevPts} vs ${aPts}`);
    C(A + 'and the stat clock follows', statSeasonNow() === ay0 + 1);

    // a league without salaries can still END its season properly
    openSeasonRollover();
    const noCap = grab();
    C(A + 'a no-cap league is offered the season end', /End the .* season/.test(noCap));
    C(A + 'with no cap talk in it', !/Pick penalties/.test(noCap) && !/Cap change/.test(noCap));
    C(A + 'but the season-turn effects spelled out', /filed\s+as last season/.test(noCap.replace(/\s+/g,' ')));
    closeModal();

    STATE.salaryDB = {};
    window._masterUnlocked = false;
  });
})();
