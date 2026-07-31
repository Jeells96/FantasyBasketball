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

    STATE.salaryDB = {};
    window._masterUnlocked = false;
    const bad = S.renderAll();
    C(T + 'all pages render', bad.length === 0, bad.join(' ; '));
  });
})();
