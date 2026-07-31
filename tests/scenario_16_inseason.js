/* The in-season machinery a real platform has: trade review and vetoes, a trade
   block, a watch list, acquisition limits, a full-season schedule — plus the cap
   deriving itself from real payrolls once the draft is done. */
(() => {
  const S = window.__sim, C = window.__check;

  // ============================================================
  // the cap comes off real payrolls once teams have drafted
  // ============================================================
  const K = 'CapFromRosters: ';
  STATE.salaryConfig = {};
  STATE.salaryDB = {};
  let lg = S.setupLeague('flb', { teams: 8, week: 2, name: 'CapReal',
    settings: { leagueType: 'dynasty', useSalaryCap: true } });
  STATE.salaryDB = { flb: {} };
  LG().playerPool.forEach((p, i) => {
    STATE.salaryDB.flb[normName(p.name)] = { aav: Math.max(1000000, 30000000 - i * 120000) };
  });
  const beforeDraft = capBasis();
  C(K + 'before the draft it projects from the pool', beforeDraft.fromRosters === false);
  C(K + 'and samples teams × spots', beforeDraft.need === beforeDraft.teams * beforeDraft.spots,
    `${beforeDraft.need} vs ${beforeDraft.teams}×${beforeDraft.spots}`);
  S.runDraft();
  const afterDraft = capBasis();
  C(K + 'after the draft it uses the real rosters', afterDraft.fromRosters === true);
  const payrolls = LG().teams.map(t => teamSalaryTotal(t.id));
  const avg = payrolls.reduce((a, b) => a + b, 0) / payrolls.length;
  C(K + 'the basis IS the average team payroll',
    Math.abs(afterDraft.perTeam - avg) < 2, `${afterDraft.perTeam} vs ${avg}`);
  C(K + 'and the cap is that average times the multiplier',
    afterDraft.cap === Math.round(avg * afterDraft.headroom / 5000000) * 5000000,
    `${afterDraft.cap}`);
  C(K + 'real rosters cost less than the theoretical top N, so the cap drops',
    afterDraft.cap < beforeDraft.cap, `${beforeDraft.cap} -> ${afterDraft.cap}`);
  C(K + 'a hypothetical shape still projects, never using this league\'s rosters',
    capBasis({ teams: 12, spots: 20 }).fromRosters === false);

  // ============================================================
  // trade review + vetoes
  // ============================================================
  const R = 'TradeReview: ';
  lg = S.setupLeague('flb', { teams: 6, week: 2, name: 'ReviewLeague',
    settings: { leagueType: 'dynasty' } });
  S.runDraft();
  const a = LG().teams[0].id, b = LG().teams[1].id;
  const propose = () => {
    S.as(1);
    window._trade = { to: b, fromPlayers: [String(teamRoster(a)[0].espnId)],
                      toPlayers: [String(teamRoster(b)[0].espnId)], fromPicks: [], toPicks: [], money: [] };
    sendTradeProposal();
    return LG().trades[LG().trades.length - 1];
  };
  // default: no review window, so nothing changes for an existing league
  C(R + 'review is off by default', (Number(LSET().tradeReviewDays) || 0) === 0);
  let t = propose();
  S.as(2); acceptTrade(t.id);
  C(R + 'with review off a trade processes immediately', t.status === 'accepted', t.status);

  LG().settings.tradeReviewDays = 2;
  C(R + 'it takes a majority of the OTHER teams to stop a trade',
    vetoesNeeded() === Math.floor((LG().teams.length - 2) / 2) + 1, vetoesNeeded());
  t = propose();
  S.as(2); acceptTrade(t.id);
  C(R + 'accepting now parks the trade under review', t.status === 'review', t.status);
  C(R + 'the players have NOT moved yet',
    teamRoster(a).some(p => String(p.espnId) === t.fromPlayers[0]));
  C(R + 'it is listed as under review', tradesInReview().length === 1);
  S.as(2);
  vetoTrade(t.id);
  C(R + 'a team in the trade cannot object to it', Object.keys(t.vetoes).length === 0);
  S.as(3); vetoTrade(t.id);
  S.as(4); vetoTrade(t.id);
  C(R + 'uninvolved teams can object', Object.keys(t.vetoes).length === 2);
  S.as(3); vetoTrade(t.id);
  C(R + 'and can withdraw an objection', Object.keys(t.vetoes).length === 1);
  C(R + 'the review does not settle before its time is up',
    (settleTradeReviews(), t.status === 'review'));
  // not enough objections when the clock runs out -> it goes through
  t.acceptedAt = Date.now() - 1000 * 60 * 60 * 24 * 3;
  settleTradeReviews();
  C(R + 'too few objections and the trade processes', t.status === 'accepted', t.status);

  // enough objections and it dies
  t = propose();
  S.as(2); acceptTrade(t.id);
  [3, 4, 5, 6].forEach(n => { S.as(n); vetoTrade(t.id); });
  C(R + 'the league can gather enough objections',
    Object.keys(t.vetoes).length >= vetoesNeeded(), Object.keys(t.vetoes).length);
  t.acceptedAt = Date.now() - 1000 * 60 * 60 * 24 * 3;
  settleTradeReviews();
  C(R + 'a vetoed trade never moves anyone', t.status === 'vetoed', t.status);
  C(R + 'and the players stayed put',
    teamRoster(a).some(p => String(p.espnId) === t.fromPlayers[0]));

  // commissioner overrides
  t = propose();
  S.as(2); acceptTrade(t.id);
  S.as(3);
  forceTradeNow(t.id);
  C(R + 'a manager cannot force a trade through', t.status === 'review');
  window._masterUnlocked = true;
  forceTradeNow(t.id);
  C(R + 'the commissioner can approve early', t.status === 'accepted', t.status);
  t = propose();
  S.as(2); acceptTrade(t.id);
  killTradeNow(t.id);
  C(R + 'and can veto outright', t.status === 'vetoed', t.status);
  window._masterUnlocked = false;
  LG().settings.tradeReviewDays = 0;
  S.as(1);

  // ============================================================
  // acquisition limits
  // ============================================================
  const A = 'AddLimits: ';
  lg = S.setupLeague('flb', { teams: 6, week: 2, name: 'LimitLeague' });
  S.runDraft();
  const me = myTeamId();
  C(A + 'no limit by default', addBlockedReason(me) === null);
  LG().settings.maxAddsPerWeek = 2;
  C(A + 'still fine before you have used any', addBlockedReason(me) === null);
  logTxn('add', `${teamName(me)} added Someone`);
  logTxn('add', `${teamName(me)} added Someone Else`);
  C(A + 'the weekly limit bites', /all 2 adds for week/.test(addBlockedReason(me) || ''),
    addBlockedReason(me));
  C(A + 'another team is unaffected', addBlockedReason(LG().teams[1].id) === null);
  LG().settings.maxAddsPerWeek = 0;
  LG().settings.maxAddsPerSeason = 2;
  C(A + 'a season limit works the same way', /all 2 adds for the season/.test(addBlockedReason(me) || ''),
    addBlockedReason(me));
  LG().settings.maxAddsPerSeason = 5;
  C(A + 'raising the limit unblocks immediately', addBlockedReason(me) === null);
  C(A + 'drops are never blocked — you can always get legal',
    typeof window.dropPlayer === 'function');
  LG().settings.maxAddsPerSeason = 0;

  // ============================================================
  // trade block + watch list
  // ============================================================
  const B = 'Block: ';
  const mineP = teamRoster(me)[0];
  C(B + 'nothing on the block to start', onBlock(me).length === 0);
  toggleTradeBlock(mineP.espnId);
  C(B + 'a player can be listed', onBlock(me).includes(String(mineP.espnId)));
  toggleTradeBlock(mineP.espnId);
  C(B + 'and taken off again', onBlock(me).length === 0);
  toggleTradeBlock(mineP.espnId);
  C(B + 'the block is per team', onBlock(LG().teams[1].id).length === 0);
  openTradeBlock();
  const blockHtml = document.getElementById('modal-body')?.innerHTML || '';
  C(B + 'the block lists the player', blockHtml.includes(mineP.name));
  C(B + 'and marks your own team rather than offering you a trade with yourself',
    /you<\/span>/.test(blockHtml));
  closeModal();

  const W = 'Watch: ';
  const fa = LG().playerPool.find(p => !LG().draft.picks.some(pk => String(pk.playerId) === String(p.espnId)));
  C(W + 'watch list starts empty', watchList().length === 0);
  toggleWatch(fa.espnId);
  C(W + 'a player can be watched', watchList().includes(String(fa.espnId)));
  S.as(2);
  C(W + 'the watch list is personal, not shared', watchList().length === 0);
  S.as(1);
  C(W + 'and comes back for its owner', watchList().length === 1);
  openWatchList();
  C(W + 'it renders the watched player',
    (document.getElementById('modal-body')?.innerHTML || '').includes(fa.name));
  closeModal();
  toggleWatch(fa.espnId);
  C(W + 'unwatching removes them', watchList().length === 0);

  // ============================================================
  // full-season schedule
  // ============================================================
  const Q = 'Schedule: ';
  openSeasonSchedule(me);
  const sHtml = document.getElementById('modal-body')?.innerHTML || '';
  C(Q + 'it names the team', sHtml.includes(teamName(me)));
  C(Q + 'and lists more than the current week',
    (sHtml.match(/<tr/g) || []).length > 3, (sHtml.match(/<tr/g) || []).length);
  C(Q + 'you never play yourself',
    !new RegExp(`<td style="font-size:.76rem">${teamName(me)}</td>`).test(sHtml));
  C(Q + 'it can be pointed at another team',
    (openSeasonSchedule(LG().teams[2].id),
     (document.getElementById('modal-body')?.innerHTML || '').includes(LG().teams[2].name)));
  closeModal();

  // ============================================================
  // playoff cut line
  // ============================================================
  const P = 'PlayoffLine: ';
  LG().settings.playoffTeams = 4;
  renderPage('standings');
  const stand = document.getElementById('page-standings').innerHTML;
  C(P + 'the standings mark who is in', (stand.match(/✦/g) || []).length >= 4,
    (stand.match(/✦/g) || []).length);
  C(P + 'and say what the mark means', /in the playoffs as it stands/.test(stand));
  C(P + 'with a way to the full schedule', /openSeasonSchedule\(\)/.test(stand));

  // ============================================================
  // changing format after the draft (a testing affordance, not a normal move)
  // ============================================================
  const F = 'FormatSwitch: ';
  STATE.salaryDB = { flb: {} };
  lg = S.setupLeague('flb', { teams: 6, week: 2, name: 'FlipLeague',
    settings: { leagueType: 'dynasty', useSalaryCap: true, salaryCapDollars: 300000000 } });
  LG().playerPool.forEach((p, i) => {
    STATE.salaryDB.flb[normName(p.name)] = { aav: Math.max(1000000, 25000000 - i * 100000) };
  });
  S.runDraft();
  const ftid = LG().teams[0].id;
  LG().contracts = {};
  teamRoster(ftid).slice(0, 4).forEach(p => {
    LG().contracts[String(p.espnId)] = { baseAAV: importedAAV(p), signedYear: currentSeasonYear(),
                                         termYears: 3, teamId: ftid };
  });
  LG().draftPicks = { [currentSeasonYear() + 1]: { 1: { t2: 't1' } } };
  const capWas = leagueCap();

  window._masterUnlocked = false; window._commishUnlocked = null;
  setLeagueType('redraft');
  C(F + 'a manager cannot change format after the draft', LSET().leagueType === 'dynasty');

  window._masterUnlocked = true;
  setLeagueType('redraft');
  C(F + 'the commissioner gets a confirmation, not a refusal',
    /Change format mid-season/.test(document.getElementById('modal-body')?.innerHTML || ''));
  C(F + 'nothing has changed until it is confirmed', LSET().leagueType === 'dynasty');
  const warn = document.getElementById('modal-body')?.innerHTML || '';
  C(F + 'it warns about traded picks going quiet', /Traded draft picks/.test(warn));
  C(F + 'and about the multiplier moving', /multiplier changes/.test(warn));
  C(F + 'while saying the league cap itself is untouched', /is not touched/.test(warn));
  confirmLeagueType('redraft');
  C(F + 'confirming switches the format', LSET().leagueType === 'redraft');

  // the whole point: nothing is destroyed on the way through
  C(F + 'contracts survive the switch', Object.keys(LG().contracts).length === 4);
  C(F + 'traded picks survive', !!LG().draftPicks[currentSeasonYear() + 1]);
  C(F + 'salaries stay on', LSET().useSalaryCap === true);
  C(F + "the league's own cap is not rewritten", leagueCap() === capWas, leagueCap());
  C(F + 'but the SUGGESTED cap follows the new type',
    capBasis().headroom === capHeadroom('redraft'), capBasis().headroom);
  C(F + 'dynasty-only features go quiet', isDynasty() === false);
  let badF = S.renderAll();
  C(F + 'every page still renders as a redraft league', badF.length === 0, badF.join(' ; '));

  setLeagueType('keeper'); confirmLeagueType('keeper');
  C(F + 'and on to keeper', LSET().leagueType === 'keeper');
  badF = S.renderAll();
  C(F + 'which also renders', badF.length === 0, badF.join(' ; '));

  setLeagueType('dynasty'); confirmLeagueType('dynasty');
  C(F + 'switching back restores dynasty', isDynasty() === true);
  C(F + 'with the contracts still there', Object.keys(LG().contracts).length === 4);
  C(F + 'and the traded picks still there', !!LG().draftPicks[currentSeasonYear() + 1]);
  C(F + 'every switch is written to the activity log',
    (LG().transactions || []).filter(t => /League type changed/.test(t.text)).length === 3);
  C(F + 'setting the type it already is does nothing',
    (setLeagueType('dynasty'), LSET().leagueType === 'dynasty'));
  window._masterUnlocked = false;

  STATE.salaryDB = {};
  STATE.salaryConfig = {};
  const bad = S.renderAll();
  C('InSeason: all pages render', bad.length === 0, bad.join(' ; '));
})();
