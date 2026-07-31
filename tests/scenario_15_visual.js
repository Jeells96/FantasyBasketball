/* Things you can only catch by looking at the rendered page: a column that comes
   out blank, a control that pushes content off the first screen, a notification
   that buries the app. */
(() => {
  const S = window.__sim, C = window.__check;

  // ============================================================
  // standings must actually name the teams
  // ============================================================
  const N = 'Standings: ';
  const lg = S.setupLeague('flb', { teams: 6, week: 3, name: 'NameCheck' });
  S.runDraft();
  renderPage('standings');
  const html = document.getElementById('page-standings').innerHTML;
  // computeRecords() calls the tie count `t`, and the row object also held the team
  // as `t` — the spread overwrote the team with a number, so every name rendered
  // empty and every row linked to team "undefined".
  LG().teams.forEach(t => {
    C(N + `names ${t.name}`, html.includes(t.name), '');
  });
  C(N + 'rows link to a real team id, not "undefined"',
    !/setViewingTeam\('undefined'\)/.test(html));
  C(N + 'every row links somewhere real',
    LG().teams.every(t => html.includes(`setViewingTeam('${t.id}')`)));
  C(N + 'owners are shown too', html.includes('Owner 1'));

  // ============================================================
  // toasts must not bury the app
  // ============================================================
  const T = 'Toast: ';
  const wrap = document.getElementById('toasts');
  wrap.innerHTML = '';
  for (let i = 0; i < 20; i++) toast('Saved locally', 'ok');
  C(T + 'twenty identical saves collapse into one line', wrap.children.length === 1,
    wrap.children.length);
  C(T + 'and it counts them', /×20/.test(wrap.textContent), wrap.textContent);
  wrap.innerHTML = '';
  for (let i = 0; i < 12; i++) toast('Message ' + i, 'ok');
  C(T + 'a burst of different messages is capped, not stacked',
    wrap.children.length <= 3, wrap.children.length);
  C(T + 'and it is the newest that survive', /Message 11/.test(wrap.textContent),
    wrap.textContent);
  wrap.innerHTML = '';

  // ============================================================
  // the player list is not buried under its own filters
  // ============================================================
  const P = 'PlayerFilters: ';
  S.setupLeague('flb', { teams: 6, week: 3, name: 'FilterCheck',
    settings: { useSalaryCap: true, salaryCapDollars: 250000000 } });
  if (playerFiltersOpen()) togglePlayerFilters();
  resetPlayerFilters();
  renderPage('players');
  const collapsed = document.getElementById('page-players').innerHTML;
  C(P + 'filters start folded away', /Filters/.test(collapsed) && /display:none/.test(collapsed));
  C(P + 'the player table is still rendered', /<tbody>/.test(collapsed) && /Mlb a Player/.test(collapsed));
  const posChip = collapsed.indexOf('setPosFilter');
  const firstRow = collapsed.indexOf('showPlayer');
  C(P + 'no filter control sits above the first player',
    posChip === -1 || posChip > collapsed.indexOf('togglePlayerFilters'), '');
  C(P + 'the search box stays out in the open — it is the one people use',
    /Search players/.test(collapsed) && collapsed.indexOf('Search players') < firstRow);

  // The page defaults to available-only, so nothing is OFF-default at rest...
  C(P + 'nothing is off-default to begin with', activeFilterCount() === 0);
  // ...but the default still hides rostered players, and the summary must say so —
  // otherwise you search for a rostered player, find nothing, and never learn why.
  C(P + 'the default availability is still announced',
    activeFilters().includes('available only'), activeFilterSummary());
  renderPage('players');
  C(P + 'on the page itself', /Showing available only/.test(
    document.getElementById('page-players').innerHTML));
  setPosFilter('SP');
  C(P + 'a real filter change is counted', activeFilterCount() === 1, activeFilterCount());
  C(P + 'and summarised in plain language',
    /SP/.test(activeFilterSummary()) && /available/.test(activeFilterSummary()), activeFilterSummary());
  renderPage('players');
  const filtered = document.getElementById('page-players').innerHTML;
  C(P + 'a folded filter still announces itself, so it cannot hide players silently',
    /Filters \(1\)/.test(filtered) && /SP/.test(filtered));
  setAvail('all');
  C(P + 'switching to all players counts as off-default', activeFilterCount() === 2);
  C(P + 'and stops claiming to hide anything', !activeFilters().includes('available only'));
  setAvail('avail');
  C(P + 'and offers a one-tap reset', /resetPlayerFilters\(\)/.test(filtered));
  resetPlayerFilters();
  C(P + 'reset clears everything', activeFilterCount() === 0);
  togglePlayerFilters();
  C(P + 'the toggle opens them', playerFiltersOpen() === true);
  renderPage('players');
  C(P + 'and then the controls are actually visible',
    !/style="display:none"/.test(document.getElementById('page-players').innerHTML));
  togglePlayerFilters();

  // ============================================================
  // a cap league leads with the number that matters
  // ============================================================
  const M = 'MyTeam: ';
  S.setupLeague('flb', { teams: 6, week: 3, name: 'PayrollCheck',
    settings: { useSalaryCap: true, salaryCapDollars: 250000000 } });
  S.runDraft();
  STATE.viewingTeamId = null;
  renderPage('home');
  const myTeam = document.getElementById('page-home').innerHTML;
  C(M + 'payroll is on the page before you open any tab', /Payroll/.test(myTeam));
  C(M + 'against the cap', new RegExp(fmtMoney(leagueCap()).replace(/\$/g, '\\$')).test(myTeam),
    fmtMoney(leagueCap()));
  C(M + 'and it says how much room is left', /free|over/.test(myTeam));
  S.setupLeague('flb', { teams: 6, week: 3, name: 'NoCapCheck', settings: { useSalaryCap: false } });
  S.runDraft();
  renderPage('home');
  C(M + 'a league without salaries is not shown a payroll line',
    !/Payroll/.test(document.getElementById('page-home').innerHTML));

  const bad = S.renderAll();
  C('Visual: all pages render', bad.length === 0, bad.join(' ; '));
})();
