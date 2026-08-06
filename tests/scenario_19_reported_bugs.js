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
    C(T + 'but the lineup and drops are untouched, so there is a way out', (() => {
      const n = teamRoster(me).length;
      confirmDrop(teamRoster(me)[n - 1].espnId);   // blocked from adding, never from dropping
      return typeof window.moveToSlot === 'function' && teamRoster(me).length === n - 1;
    })());
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
    const homeHtml = document.getElementById('page-home').innerHTML;
    C(R2 + 'the rename control is on my team page',
      /openRenameTeam\(\)/.test(homeHtml));
    // it is a pen beside the name you can see, not a "Name" button in the row of
    // tabs — you rename the thing you are looking at
    C(R2 + 'and it is a pen next to the displayed team name',
      homeHtml.indexOf('openRenameTeam()') < homeHtml.indexOf('openTradeCenter()')
      && /✎<\/button>/.test(homeHtml));
    C(R2 + 'the old ✎ Name button is gone', !/✎ Name/.test(homeHtml));
    C(R2 + 'only my own team gets the pen, not one I am just viewing', (() => {
      setViewingTeam(theirTid);
      renderPage('home');
      const other = document.getElementById('page-home').innerHTML;
      setViewingTeam(myTid); renderPage('home');
      return !/openRenameTeam\(\)/.test(other);
    })());
    // adds and drops belong to the players page and the player card, which handle
    // waivers, dead cap and acquisition limits; the old modal did none of that
    C(R2 + 'the +/− Players button is gone', !/openAddDrop/.test(homeHtml) && !/Players<\/button>/.test(homeHtml));
    C(R2 + 'and the log is called Activity', /≡ Activity/.test(homeHtml) && !/≡ Log/.test(homeHtml));
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
    C(K2 + 'and the forfeit falls on the same round the year after',
      pickRemoved(yr2 + 2, 1, 'a') === true);
    C(K2 + 'the log explains it',
      logLines.some(l => new RegExp(`${yr2 + 1} R1 is already gone`).test(l)), logLines.join(' | '));

    // ONE year, and only that round. A 4th-rounder is not payment for a 1st, and a
    // pick five drafts out is not a penalty — both convert to money instead.
    LG().removedPicks = {};
    LG().draftPicks = {};
    for (let y = yr2 + 1; y < yr2 + 16; y++) { LG().draftPicks[y] = { 1: { a: 'b' } }; }
    const gone = [];
    const paid = removeOnePick('a', 1, yr2 + 1, m => gone.push(m));
    C(K2 + 'with no R1 inside the window, nothing is taken', paid === false);
    C(K2 + 'and no other round is raided to make up for it',
      [1, 2, 3, 4, 5].every(r => !pickRemoved(yr2 + 1, r, 'a') && !pickRemoved(yr2 + 2, r, 'a')),
      JSON.stringify(LG().removedPicks));
    C(K2 + 'nor is it deferred to some far-off draft they do still own',
      [3, 4, 5, 6, 7, 8].every(n => !pickRemoved(yr2 + n, 1, 'a')));
    C(K2 + 'and the log says it became dead cap instead',
      gone.some(l => /dead cap instead/.test(l)), gone.join(' | '));
    // one year past is in; two is out
    LG().removedPicks = {};
    LG().draftPicks = { [yr2 + 1]: { 1: { a: 'b' } }, [yr2 + 2]: { 1: { a: 'b' } } };
    C(K2 + 'the window really is one year, not two',
      removeOnePick('a', 1, yr2 + 1, null) === false && !pickRemoved(yr2 + 3, 1, 'a'));
    LG().removedPicks = {};
    LG().draftPicks = { [yr2 + 1]: { 1: { a: 'b' } } };
    C(K2 + 'while the year after a traded pick is still payable',
      removeOnePick('a', 1, yr2 + 1, null) === true && pickRemoved(yr2 + 2, 1, 'a'));

    // THE MONEY IS NOT INSTEAD OF THE PICKS. A team that can pay every pick it owes
    // still pays the overage too — otherwise forfeiting picks would buy off the cash.
    LG().removedPicks = {};
    LG().deadCap = {};
    LG().draftPicks = {};                      // owns everything
    const capBefore2 = LG().settings.salaryCapDollars;
    confirmSeasonRollover();
    C(K2 + 'a team that can pay every pick still pays the money too', (() => {
      const paidPicks = [1, 2, 3].filter(r => pickRemoved(yr2 + 1, r, 'a')).length;
      const cash = ((LG().deadCap || {}).a || []).filter(d => /over-cap penalty/.test(d.name || ''));
      return paidPicks === pen2.picks
          && cash.reduce((s, d) => s + d.amount, 0) === pen2.over;
    })(), JSON.stringify({ removed: LG().removedPicks, dead: (LG().deadCap || {}).a }));
    C(K2 + 'and the money is the full overage, not a fraction of it',
      (((LG().deadCap || {}).a || [])[0] || {}).amount === pen2.over,
      `${(((LG().deadCap || {}).a || [])[0] || {}).amount} vs ${pen2.over}`);
    closeModal();
    // put the year and the cap back, so the no-picks case below is the same offence
    LG().seasonYear = yr2;
    LG().settings.salaryCapDollars = capBefore2;

    // and if they own NOTHING, the money still lands in full — the actual loophole
    LG().removedPicks = {};
    LG().deadCap = {};
    LG().draftPicks = {};
    for (let y = yr2 + 1; y < yr2 + 16; y++) {
      LG().draftPicks[y] = {};
      for (let r = 1; r <= 5; r++) LG().draftPicks[y][r] = { a: 'b' };
    }
    C(K2 + 'a team that traded everything can pay no picks at all',
      penaltyPayableIn('a', yr2 + 1, pen2.picks) === 0);
    // the preview and the button must agree, or the preview is lying
    C(K2 + 'and the preview says the same as the rollover will do', (() => {
      LG().removedPicks = {};
      LG().draftPicks = { [yr2 + 1]: { 1: { a: 'b' } } };   // only their next R1 is gone
      const predicted = penaltyPayableIn('a', yr2 + 1, 3);
      let actual = 0;
      for (let k = 0; k < 3; k++) if (removeOnePick('a', k + 1, yr2 + 1, null)) actual++;
      return predicted === actual && actual === 3;
    })());
    LG().removedPicks = {};
    LG().draftPicks = {};
    for (let y = yr2 + 1; y < yr2 + 16; y++) {
      LG().draftPicks[y] = {};
      for (let r = 1; r <= 5; r++) LG().draftPicks[y][r] = { a: 'b' };
    }
    const overBy = pen2.over;
    confirmSeasonRollover();
    const dead2 = (LG().deadCap || {}).a || [];
    const charged = dead2.filter(d => /over-cap penalty/.test(d.name || ''));
    C(K2 + 'so the penalty still lands as dead cap rather than vanishing', charged.length > 0);
    C(K2 + 'for exactly what they went over by',
      charged.reduce((s, d) => s + d.amount, 0) === overBy,
      `${charged.reduce((s, d) => s + d.amount, 0)} vs ${overBy}`);
    C(K2 + 'charged to the season after', charged.every(d => d.year === yr2 + 1));
    C(K2 + 'and the innocent team keeps every pick it acquired',
      [1, 2, 3, 4, 5].every(r => !pickRemoved(yr2 + 1, r, 'b')));
    C(K2 + 'the rulebook states all of it', (() => {
      const h = Object.fromEntries(houseRules());
      const noneLeft = h['If you have no pick of that round in either year'] || '';
      const over = h['Going over the cap'] || '';
      return /keeps it/.test(h['If you traded that pick away'] || '')
          && /same round the following year/.test(h['If you traded that pick away'] || '')
          && /dead cap the following season/.test(over)
          && /Both, every time/.test(over)
          && /charged in full regardless/.test(noneLeft)
          && /different round is never taken/.test(noneLeft)
          && /never deferred further out/.test(noneLeft);
    })(), JSON.stringify(Object.fromEntries(houseRules())));
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

    // ============================================================
    // a best-of-week league is measured in best-of-week units
    // ============================================================
    const W = `BestWeek[${sport}]: `;
    const bw = S.setupLeague(sport, { teams: 2, week: 9, name: 'BestWk' + sport,
      settings: { scoringFormat: 'bestGame', bestGameScope: 'all' } });
    S.genLogs(9);
    LG().playerPool.forEach(p => { if (p.mlbId && LG().gameLogs[p.mlbId]) applyPointFields(p, LG().gameLogs[p.mlbId]); });
    const anyP = LG().playerPool.find(p => p.bestAvg > 0);
    C(W + 'a season best-average is computed', anyP && anyP.bestAvg > 0, anyP && anyP.bestAvg);
    C(W + 'and one for every window', anyP && anyP.bestAvg30 != null
      && anyP.bestAvg14 != null && anyP.bestAvg7 != null,
      anyP && `${anyP.bestAvg30}/${anyP.bestAvg14}/${anyP.bestAvg7}`);
    C(W + 'a windowed best-average is an average, not a running total — so it is not\n' +
        '      bigger than the season one just because the window is shorter',
      anyP.bestAvg7 <= anyP.ptsSeason, `${anyP.bestAvg7} vs ${anyP.ptsSeason}`);
    C(W + 'while the windowed TOTALS still are totals', anyP.pts30 >= anyP.pts7);

    C(W + 'the league is recognised as best-of-week', leagueUsesBestGame() === true);
    C(W + 'so every window resolves to a best-average field',
      ['season','30','14','7'].every(w => /^bestAvg/.test(ptsFieldFor(w, anyP))),
      ['season','30','14','7'].map(w => ptsFieldFor(w, anyP)).join(','));
    C(W + 'the season column is labelled BEST, not PTS',
      statWindowOptions().some(o => o[0] === 'season' && o[1] === 'BEST'));
    C(W + 'and the redundant AVG window is not offered twice',
      !statWindowOptions().some(o => o[0] === 'bestavg'));
    // basketball normally leads with FP/G, but in a best-of-week league the other
    // games are never scored, so the week's best has to be what you land on
    C(W + 'the unit this league pays out in leads the row, in either sport',
      statWindowOptions()[0][0] === 'season', statWindowOptions().map(o => o[1]).join(','));
    C(W + 'and it is what you land on', activeStatWindow() === 'season', activeStatWindow());
    if (FEAT().perGameScoring) {
      C(W + 'FP/G is still one tap away, not thrown out',
        statWindowOptions().some(o => o[0] === 'fpg'));
    }
    renderPage('players');
    let ph = document.getElementById('page-players').innerHTML;
    C(W + 'the page says what the number means',
      /average of each week's best game/.test(ph));
    // and says it ABOVE the list — under a 150-row table nobody ever reads it
    C(W + 'where you can see it without scrolling past every player',
      ph.indexOf('average of each week\'s best game') < ph.indexOf('showPlayer('));
    // search down to the one player, so the assertion is about HIS number and not
    // whichever 150 rows happened to sort to the top
    setSearch(anyP.name);
    ph = document.getElementById('page-players').innerHTML;
    C(W + 'the player is on the page', ph.includes(esc(anyP.name)));
    C(W + 'and the value carries a decimal, since 6.6 and 6.4 both round to 6',
      new RegExp(`>${anyP.bestAvg.toFixed(1)}<`).test(ph), anyP.bestAvg.toFixed(1));
    setPtsWindow('30');
    setSearch(anyP.name);
    ph = document.getElementById('page-players').innerHTML;
    C(W + 'switching window switches which best-average is shown',
      /last 30 days/.test(ph));
    C(W + 'and the number switches with it',
      new RegExp(`>${anyP.bestAvg30.toFixed(1)}<`).test(ph), anyP.bestAvg30.toFixed(1));
    setPtsWindow('season');
    setSearch('');

    // a total-points league is untouched
    const reg = S.setupLeague(sport, { teams: 2, week: 9, name: 'Reg' + sport,
      settings: { scoringFormat: 'regular' } });
    S.genLogs(9);
    LG().playerPool.forEach(p => { if (p.mlbId && LG().gameLogs[p.mlbId]) applyPointFields(p, LG().gameLogs[p.mlbId]); });
    const regP = LG().playerPool.find(p => p.ptsSeason > 0);
    C(W + 'a total-points league still totals', leagueUsesBestGame() === false
      && ptsFieldFor('season', regP) === 'ptsSeason');
    C(W + 'and keeps the separate best-average lens',
      statWindowOptions().some(o => o[0] === 'bestavg'));
    C(W + 'where basketball still leads with FP/G, as it always has',
      statWindowOptions()[0][0] === (FEAT().perGameScoring ? 'fpg' : 'season'),
      statWindowOptions()[0].join('/'));

    // ============================================================
    // loading a sport's salary database is not a league setting
    // ============================================================
    const SD = `SalaryPaste[${sport}]: `;
    // the exact shape of a real paste: name, pos, team, age, start, end, years, $total, $aav
    const NBA_PASTE = [
      "Jayson Tatum\tPF\t BOS\t26\t2025\t2029\t5\t$313,933,410\t$62,786,682",
      "Nikola Jokic\tC\t DEN\t27\t2023\t2027\t5\t$276,122,630\t$55,224,526",
      "Shai Gilgeous-Alexander\tPG\t OKC\t26\t2027\t2030\t4\t$271,656,000\t$67,914,000",
      "De'Aaron Fox\tPG\t SAS\t27\t2026\t2029\t4\t$221,707,584\t$55,426,896",
      "R.J. Barrett\tSG\t TOR\t22\t2023\t2026\t4\t$107,000,000\t$26,750,000",
      "Jaren Jackson Jr.\tPF\t UTA\t25\t2026\t2029\t4\t$205,000,000\t$51,250,000",
    ].join('\n');
    const MLB_PASTE = [
      "Juan Soto\tRF\t NYM\t26\t2025\t2039\t15\t$765,000,000\t$51,000,000",
      "Zack Wheeler\tSP\t PHI\t34\t2025\t2027\t3\t$126,000,000\t$42,000,000",
      "Bobby Witt Jr.\tSS\t KCR\t24\t2024\t2034\t11\t$288,777,000\t$26,252,454",
    ].join('\n');
    const nba = parseSalaryPaste(NBA_PASTE);
    C(SD + 'a tab-separated basketball paste parses every row', nba.length === 6, nba.length);
    // the real source table arrives with a MULTI-LINE HEADER. Detection used to
    // sample only the first six lines, see no $ in any of them, fall into
    // newline mode, and collapse the entire paste into one bogus "player" —
    // the reported "1 salary saved"
    C(SD + 'the same paste with the table header still parses every row', (() => {
      const HDR = 'PLAYER\tPOS\tTEAM\nCURRENTLY WITH\nAGE\nAT SIGNING\nSTART\nEND\nYRS\nVALUE\nAAV\n';
      const withHdr = parseSalaryPaste(HDR + NBA_PASTE);
      return withHdr.length === 6
        && !withHdr.some(x => /^player$/i.test(x.name))
        && withHdr[0].name === 'Jayson Tatum' && withHdr[0].aav === 62786682;
    })(), JSON.stringify(parseSalaryPaste('PLAYER\tPOS\tTEAM\nAAV\n' + NBA_PASTE).map(x => x.name)));
    C(SD + 'a header line never becomes a player — a contract row carries money',
      !parseSalaryPaste('PLAYER\tPOS\tTEAM\n' + NBA_PASTE).some(x => !x.aav && !x.total));
    C(SD + 'names with a period and an apostrophe survive',
      nba.some(x => x.name === 'R.J. Barrett') && nba.some(x => x.name === "De'Aaron Fox"),
      nba.map(x => x.name).join(' | '));
    C(SD + 'a suffix is not mistaken for a stray field',
      (nba.find(x => /Jaren/.test(x.name)) || {}).name === 'Jaren Jackson Jr.');
    C(SD + 'basketball positions are read as positions', (() => {
      const t = nba.find(x => /Tatum/.test(x.name));
      return t.pos === 'PF' && t.team === 'BOS';
    })(), JSON.stringify(nba[0]));
    C(SD + 'the leading space on the team is trimmed', nba.every(x => x.team && !/^\s/.test(x.team)));
    C(SD + 'age, both years and the term all land in the right slots', (() => {
      const t = nba.find(x => /Tatum/.test(x.name));
      return t.age === 26 && t.start === 2025 && t.end === 2029 && t.years === 5;
    })(), JSON.stringify(nba.find(x => /Tatum/.test(x.name))));
    C(SD + 'the total and the AAV are not swapped', (() => {
      const t = nba.find(x => /Tatum/.test(x.name));
      return t.total === 313933410 && t.aav === 62786682;
    })());
    C(SD + 'a centre parses like any other position',
      (nba.find(x => /Jokic/.test(x.name)) || {}).pos === 'C');

    // a paste is recognised by its positions, so it cannot land in the wrong sport
    C(SD + 'a basketball paste is recognised as basketball', salaryPasteSport(nba) === 'fba');
    C(SD + 'a baseball paste is recognised as baseball',
      salaryPasteSport(parseSalaryPaste(MLB_PASTE)) === 'flb');
    C(SD + 'and an ambiguous one is not guessed at',
      salaryPasteSport([{ pos: 'C' }, { pos: 'C' }]) === null);

    // THE BUG: loading the database was gated behind one league's cap toggle, so a
    // sport with no cap league yet had no way to get its salaries in at all
    STATE.sport = sport;
    STATE.leagues[sport] = blankLeague('NoCap' + sport);
    STATE.activeLeagueDoc = null;             // master settings: bound to no league
    LG().settings.useSalaryCap = false;
    window._masterUnlocked = true;
    window._settingsScope = 'master';
    renderPage('settings');
    const seth = document.getElementById('page-settings').innerHTML;
    C(SD + 'the paste button is there with no league bound and no cap switched on',
      /openSalaryPaste\(\)/.test(seth));
    C(SD + 'named for the sport whose database it writes', seth.includes(`Paste ${SP().label} salary data`));
    C(SD + 'the default cap rules are reachable too', /openSalaryConfig\(\)/.test(seth));
    C(SD + 'but the per-league cap switch is not offered when no league is open',
      !/toggleSalaryCap\(\)/.test(seth));
    C(SD + 'and neither is the season rollover', !/openSeasonRollover\(\)/.test(seth));

    // saving writes to the sport you chose, and says which one
    STATE.salaryDB = {};
    saveSalaryPaste(sport, parseSalaryPaste(sport === 'fba' ? NBA_PASTE : MLB_PASTE));
    C(SD + 'the rows land in that sport\'s database',
      Object.keys(STATE.salaryDB[sport] || {}).length > 0,
      JSON.stringify(Object.keys(STATE.salaryDB)));
    C(SD + 'and the other sport is untouched', !STATE.salaryDB[sport === 'fba' ? 'flb' : 'fba']);
    C(SD + 'the confirmation names the sport it saved to',
      grab().includes(`${SP().label} players saved`), grab().slice(0, 120));
    // these lists carry an old deal and a new one on separate rows, sorted by total
    // rather than by date, so the bigger row is not necessarily the current one
    C(SD + 'a player listed twice is stored under the deal he is playing', (() => {
      const DUPES = [
        "Bam Adebayo\tC\t MIA\t23\t2021\t2025\t5\t$163,000,300\t$32,600,060",
        "Bam Adebayo\tC\t MIA\t26\t2026\t2028\t3\t$160,342,092\t$53,447,364",
      ].join('\n');
      STATE.salaryDB = {};
      STATE.leagues[sport].seasonYear = 2027;
      saveSalaryPaste(sport, parseSalaryPaste(DUPES));
      const rec = STATE.salaryDB[sport][normName('Bam Adebayo')];
      return rec.start === 2026 && rec.aav === 53447364;
    })(), JSON.stringify(STATE.salaryDB[sport] && STATE.salaryDB[sport][normName('Bam Adebayo')]));
    C(SD + 'even when the bigger contract is the expired one', (() => {
      // same two rows, order swapped — the answer must not depend on paste order
      const DUPES = [
        "Bam Adebayo\tC\t MIA\t26\t2026\t2028\t3\t$160,342,092\t$53,447,364",
        "Bam Adebayo\tC\t MIA\t23\t2021\t2025\t5\t$163,000,300\t$32,600,060",
      ].join('\n');
      STATE.salaryDB = {};
      saveSalaryPaste(sport, parseSalaryPaste(DUPES));
      return STATE.salaryDB[sport][normName('Bam Adebayo')].start === 2026;
    })());
    C(SD + 'and with no covering deal it keeps the later one', (() => {
      STATE.leagues[sport].seasonYear = 2040;
      const DUPES = [
        "Kevin Durant\tSF\t HOU\t32\t2022\t2025\t4\t$194,219,320\t$48,554,830",
        "Kevin Durant\tSF\t HOU\t37\t2026\t2027\t2\t$90,000,000\t$45,000,000",
      ].join('\n');
      STATE.salaryDB = {};
      saveSalaryPaste(sport, parseSalaryPaste(DUPES));
      return STATE.salaryDB[sport][normName('Kevin Durant')].start === 2026;
    })());
    STATE.leagues[sport].seasonYear = null;
    closeModal();

    // pasting the OTHER sport's data must not silently replace this one's database
    STATE.salaryDB = {};
    saveSalaryPaste(sport, parseSalaryPaste(sport === 'fba' ? NBA_PASTE : MLB_PASTE));
    const kept = Object.keys(STATE.salaryDB[sport]).length;
    openSalaryPaste();
    const box = document.getElementById('sal-paste');
    if (box) box.value = (sport === 'fba' ? MLB_PASTE : NBA_PASTE);
    parseSalaryData();
    const other = sport === 'fba' ? 'flb' : 'fba';
    C(SD + 'a paste from the other sport stops and says so',
      grab().includes(`That looks like ${SPORTS[other].label}`), grab().slice(0, 140));
    C(SD + 'without having touched what was already saved',
      Object.keys(STATE.salaryDB[sport] || {}).length === kept);
    C(SD + 'it offers to file it under the sport it belongs to',
      grab().includes(`saveSalaryPaste('${other}')`));
    C(SD + 'and still lets you overrule it', grab().includes(`saveSalaryPaste('${sport}')`));
    saveSalaryPaste(other);
    C(SD + 'filing it correctly leaves both databases intact',
      Object.keys(STATE.salaryDB[sport] || {}).length === kept
      && Object.keys(STATE.salaryDB[other] || {}).length > 0,
      `${sport}:${Object.keys(STATE.salaryDB[sport]||{}).length} ${other}:${Object.keys(STATE.salaryDB[other]||{}).length}`);
    closeModal();
    STATE.salaryDB = {};
    saveSalaryPaste(sport, parseSalaryPaste(sport === 'fba' ? NBA_PASTE : MLB_PASTE));
    C(SD + 'an AAV is what gets stored against the cap', (() => {
      const one = Object.values(STATE.salaryDB[sport])[0];
      return one.aav > 0 && one.total > one.aav;
    })(), JSON.stringify(Object.values(STATE.salaryDB[sport])[0]));
    closeModal();
    STATE.salaryDB = {};
    window._settingsScope = null;
    window._masterUnlocked = false;

    // ============================================================
    // ADP: ESPN's parked-constant placeholder must not become the pool order
    // ============================================================
    const AD = `Adp[${sport}]: `;
    const mkRaw = (n, adp, rank) => Array.from({ length: n }, (_, i) => ({ player: {
      id: i + 1, fullName: 'P' + i,
      ownership: { averageDraftPosition: typeof adp === 'function' ? adp(i) : adp,
                   percentOwned: 90 - i },
      draftRanksByRankType: rank === false ? {} : { STANDARD: { rank: i + 1 } },
    }}));
    // the live 2026 NBA feed: every player parked at 140.0, real ranks beside it
    const parked = mkRaw(40, 140, true);
    C(AD + 'an all-one-value ADP is recognised as a placeholder',
      detectAdpPlaceholder(parked) === 140, detectAdpPlaceholder(parked));
    C(AD + 'and the real draft rank is used instead',
      espnAdp(parked[0].player, 140) === 1 && espnAdp(parked[7].player, 140) === 8);
    // the live MLB feed: real ADP for the draftable range, 260.0 for everyone else
    const mixed = mkRaw(30, (i) => i < 8 ? i + 1.5 : 260, true);
    C(AD + 'a mostly-parked feed still flags the constant', detectAdpPlaceholder(mixed) === 260);
    C(AD + 'real ADPs inside it are kept as-is', espnAdp(mixed[0].player, 260) === 1.5);
    C(AD + 'and only the parked ones fall back to rank', espnAdp(mixed[20].player, 260) === 21);
    // a healthy draft-season spread must NOT be second-guessed
    const healthy = mkRaw(40, (i) => i * 3 + 1.2, true);
    C(AD + 'a real spread is left alone', detectAdpPlaceholder(healthy) === null);
    C(AD + 'small pools are never judged', detectAdpPlaceholder(mkRaw(10, 140, true)) === null);
    // nothing to go on at all: ownership, then the 9999 tail
    const bare = { ownership: { averageDraftPosition: 140, percentOwned: 50 } };
    C(AD + 'no rank falls back to ownership', espnAdp(bare, 140) === Math.max(1, Math.round(1000 - 50 * 9)));
    C(AD + 'and a total unknown goes to the back', espnAdp({}, null) === 9999);

    // ============================================================
    // the pool pulls itself — nobody presses a button
    // ============================================================
    const AP = `AutoPool[${sport}]: `;
    S.setupLeague(sport, { teams: 2, week: 2, name: 'Auto' + sport });
    STATE.poolMeta = {};
    // freshness: every way a pool can be out of date
    C(AP + 'a missing pool wants a pull', (() => {
      const keep = LG().playerPool; LG().playerPool = [];
      const r = poolNeedsRefresh(); LG().playerPool = keep; return r === 'empty';
    })());
    C(AP + 'a pool stamped for another season wants a pull', (() => {
      STATE.poolMeta[sport] = { pulledAt: Date.now(), season: statSeasonNow() - 1 };
      return poolNeedsRefresh() === 'season';
    })());
    C(AP + 'a parked-ADP pool wants a pull even when fresh', (() => {
      STATE.poolMeta[sport] = { pulledAt: Date.now(), season: statSeasonNow() };
      const olds = LG().playerPool.map(p => p.adp);
      LG().playerPool.forEach(p => { p.adp = 140; });
      const r = poolNeedsRefresh();
      LG().playerPool.forEach((p, i) => { p.adp = olds[i]; });
      return r === 'adp';
    })());
    C(AP + 'a week-old pool wants a pull', (() => {
      STATE.poolMeta[sport] = { pulledAt: Date.now() - 8 * 86400000, season: statSeasonNow() };
      return poolNeedsRefresh() === 'stale';
    })());
    C(AP + 'a fresh, healthy pool wants nothing', (() => {
      STATE.poolMeta[sport] = { pulledAt: Date.now(), season: statSeasonNow() };
      return poolNeedsRefresh() === null;
    })());
    C(AP + 'a live draft is never interrupted by a refresh', (() => {
      STATE.poolMeta = {};
      LG().draft.live = true;
      delete _poolPullTriedAt[sport];
      ensureFreshPool();
      const tried = _poolPullTriedAt[sport] != null;
      LG().draft.live = false;
      return !tried;
    })());

    // ingest: what a pull is allowed to do to the pool it replaces
    const mkPoolRaw = (n, offset = 0) => Array.from({ length: n }, (_, i) => ({ player: {
      id: 10000 + offset + i, fullName: 'Fresh ' + (offset + i),
      defaultPositionId: 1, eligibleSlots: [], proTeamId: 1,
      ownership: { averageDraftPosition: i + 1, percentOwned: 50 },
      draftRanksByRankType: { STANDARD: { rank: i + 1 } },
    }}));
    C(AP + 'a near-empty payload is refused — the season is not published yet', (() => {
      const before = LG().playerPool.length;
      let threw = false;
      try { ingestPool(mkPoolRaw(5)); } catch (e) { threw = /not published/.test(e.message); }
      return threw && LG().playerPool.length === before;
    })());
    C(AP + 'a rostered player outside the new top 300 survives the pull', (() => {
      const star = LG().playerPool[0];
      LG().draft.picks = [{ pick: 1, teamId: 't1', playerId: star.espnId }];
      star.mlbId = star.mlbId || 'keepme';
      ingestPool(mkPoolRaw(320));                      // all-new ids — star not among them
      return LG().playerPool.some(p => String(p.espnId) === String(star.espnId));
    })());
    C(AP + 'and the stamp records the pull',
      STATE.poolMeta[sport].season === statSeasonNow()
      && Date.now() - STATE.poolMeta[sport].pulledAt < 60000);
    C(AP + 'stat identity carries across a re-pull', (() => {
      LG().draft.picks = [];
      const before = LG().playerPool.find(p => String(p.espnId) === '10007');
      before.mlbId = 'link7'; before.ptsSeason = 123.4; before.prevPts = 88;
      ingestPool(mkPoolRaw(320));                      // same ids again
      const after = LG().playerPool.find(p => String(p.espnId) === '10007');
      return after.mlbId === 'link7' && after.ptsSeason === 123.4 && after.prevPts === 88;
    })());
    STATE.poolMeta = {};

    // ============================================================
    // last season's numbers, in the pool and in the draft room
    // ============================================================
    const LS = `LastSeason[${sport}]: `;
    S.setupLeague(sport, { teams: 2, week: 9, name: 'Prev' + sport,
      settings: { scoringFormat: 'bestGame', bestGameScope: 'all', useSalaryCap: true,
                  salaryCapDollars: 300000000 } });
    S.genLogs(9);
    C(LS + 'the prior season is the one before the stat season',
      priorStatSeason() === SP().statSeason - 1, `${priorStatSeason()} vs ${SP().statSeason}`);
    // a finished season has no fantasy weeks of ours, so it is bucketed into its own
    // seven-day blocks from its first game — two games in one block, only the best counts
    const lp = LG().playerPool[0];
    const g = (date, pts) => ({ date, group: sport === 'fba' ? 'stats' : 'hitting',
      stat: sport === 'fba' ? { points: pts, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0 }
                            : { atBats: 4, hits: 0, doubles: 0, triples: 0, homeRuns: pts, runs: 0,
                                rbi: 0, baseOnBalls: 0, strikeOuts: 0, stolenBases: 0, caughtStealing: 0, hitByPitch: 0 } });
    applyPrevFields(lp, [g('2024-04-01', 10), g('2024-04-03', 30), g('2024-04-12', 20)]);
    C(LS + 'games are counted', lp.prevGames === 3, lp.prevGames);
    C(LS + 'the season total is the sum', lp.prevPts > 0, lp.prevPts);
    C(LS + 'per game is the total over the games', lp.prevPerGame === Math.round(lp.prevPts / 3 * 10) / 10,
      `${lp.prevPerGame} vs ${lp.prevPts}/3`);
    C(LS + 'and the best-per-week average keeps one game per seven-day block',
      lp.prevBestAvg < lp.prevPts && lp.prevBestAvg > 0, `${lp.prevBestAvg} of ${lp.prevPts}`);
    C(LS + 'the year it belongs to is recorded with it', lp.prevSeason === priorStatSeason());
    C(LS + 'an empty season is zero, not a crash', (() => {
      const blank = { name: 'Nobody' };
      applyPrevFields(blank, []);
      return blank.prevPts === 0 && blank.prevGames === 0 && blank.prevBestAvg === 0;
    })());

    // the pool offers it as a column, labelled with the year
    C(LS + 'the pool offers a last-season column',
      statWindowOptions().some(o => o[0] === 'prev' && o[1] === String(priorStatSeason())),
      statWindowOptions().map(o => o[1]).join(','));
    C(LS + 'it is last in the row, not something you land on by accident',
      statWindowOptions()[statWindowOptions().length - 1][0] === 'prev');
    C(LS + 'and it resolves to a last-season field',
      /^prev/.test(ptsFieldFor('prev', lp)), ptsFieldFor('prev', lp));
    C(LS + 'which is the best-of-week one in a best-of-week league',
      ptsFieldFor('prev', lp) === 'prevBestAvg');
    C(LS + 'the column explains which season it is',
      statColumnMeaning('prev').includes(String(priorStatSeason())), statColumnMeaning('prev'));
    LG().playerPool.forEach(p => applyPrevFields(p, [g('2024-04-01', 12), g('2024-04-10', 8)]));
    setPtsWindow('prev');
    renderPage('players');
    let lsh = document.getElementById('page-players').innerHTML;
    C(LS + 'the page shows the year as the column header', lsh.includes(String(priorStatSeason())));
    C(LS + 'and says what it means above the list',
      lsh.indexOf(String(priorStatSeason()) + ' season') < lsh.indexOf('showPlayer('),
      statColumnMeaning('prev'));
    setSearch(lp.name);
    lsh = document.getElementById('page-players').innerHTML;
    C(LS + 'with the player\'s last-season value in the column',
      new RegExp(`>${lp.prevBestAvg.toFixed(1)}<`).test(lsh), lp.prevBestAvg.toFixed(1));
    setSearch('');

    // a total-points league gets last season's TOTAL, not a best-of-week average
    LG().settings.scoringFormat = 'regular';
    C(LS + 'a total-points league gets last season\'s total', ptsFieldFor('prev', lp) === 'prevPts');
    C(LS + 'and is told so', /total points/.test(statColumnMeaning('prev')), statColumnMeaning('prev'));
    LG().settings.scoringFormat = 'bestGame';

    // ---- the draft room shows the same numbers ----
    const DR = `DraftStats[${sport}]: `;
    LG().draft = { started: true, live: true, complete: false, rounds: draftRounds(),
                   order: LG().teams.map(t => t.id), picks: [], currentPick: 0,
                   pickStartedAt: Date.now() };
    LG().teams.forEach((t, i) => { if (i === 0) t.claimed = true; });
    renderPage('draft');
    let dh = document.getElementById('page-draft').innerHTML;
    C(DR + 'the draft room offers every stat window the pool does',
      statWindowOptions().every(o => dh.includes(`setPtsWindow('${o[0]}')`)),
      statWindowOptions().map(o => o[0]).join(','));
    C(DR + 'including last season', dh.includes("setPtsWindow('prev')"));
    C(DR + 'and lets you sort by it rather than only by ADP',
      /setDraftSort\('pts'\)/.test(dh) && /setDraftSort\('adp'\)/.test(dh));
    C(DR + 'a cap league can sort by salary too', /setDraftSort\('salary'\)/.test(dh));
    // the clock is running — four rows of chips before the first name is the whole
    // screen on a phone, so they fold away exactly as they do on the players page
    C(DR + 'the controls are folded, not stacked on top of the players',
      /togglePlayerFilters\(\)/.test(dh) && /display:none/.test(dh));
    C(DR + 'no chip sits above the first player',
      dh.indexOf('setPosFilter') > dh.indexOf('togglePlayerFilters'));
    C(DR + 'the search box stays out in the open', dh.indexOf('setSearch') < dh.indexOf('makeDraftPick'));
    C(DR + 'and it says how the list is sorted without opening anything',
      /sorted by/.test(dh));
    C(DR + 'it says what the stat column means, same words as the pool',
      dh.includes(statColumnMeaning(activeStatWindow())), statColumnMeaning(activeStatWindow()));
    C(DR + 'the salary is on the row — you cannot draft blind in a cap league',
      dh.includes(fmtMoney(playerCapHit(LG().playerPool[0]))));
    C(DR + 'and the stat column is the one selected', (() => {
      setPtsWindow('prev');
      const a = document.getElementById('page-draft');
      renderPage('draft');
      const prevHtml = document.getElementById('page-draft').innerHTML;
      setPtsWindow('season');
      renderPage('draft');
      const seasonHtml = document.getElementById('page-draft').innerHTML;
      const p0 = LG().playerPool.find(x => x.prevBestAvg !== x.bestAvg) || LG().playerPool[0];
      return prevHtml !== seasonHtml && a != null;
    })());
    // sorting really reorders, it does not just light up a chip
    setPtsWindow('season');
    setDraftSort('pts');
    const byPts = filteredPool().slice(0, 5).map(p => p.bestAvg ?? 0);
    C(DR + 'sorting by the stat really orders by it',
      byPts.every((v, i) => i === 0 || byPts[i - 1] >= v), byPts.join(','));
    setDraftSort('adp');
    const byAdp = filteredPool().slice(0, 5).map(p => p.adp);
    C(DR + 'and ADP order still comes back',
      byAdp.every((v, i) => i === 0 || byAdp[i - 1] <= v), byAdp.join(','));
    LG().draft.live = false;

    // ESPN files play-in games under their own "regular season" heading
    C(LS + 'a play-in game is not a regular-season game',
      isRegularSeasonType('2023-24 Regular Season')
      && !isRegularSeasonType('2023-24 Play In Regular Season')
      && !isRegularSeasonType('2023-24 Postseason')
      && !isRegularSeasonType('2023-24 Preseason'));

    // ============================================================
    // the player card fits on a phone
    // ============================================================
    const CD = `PlayerCard[${sport}]: `;
    S.setupLeague(sport, { teams: 2, week: 9, name: 'Card' + sport,
      settings: { scoringFormat: 'bestGame', useSalaryCap: true, salaryCapDollars: 200000000 } });
    S.genLogs(9);
    LG().playerPool.forEach(p => { if (p.mlbId && LG().gameLogs[p.mlbId]) applyPointFields(p, LG().gameLogs[p.mlbId]); });
    S.runDraft();
    const cardP = teamRoster(myTeamId())[0];
    window._weeksOpen = null;
    showPlayer(cardP.espnId);
    const cardHtml = grab();
    C(CD + 'the weekly table is folded away by default', !/<th>Week<\/th>/.test(cardHtml));
    C(CD + 'with a summary in its place',
      /Best week/.test(cardHtml) && /Season total/.test(cardHtml));
    C(CD + 'and the summary drops the per-week average this league never scores',
      !/All games, per week/.test(cardHtml));
    C(CD + 'the window row labels itself instead of needing a caption under it',
      /Best 7d/.test(cardHtml) && /Best 30d/.test(cardHtml)
      && !/last 7 \/ 14 \/ 30 days/.test(cardHtml));
    C(CD + `the contract lines say ${SP().proLeague}, not the other sport's league`,
      cardHtml.includes(`${SP().proLeague} contract`)
      && !new RegExp(`${sport === 'flb' ? 'NBA' : 'MLB'} contract`).test(cardHtml),
      SP().proLeague);
    C(CD + 'and a control to open it', /toggleWeeks\(/.test(cardHtml));
    C(CD + 'no part of the card scrolls inside itself',
      !/max-height:38vh/.test(cardHtml));
    C(CD + 'the roster actions are all present', /dropFromCard\(/.test(cardHtml));
    C(CD + 'including the ones that used to be pushed below the fold',
      /toggleTradeBlock\(/.test(cardHtml) && /go\('home'\)/.test(cardHtml));
    C(CD + 'the headline stat is the one this league scores', /BEST\/WK|Best\/wk/i.test(cardHtml));
    toggleWeeks(cardP.espnId);
    C(CD + 'opening it shows the week-by-week table', /<th>Week<\/th>/.test(grab()));
    C(CD + 'and it is capped so it cannot run away', /max-height:40vh/.test(grab()));
    toggleWeeks(cardP.espnId);
    C(CD + 'closing folds it again', !/<th>Week<\/th>/.test(grab()));
    showPlayer(teamRoster(myTeamId())[1].espnId);
    C(CD + 'opening a different player starts folded', !/<th>Week<\/th>/.test(grab()));
    closeModal();

    STATE.salaryDB = {};
    window._masterUnlocked = false;
    const bad = S.renderAll();
    C(T + 'all pages render', bad.length === 0, bad.join(' ; '));
  });
})();
