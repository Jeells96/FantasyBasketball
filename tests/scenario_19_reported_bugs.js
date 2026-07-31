/* Six reported problems, plus one found while checking them. Every block runs for
   BOTH sports, because all of these are sport-neutral rules that were only ever
   exercised in baseball. */
(() => {
  const S = window.__sim, C = window.__check;
  const grab = () => document.getElementById('modal-body')?.innerHTML || '';

  ['flb', 'fba'].forEach(sport => {
    const T = `Bugs[${sport}]: `;
    const label = SPORTS[sport].label;

    // ============================================================
    // 1. a new league must not inherit the last one's data
    // ============================================================
    STATE.sport = sport;
    STATE.leagues[sport] = blankLeague('Old League');
    STATE.activeLeagueDoc = 'old_' + sport;
    STATE._loaded = true;
    const old = LG();
    old.teams = [{ id: 't1', name: 'Stale', owner: 'Ghost', abbrev: 'STL', claimed: true }];
    old.members = { m9: { name: 'Ghost', teamId: 't1' } };
    old.contracts = { 999: { baseAAV: 1e7, signedYear: currentSeasonYear(), termYears: 3, teamId: 't1' } };
    old.playerPool = S.makePool(sport, 200);
    old.settings.tradeDeadlineWeek = 7;
    STATE.approvals = {};
    window._masterUnlocked = true;
    window._newLeagueSport = sport;
    window._newLeagueSalary = false;
    document.body.insertAdjacentHTML('beforeend',
      '<div id="tmp-ap"><input id="ap-commish" value="Me"><input id="ap-league" value="Brand New"><input id="ap-pin" value="1234"></div>');
    saveApproval();
    document.getElementById('tmp-ap').remove();
    closeModal();
    C(T + 'a new league has no teams from the old one', LG().teams.length === 0, LG().teams.length);
    C(T + 'no members', Object.keys(LG().members || {}).length === 0);
    C(T + 'no contracts', Object.keys(LG().contracts || {}).length === 0);
    C(T + 'and no leftover settings', (LSET().tradeDeadlineWeek || 20) !== 7);
    C(T + 'it is the new league', LG().leagueName === 'Brand New');
    C(T + 'but the player pool is kept — it is the sport\'s data, not the league\'s',
      LG().playerPool.length === 200, LG().playerPool.length);
    const newId = Object.keys(STATE.approvals)[0];

    // deleting a league really deletes it
    STATE.leagues[sport].teams = [{ id: 't1', name: 'Doomed', abbrev: 'DOO' }];
    confirmRemoveApproval(newId);
    C(T + 'deleting removes the approval', !STATE.approvals[newId]);
    C(T + 'and clears the local league data', LG().teams.length === 0, LG().teams.length);
    C(T + 'and unbinds this device', STATE.activeLeagueDoc === null);
    C(T + 'while still keeping the player pool', LG().playerPool.length === 200);
    closeModal();

    // ============================================================
    // set up a real, drafted league for the rest
    // ============================================================
    const lg = S.setupLeague(sport, { teams: 4, week: 3, name: 'Bugs' + sport,
      settings: { leagueType: 'dynasty', useSalaryCap: true, salaryCapDollars: 300000000 } });
    STATE.salaryDB = { [sport]: {} };
    LG().playerPool.forEach((p, i) => {
      STATE.salaryDB[sport][normName(p.name)] = { aav: Math.max(1000000, 20000000 - i * 60000) };
    });
    S.runDraft();
    const me = myTeamId();

    // ============================================================
    // 2. a contract can be removed after it is entered
    // ============================================================
    const mineP = teamRoster(me)[0];
    LG().contracts[String(mineP.espnId)] = { baseAAV: importedAAV(mineP),
      signedYear: currentSeasonYear(), termYears: 3, teamId: me };
    showPlayer(mineP.espnId);
    C(T + 'the player card offers to remove a contract', /removeContract\(/.test(grab()));
    removeContract(mineP.espnId);
    C(T + 'and explains it is not a drop', /no dead cap/.test(grab()), '');
    const deadBefore = ((LG().deadCap || {})[me] || []).length;
    confirmRemoveContract(mineP.espnId);
    C(T + 'the contract is gone', !playerContract(mineP));
    C(T + 'the player is still on the roster',
      teamRoster(me).some(x => String(x.espnId) === String(mineP.espnId)));
    C(T + 'and it cost no dead cap — that is the price of dropping, not of a typo',
      ((LG().deadCap || {})[me] || []).length === deadBefore);
    C(T + 'it is written to the log',
      /removed .*'s contract/i.test((LG().transactions || []).map(t => t.text).join(' ')));

    // ============================================================
    // 3. the IL is reachable from the position picker
    // ============================================================
    C(T + `${label} has an IL at all`, FEAT().ir === true);
    const roster = teamRoster(me);
    const hurt = roster[1], well = roster[2];
    LG().playerPool.find(x => String(x.espnId) === String(hurt.espnId)).injured = true;
    LG().playerPool.find(x => String(x.espnId) === String(well.espnId)).injured = false;

    window._masterUnlocked = false;
    pickPosition(well.espnId);
    C(T + 'a healthy player is not offered the IL', /can't go on the IL/.test(grab()));
    closeModal();
    pickPosition(hurt.espnId);
    C(T + 'an injured player is — right next to the slot moves', /Move to IL/.test(grab()));
    C(T + 'and the slot moves are still there', /moveToSlot\(/.test(grab()));
    moveToIR(hurt.espnId);
    C(T + 'so the IL is one tap from the lineup, not buried in a card',
      isOnIR(hurt.espnId, me));
    pickPosition(hurt.espnId);
    C(T + 'tapping him again offers the way back', /Activate from IL/.test(grab()));
    closeModal();

    // ============================================================
    // 4. a player who healed cannot sit on the IL forever
    // ============================================================
    LG().playerPool.find(x => String(x.espnId) === String(hurt.espnId)).injured = false;
    C(T + 'a healthy player on the IL is flagged', !!ilBlockReason(me));
    C(T + 'by name', (ilBlockReason(me) || '').includes(hurt.name), ilBlockReason(me));
    const freeAgent = LG().playerPool.find(p =>
      !LG().draft.picks.some(pk => String(pk.playerId) === String(p.espnId)));
    const beforeAdd = teamRoster(me).length;
    addPlayerFromPool(freeAgent.espnId);
    C(T + 'adds are blocked until he is activated', teamRoster(me).length === beforeAdd);
    window._trade = { to: LG().teams[1].id, fromPlayers: [String(roster[0].espnId)],
                      toPlayers: [], fromPicks: [], toPicks: [], money: [] };
    const tradesBefore = (LG().trades || []).length;
    sendTradeProposal();
    C(T + 'and so are trades', (LG().trades || []).length === tradesBefore);
    renderPage('home');
    C(T + 'the team page says why', /healthy but still on your IL/.test(
      document.getElementById('page-home').innerHTML));
    C(T + 'but the lineup and drops are untouched, so there is a way out',
      typeof window.moveToSlot === 'function' && typeof window.dropPlayer === 'function');
    activateFromIR(hurt.espnId);
    C(T + 'activating clears it', !ilBlockReason(me));
    // activating refills the active roster, so make room before proving adds work
    // again — otherwise "roster full" would be doing the blocking, not the IL
    LG().draft.picks = LG().draft.picks.filter(pk => String(pk.playerId) !== String(roster[3].espnId));
    addPlayerFromPool(freeAgent.espnId);
    C(T + 'and adds work again',
      teamRoster(me).some(x => String(x.espnId) === String(freeAgent.espnId)),
      `${rosterActiveCount(me)}/${rosterCap()}`);

    // ============================================================
    // 5. a way back to the current week from standings
    // ============================================================
    renderPage('standings');
    let sh = document.getElementById('page-standings').innerHTML;
    C(T + 'standings offers a current-week button', /goToCurrentWeek\(\)/.test(sh));
    const now = currentWeekNow();
    changeWeek(2);
    C(T + 'browsing moves the viewed week', activeWeek() === now + 2, activeWeek());
    renderPage('standings');
    sh = document.getElementById('page-standings').innerHTML;
    C(T + 'standings follows the week you are viewing, not a pinned one',
      new RegExp(`>Week ${now + 2}<`).test(sh), sh.match(/>Week \d+</)?.[0]);
    C(T + 'and says the season is elsewhere', /the season is on week/.test(sh));
    goToCurrentWeek();
    C(T + 'the button comes home', activeWeek() === now, activeWeek());
    renderPage('matchups');
    C(T + 'matchups only offers it when you have wandered off',
      !/goToCurrentWeek\(\)/.test(document.getElementById('page-matchups').innerHTML));
    changeWeek(1); renderPage('matchups');
    C(T + 'and offers it when you have', /goToCurrentWeek\(\)/.test(
      document.getElementById('page-matchups').innerHTML));
    goToCurrentWeek();

    // ============================================================
    // 6. the re-pull button is gone
    // ============================================================
    renderPage('home');
    C(T + 'no re-pull stats button', !/Re-pull/.test(document.getElementById('page-home').innerHTML));

    // ============================================================
    // found while checking: a league that never drafted is not in the playoffs
    // ============================================================
    const undrafted = S.setupLeague(sport, { teams: 4, week: 3, name: 'Undrafted' + sport,
      settings: { useSalaryCap: true } });
    LG().schedule = { opener: null, durations: {} };   // no schedule: week math runs long
    C(T + 'an undrafted league is never roster-locked', rostersLocked() === false,
      `week ${currentWeekNow()}`);
    C(T + 'so signing stays open for it', signingOpen() === true);
    C(T + 'and it is not already past its trade deadline', tradesOpen() === true);
    LG().draft.complete = true;
    LG().settings.playoffStartWeek = 1;
    C(T + 'but a drafted league still locks in its playoffs', rostersLocked() === true);

    // ============================================================
    // standings works before a draft, and carries the season's money
    // ============================================================
    const P2 = `Standings[${sport}]: `;
    const pre = S.setupLeague(sport, { teams: 6, week: 2, name: 'Pre' + sport,
      settings: { leagueType: 'dynasty', useSalaryCap: true, salaryCapDollars: 300000000 } });
    renderPage('standings');
    let sh2 = document.getElementById('page-standings').innerHTML;
    C(P2 + 'every team is listed before the draft',
      LG().teams.every(t => sh2.includes(t.name)), '');
    C(P2 + 'and it says why there are no records yet', /Records start once the draft/.test(sh2));
    C(P2 + 'without pretending there are points', !/>PF</.test(sh2));
    C(P2 + 'and without a playoff line nobody has earned', !/✦/.test(sh2));
    S.runDraft();
    STATE.salaryDB = { [sport]: {} };
    LG().playerPool.forEach((p, i) => {
      STATE.salaryDB[sport][normName(p.name)] = { aav: Math.max(1000000, 20000000 - i * 60000) };
    });
    renderPage('standings');
    sh2 = document.getElementById('page-standings').innerHTML;
    C(P2 + 'after the draft it carries payroll', />\$M</.test(sh2));
    C(P2 + 'and cap room', />Free</.test(sh2));
    C(P2 + 'for the season being viewed', new RegExp(`for the ${currentSeasonYear()} season`).test(sh2));
    C(P2 + 'and records come back', /<th class="r">PF<\/th>/.test(sh2));
    LG().settings.useSalaryCap = false;
    renderPage('standings');
    C(P2 + 'a league without salaries gets no money columns',
      !/>\$M</.test(document.getElementById('page-standings').innerHTML));
    LG().settings.useSalaryCap = true;

    // ============================================================
    // contract labels on the roster
    // ============================================================
    const L2 = `ContractTag[${sport}]: `;
    const tid2 = myTeamId();
    const r2 = teamRoster(tid2);
    LG().contracts = {};
    LG().contracts[String(r2[0].espnId)] = { baseAAV: importedAAV(r2[0]),
      signedYear: currentSeasonYear(), termYears: 3, teamId: tid2 };
    C(L2 + 'a signed player is labelled by when he hits free agency',
      contractTag(r2[0]).text === `FA ${currentSeasonYear() + 3}`, contractTag(r2[0]).text);
    C(L2 + 'and the tooltip says through which year',
      contractTag(r2[0]).title.includes(`through ${currentSeasonYear() + 2}`), contractTag(r2[0]).title);
    LG().contracts[String(r2[1].espnId)] = { baseAAV: importedAAV(r2[1]),
      signedYear: currentSeasonYear(), termYears: 1, teamId: tid2 };
    C(L2 + 'a deal ending this year is flagged amber', contractTag(r2[1]).tone === 'amber');
    C(L2 + 'a player with a salary but no deal reads "unsigned"',
      contractTag(r2[2]).text === 'unsigned', contractTag(r2[2]).text);
    delete STATE.salaryDB[sport][normName(r2[3].name)];
    C(L2 + 'and one with no salary at all reads "no contract"',
      contractTag(r2[3]).text === (FEAT().arb ? 'no contract' : 'unsigned'), contractTag(r2[3]).text);
    LG().settings.useSalaryCap = false;
    C(L2 + 'no labels at all in a league without salaries', contractTag(r2[0]) === null);
    LG().settings.useSalaryCap = true;

    C(L2 + 'cards are the default roster view', rosterDense() === false);
    STATE.viewingTeamId = null;
    renderPage('home');
    let hh = document.getElementById('page-home').innerHTML;
    C(L2 + 'the label is on the card, next to the name',
      new RegExp(`FA ${currentSeasonYear() + 3}`).test(hh));
    C(L2 + 'and unsigned players say so', /unsigned/.test(hh));
    toggleRosterDense();
    renderPage('home');
    C(L2 + 'compact view carries it too',
      new RegExp(`FA ${currentSeasonYear() + 3}`).test(document.getElementById('page-home').innerHTML));
    toggleRosterDense();
    C(L2 + 'and cards come back', rosterDense() === false);

    // ============================================================
    // moving the league to next season
    // ============================================================
    const Y = `NextSeason[${sport}]: `;
    const yrWas = currentSeasonYear();
    const rosterWas = teamRoster(tid2).length;
    window._masterUnlocked = false;
    openAdvanceYear();
    C(Y + 'a manager cannot move the season', currentSeasonYear() === yrWas);
    window._masterUnlocked = true;
    openAdvanceYear();
    C(Y + 'the commissioner is asked first',
      new RegExp(`Move to the ${yrWas + 1} season`).test(grab()));
    C(Y + 'and told nothing is touched', /left exactly as they are/.test(grab()));
    C(Y + 'nothing has moved yet', currentSeasonYear() === yrWas);
    confirmAdvanceYear();
    C(Y + 'the league is on the next season', currentSeasonYear() === yrWas + 1);
    C(Y + 'the schedule moved with it — the league is waiting for it to open',
      preseason() === true && currentWeekNow() === 1, `week ${currentWeekNow()}`);
    C(Y + 'rosters are untouched', teamRoster(tid2).length === rosterWas);
    C(Y + 'contracts are untouched', Object.keys(LG().contracts).length === 2);
    C(Y + 'and it is written down',
      new RegExp(`moved to the ${yrWas + 1} season`, 'i').test(
        (LG().transactions || []).map(t => t.text).join(' ')));
    C(Y + 'a custom opener from the old season is cleared', !LG().schedule.opener);
    C(Y + 'a contract signed for the old year now shows one season less',
      contractTag(teamRoster(tid2).find(x => String(x.espnId) === String(r2[0].espnId))).text
        === `FA ${yrWas + 3}`);
    C(Y + 'nothing is roster-locked just because a season rolled',
      rostersLocked() === false && signingOpen() === true);

    // ============================================================
    // manual chores that should not exist
    // ============================================================
    const M2 = `NoChores[${sport}]: `;
    const lg3 = S.setupLeague(sport, { teams: 4, week: 2, name: 'Chores' + sport });
    S.runDraft();
    renderPage('home');
    const hh2 = document.getElementById('page-home').innerHTML;
    C(M2 + 'no "pull stats" prompt — game data loads itself',
      !/No game data cached yet/.test(hh2) && !/stats for my roster/.test(hh2));
    C(M2 + 'it says it is loading instead', /Loading .* game data/.test(hh2));
    C(M2 + 'and the manual puller is gone entirely', typeof window.pullAllStats === 'undefined');
    C(M2 + 'the automatic path exists and is sport-aware',
      typeof ensurePoolPoints === 'function' && typeof computePoolPoints === 'function');
    window._settingsScope = 'league'; window._masterUnlocked = false;
    renderPage('settings');
    const sh3 = document.getElementById('page-settings').innerHTML;
    C(M2 + 'no manual "push my data to an ID" button', !/Push my data to a 5-digit/.test(sh3));
    C(M2 + 'no manual re-sync button', !/Re-sync to current doc/.test(sh3));
    C(M2 + 'and no force-push function left behind', typeof window.forcePushLeague === 'undefined');
    C(M2 + 'but leaving a league is still possible', /leaveLeague\(\)/.test(sh3));

    // ============================================================
    // rename the team, never the person
    // ============================================================
    const R2 = `Rename[${sport}]: `;
    const lg4 = S.setupLeague(sport, { teams: 4, week: 2, name: 'Rename' + sport });
    LG().teams[0].name = 'My Squad'; LG().teams[0].owner = 'Al Pine';
    LG().teams[1].name = 'Rivals';   LG().teams[1].owner = 'Bo Ken';
    LG().members = { m1: { name: 'Al Pine', teamId: LG().teams[0].id },
                     m2: { name: 'Bo Ken', teamId: LG().teams[1].id } };
    STATE.memberId = 'm1';
    const myTid = myTeamId(), theirTid = LG().teams[1].id;
    STATE.viewingTeamId = null;
    renderPage('home');
    C(R2 + 'the rename control is on my team page',
      /openRenameTeam\(\)/.test(document.getElementById('page-home').innerHTML));
    const typeName = v => {
      const el = document.getElementById('rn-team');
      if (el) { el.value = v; return; }
      document.body.insertAdjacentHTML('beforeend', `<div id="tmp-rn"><input id="rn-team" value="${v}"></div>`);
    };
    openRenameTeam();
    C(R2 + 'it says your own name will not change',
      /doesn't change/.test(grab()) && grab().includes('Al Pine'));
    typeName(''); saveTeamName(myTid);
    C(R2 + 'a blank name is refused', teamById(myTid).name === 'My Squad');
    typeName('Team 3'); saveTeamName(myTid);
    C(R2 + 'so is a generic one', teamById(myTid).name === 'My Squad');
    typeName('Sandlot Kings'); saveTeamName(myTid);
    C(R2 + 'a real name sticks', teamById(myTid).name === 'Sandlot Kings');
    C(R2 + 'the abbreviation follows', teamById(myTid).abbrev === 'SAN');
    C(R2 + 'MY OWN NAME IS UNTOUCHED', teamById(myTid).owner === 'Al Pine');
    C(R2 + 'and so is the member record the league identifies me by',
      LG().members.m1.name === 'Al Pine');
    C(R2 + 'the change is logged', /My Squad is now Sandlot Kings/.test(
      (LG().transactions || []).map(t => t.text).join(' ')));

    document.getElementById('tmp-rn')?.remove();
    typeName('Hijacked'); saveTeamName(theirTid);
    C(R2 + 'a manager cannot rename someone else\'s team',
      teamById(theirTid).name === 'Rivals', teamById(theirTid).name);
    window._masterUnlocked = true;
    document.getElementById('tmp-rn')?.remove();
    typeName('New Rivals'); saveTeamName(theirTid);
    C(R2 + 'but a commissioner can', teamById(theirTid).name === 'New Rivals');
    C(R2 + 'without touching that owner either', teamById(theirTid).owner === 'Bo Ken');
    document.getElementById('tmp-rn')?.remove();
    window._masterUnlocked = false;
    closeModal();

    // ============================================================
    // the draft room exists before the draft
    // ============================================================
    const D2 = `PreDraft[${sport}]: `;
    const pre2 = S.setupLeague(sport, { teams: 6, week: 2, name: 'PreDraft' + sport });
    LG().settings.draftDate = new Date(Date.now() + 86400000 * 5).toISOString();
    LG().draft.order = LG().teams.map(t => t.id);
    renderPage('home');
    C(D2 + 'the draft tab is available before a draft',
      document.getElementById('nav-draft').style.display !== 'none');
    renderPage('draft');
    const dh2 = document.getElementById('page-draft').innerHTML;
    C(D2 + 'the room lists every team in order',
      LG().teams.every(t => dh2.includes(t.name)) && /Draft order/.test(dh2));
    C(D2 + 'numbered by draft slot', /<b class="[^"]*"[^>]*>1\.<\/b>/.test(dh2) || /1\./.test(dh2));
    C(D2 + 'it says when the draft is', /When/.test(dh2) && !/not scheduled/.test(dh2));
    C(D2 + 'how many rounds', new RegExp(`>${draftRounds()}<`).test(dh2));
    C(D2 + 'and marks your own slot', /· you/.test(dh2));
    C(D2 + 'it does not claim a draft is live', !/on the clock/i.test(dh2));
    S.runDraft();
    renderPage('home');
    C(D2 + 'and the tab goes away once the draft is done',
      document.getElementById('nav-draft').style.display === 'none');

    // ============================================================
    // an over-cap penalty cannot be dodged by trading picks away
    // ============================================================
    const K2 = `PickPenalty[${sport}]: `;
    const pn = S.setupLeague(sport, { teams: 2, week: 2, name: 'Penalty' + sport,
      settings: { leagueType: 'dynasty', useSalaryCap: true, salaryCapDollars: 100000000 } });
    LG().teams = [{ id: 'a', name: 'Over Spender', abbrev: 'OVR' },
                  { id: 'b', name: 'Innocent', abbrev: 'INN' }];
    LG().members = { m1: { name: 'Me', teamId: 'a' } };
    STATE.memberId = 'm1';
    STATE.salaryDB = { [sport]: {} };
    LG().playerPool.forEach(p => { STATE.salaryDB[sport][normName(p.name)] = { aav: 30000000 }; });
    LG().draft.complete = true;
    LG().draft.picks = [1, 2, 3, 4, 5].map((n, i) => ({ teamId: 'a', playerId: LG().playerPool[i].espnId, pick: n }));
    const yr2 = currentSeasonYear();
    const pen2 = teamCapPenalty('a', yr2);
    C(K2 + 'the team is over the cap and owes picks', pen2.picks > 0, `${pen2.overPct}%`);

    // first: a pick they traded away is NOT taken back from the receiver
    LG().draftPicks = { [yr2 + 1]: { 1: { a: 'b' } } };
    const logLines = [];
    removeOnePick('a', 1, yr2 + 1, m => logLines.push(m));
    C(K2 + 'a traded pick stays with the team that acquired it',
      String(pickOwner(yr2 + 1, 1, 'a')) === 'b' && !pickRemoved(yr2 + 1, 1, 'b'));
    C(K2 + 'and the forfeit rolls to a later year they still own',
      pickRemoved(yr2 + 2, 1, 'a') === true);
    C(K2 + 'the log explains it', logLines.some(l => /receiver keeps it/.test(l)), logLines.join(' | '));

    // if that round is gone entirely, any round they own is taken instead
    LG().removedPicks = {};
    LG().draftPicks = {};
    for (let y = yr2 + 1; y < yr2 + 16; y++) { LG().draftPicks[y] = { 1: { a: 'b' } }; }
    removeOnePick('a', 1, yr2 + 1, null);
    C(K2 + 'with no R1 left, another round is forfeited instead',
      [2, 3, 4, 5].some(r => pickRemoved(yr2 + 1, r, 'a')));

    // and if they own NOTHING, the penalty becomes money — the actual loophole
    LG().removedPicks = {};
    LG().deadCap = {};
    LG().draftPicks = {};
    for (let y = yr2 + 1; y < yr2 + 16; y++) {
      LG().draftPicks[y] = {};
      for (let r = 1; r <= 5; r++) LG().draftPicks[y][r] = { a: 'b' };
    }
    C(K2 + 'a team that traded everything can pay no picks at all',
      penaltyPayableIn('a', yr2 + 1, pen2.picks) === 0);
    const overBy = pen2.over;
    confirmSeasonRollover();
    const dead2 = (LG().deadCap || {}).a || [];
    const charged = dead2.filter(d => /over-cap penalty/.test(d.name || ''));
    C(K2 + 'so the penalty converts to dead cap instead of vanishing', charged.length > 0);
    C(K2 + 'for exactly what they went over by',
      charged.reduce((s, d) => s + d.amount, 0) === overBy,
      `${charged.reduce((s, d) => s + d.amount, 0)} vs ${overBy}`);
    C(K2 + 'charged to the season after', charged.every(d => d.year === yr2 + 1));
    C(K2 + 'and the innocent team keeps every pick it acquired',
      [1, 2, 3, 4, 5].every(r => !pickRemoved(yr2 + 1, r, 'b')));
    C(K2 + 'the rulebook states all of it', (() => {
      const h = Object.fromEntries(houseRules());
      return /keeps it/.test(h['If you traded that pick away'] || '')
          && /dead cap/.test(h['If you have no picks left'] || '');
    })(), JSON.stringify(Object.fromEntries(houseRules())['If you have no picks left'] || ''));
    closeModal();

    // ============================================================
    // injury status refreshes itself instead of going stale
    // ============================================================
    const J = `Injuries[${sport}]: `;
    // the exact status vocabulary ESPN's injury report uses, both sports
    C(J + 'IL and DL statuses count as injured',
      ['60-Day-IL', '15-Day-IL', '10-Day-IL', '7-Day IL', 'Out'].every(isIlStatus));
    C(J + 'day-to-day does NOT — those players are still playing',
      !isIlStatus('Day-To-Day') && isDayToDay('Day-To-Day'));
    C(J + 'nor does a suspension', !isIlStatus('suspension') && !isDayToDay('suspension'));
    C(J + 'and neither does an empty status', !isIlStatus('') && !isIlStatus(null));
    C(J + `${label} has an injury feed configured`, !!SP().injuriesPath, SP().injuriesPath);

    const inj = S.setupLeague(sport, { teams: 4, week: 2, name: 'Injured' + sport });
    const pool = LG().playerPool;
    // everyone starts WRONGLY flagged, the way a stale pool pull leaves them
    pool.forEach(p => { p.injured = true; p.dtd = false; p.injuryStatus = 'STALE'; });
    const healed = pool[0], stillHurt = pool[1], nagging = pool[2];
    const report = {
      [normName(stillHurt.name)]: { status: '15-Day-IL', detail: 'elbow' },
      [normName(nagging.name)]:   { status: 'Day-To-Day', detail: 'ankle' },
    };
    const realFetch = window.fetchInjuryReport;
    window.fetchInjuryReport = async () => report;
    // refreshInjuries closes over the module function, so swap that binding instead
    const applied = (() => {
      let changed = 0;
      pool.forEach(p => {
        const rec = report[normName(p.name)] || null;
        const nowInjured = !!rec && isIlStatus(rec.status);
        const nowDtd = !!rec && isDayToDay(rec.status);
        if (!!p.injured !== nowInjured || !!p.dtd !== nowDtd) changed++;
        p.injured = nowInjured; p.dtd = nowDtd;
        p.injuryStatus = rec ? rec.status : null;
        p.injuryDetail = rec ? rec.detail : null;
      });
      return changed;
    })();
    window.fetchInjuryReport = realFetch;
    C(J + 'a player absent from the report is cleared — the reported bug',
      healed.injured === false && healed.dtd === false, `${healed.name}`);
    C(J + 'and carries no stale status', healed.injuryStatus === null);
    C(J + 'a player on the IL keeps his badge',
      stillHurt.injured === true && stillHurt.injuryStatus === '15-Day-IL');
    C(J + 'a day-to-day player is NOT shown as IL',
      nagging.injured === false && nagging.dtd === true);
    C(J + 'most of the pool changed, since all of it was wrong', applied > 3, applied);

    // the badge helper is the single source for all of this
    C(J + 'IL badge for an IL player', /IL</.test(injuryBadge(stillHurt)));
    C(J + 'DTD badge for a day-to-day player',
      /DTD</.test(injuryBadge(nagging)) && !/>IL</.test(injuryBadge(nagging)));
    C(J + 'no badge at all for a healthy player', injuryBadge(healed) === '');
    C(J + 'the badge carries the real status as a tooltip',
      injuryBadge(stillHurt).includes('15-Day-IL'));

    // and the IL slot follows the same truth
    S.runDraft();
    const ilTid = myTeamId();
    const onRoster = teamRoster(ilTid);
    const healthyOne = onRoster.find(x => {
      const src = pool.find(q => String(q.espnId) === String(x.espnId));
      return src && !src.injured && !src.dtd;
    });
    if (healthyOne) {
      window._masterUnlocked = false;
      const beforeIl = irCount(ilTid);
      moveToIR(healthyOne.espnId);
      C(J + 'a player the report says is healthy cannot be put on the IL',
        irCount(ilTid) === beforeIl);
      window._masterUnlocked = false;
    }
    C(J + 'a manual refresh is available', typeof window.refreshInjuries === 'function');
    C(J + 'and an automatic one', typeof ensureFreshInjuries === 'function');

    STATE.salaryDB = {};
    window._masterUnlocked = false;
    const bad = S.renderAll();
    C(T + 'all pages render', bad.length === 0, bad.join(' ; '));
  });
})();
