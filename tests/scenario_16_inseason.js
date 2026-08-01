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
  C(K + 'after the draft it uses the real draft', afterDraft.fromRosters === true);
  // the formula, stated plainly: every drafted salary added up, over the team count
  const total = draftedSalaryTotal();
  C(K + 'the total is every drafted player, counted once',
    total > 0 && afterDraft.draftedTotal === total, total);
  C(K + 'divided by the number of teams',
    afterDraft.perTeam === Math.round(total / LG().teams.length),
    `${afterDraft.perTeam} vs ${total / LG().teams.length}`);
  C(K + 'times the multiplier is the cap',
    afterDraft.cap === Math.round((total / LG().teams.length) * afterDraft.headroom),
    `${afterDraft.cap}`);
  C(K + 'and the multiplier is 1, so the cap is the average payroll',
    afterDraft.headroom === 1 && afterDraft.cap === afterDraft.perTeam,
    `${afterDraft.cap} vs ${afterDraft.perTeam}`);
  C(K + 'real rosters cost less than the theoretical top N, so the cap drops',
    afterDraft.cap < beforeDraft.cap, `${beforeDraft.cap} -> ${afterDraft.cap}`);
  C(K + 'a hypothetical shape still projects, never using this league\'s draft',
    capBasis({ teams: 12, spots: 20 }).fromRosters === false);
  // AT x1 THE CAP MUST ACTUALLY BIND — that is the whole reason for the number
  const over = LG().teams.filter(t => teamSalaryTotal(t.id) > afterDraft.cap).length;
  C(K + 'about half the league lands over a cap set at the average',
    over >= 1 && over < LG().teams.length, `${over}/${LG().teams.length} over`);

  // ============================================================
  // THE CAP IS FIXED AT THE DRAFT, not a live figure
  // ============================================================
  const X = 'CapFixed: ';
  STATE.salaryDB = { flb: {} };
  lg = S.setupLeague('flb', { teams: 8, week: 2, name: 'FixedCap',
    settings: { leagueType: 'dynasty', useSalaryCap: true } });
  LG().playerPool.forEach((p, i) => {
    STATE.salaryDB.flb[normName(p.name)] = { aav: Math.max(1000000, 30000000 - i * 120000) };
  });
  C(X + 'no cap is fixed before the draft', !LSET().capSetFrom);
  S.runDraft();
  C(X + 'finishing the draft fixes a cap', !!LSET().capSetFrom);
  const fixed = leagueCap();
  C(X + 'and it equals the formula',
    fixed === Math.round(draftedSalaryTotal() / LG().teams.length * capHeadroom()), fixed);
  C(X + 'the league records how it got there',
    LSET().capSetFrom.teams === 8 && LSET().capSetFrom.total === draftedSalaryTotal());

  // now move the rosters around and prove the cap does NOT follow
  const t1 = LG().teams[0].id, t2 = LG().teams[1].id;
  const moved = teamRoster(t1).slice(0, 5);
  moved.forEach(p => {
    const pk = LG().draft.picks.find(x => String(x.playerId) === String(p.espnId));
    if (pk) pk.teamId = t2;
  });
  C(X + 'a lopsided trade does not move the cap', leagueCap() === fixed, leagueCap());
  // drop players outright — the pool of drafted salary shrinks
  LG().draft.picks = LG().draft.picks.slice(0, Math.floor(LG().draft.picks.length / 2));
  C(X + 'dropping half the league does not move the cap', leagueCap() === fixed, leagueCap());
  C(X + 'even though the formula would now say something else',
    capFromDraft().cap !== fixed, `${capFromDraft().cap} vs ${fixed}`);
  C(X + 'and a second draft completion will not silently re-fix it',
    (setCapFromDraft(), leagueCap() === fixed), leagueCap());

  // only a commissioner moves it
  window._masterUnlocked = false; window._commishUnlocked = null;
  recomputeCapFromDraft();
  C(X + 'a manager cannot re-set the cap', leagueCap() === fixed);
  window._masterUnlocked = true;
  recomputeCapFromDraft();
  C(X + 'the commissioner can, deliberately', leagueCap() === capFromDraft().cap,
    `${leagueCap()} vs ${capFromDraft().cap}`);
  C(X + 'and that is written down', /Salary cap set to/.test(
    (LG().transactions || []).map(t => t.text).join(' ')));
  LG().settings.salaryCapDollars = 999000000;
  C(X + 'a hand-set cap is simply the cap', leagueCap() === 999000000);
  C(X + 'and nothing recomputes it behind your back',
    (setCapFromDraft(), leagueCap() === 999000000));
  window._masterUnlocked = false;

  // a league without salaries never gets a cap fixed
  lg = S.setupLeague('flb', { teams: 6, week: 2, name: 'NoSalaries', settings: { useSalaryCap: false } });
  S.runDraft();
  C(X + 'a league with salaries off is left alone', !LSET().capSetFrom);
  STATE.salaryDB = {};

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
  // a limit on adds must never trap you — prove it by actually dropping while capped
  LG().settings.maxAddsPerSeason = 1;
  C(A + 'and the limit is biting again', addBlockedReason(me) !== null);
  const beforeDrop = teamRoster(me).length;
  confirmDrop(teamRoster(me)[beforeDrop - 1].espnId);
  C(A + 'drops are never blocked — you can always get legal',
    teamRoster(me).length === beforeDrop - 1, `${beforeDrop} -> ${teamRoster(me).length}`);
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
  // the button used to read "Block" / "Listed" — neither said what tapping does,
  // and "Listed" gave no hint that tapping again takes them off
  showPlayer(mineP.espnId);
  let cardHtml = document.getElementById('modal-body')?.innerHTML || '';
  C(B + 'a listed player is offered the way off', /Off block/.test(cardHtml));
  toggleTradeBlock(mineP.espnId);
  C(B + 'and tapping it really takes them off', onBlock(me).length === 0);
  showPlayer(mineP.espnId);
  cardHtml = document.getElementById('modal-body')?.innerHTML || '';
  C(B + 'the button says trade block, not just block', /⇄ Trade block/.test(cardHtml));
  C(B + 'and never just "Block"', !/>⇄ Block</.test(cardHtml));
  toggleTradeBlock(mineP.espnId);
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
  C(F + 'and says salaries carry over untouched', /stay on and unchanged/.test(warn));
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
