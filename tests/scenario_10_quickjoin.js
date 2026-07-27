(() => {
  const S = window.__sim, C = window.__check;
  const T = 'QuickJoin: ';
  S.setupLeague('flb', { teams: 4, week: 2, name: 'HomeLeague' });

  STATE.approvals = {
    '12345': { leagueName: 'Best Game League', leagueDocId: 'league_12345', approved: true, sport: 'flb' },
    '67890': { leagueName: 'Jarens Dynasty',   leagueDocId: 'league_67890', approved: true, sport: 'flb' },
    '11111': { leagueName: 'Hoops Night',      leagueDocId: 'league_11111', approved: true, sport: 'fba' },
    '22222': { leagueName: 'Never Joined',     leagueDocId: 'league_22222', approved: true, sport: 'flb' },
    '99999': { leagueName: 'Paused League',    leagueDocId: 'league_99999', approved: false, sport: 'flb' },
  };
  STATE.memberByLeague = {
    'league_12345': 'm1',
    'league_67890': 'm2',
    'league_11111': 'm3',
    'league_99999': 'm4',
    // note: league_22222 intentionally absent — never joined
  };
  STATE.activeLeagueDoc = 'league_12345';
  STATE._loaded = true;

  // ---- joinedLeaguesList: the core data builder ----
  const list = joinedLeaguesList();
  const names = list.map(x => x.leagueName).sort();
  C(T + 'lists only leagues actually joined', names.length === 4, names.join(','));
  C(T + 'excludes a league that exists but was never joined', !names.includes('Never Joined'));
  C(T + 'includes leagues from every sport', list.some(x => x.sport === 'fba'));
  C(T + 'includes a paused league (still shown, join flow handles the pause)',
    list.some(x => x.leagueName === 'Paused League' && x.approved === false));
  C(T + 'marks the current league', list.find(x => x.leagueName === 'Best Game League')?.leagueDocId === STATE.activeLeagueDoc);

  // ---- dedup: two approval keys aliasing the SAME data doc (a migrated league) ----
  STATE.approvals['77777'] = { leagueName: 'Jarens Dynasty', leagueDocId: 'league_67890', approved: true, sport: 'flb', migratedFrom: '67890' };
  const list2 = joinedLeaguesList();
  const dynastyRows = list2.filter(x => x.leagueDocId === 'league_67890');
  C(T + 'aliased league doc appears only once', dynastyRows.length === 1, dynastyRows.length);
  C(T + 'dedup prefers the numeric id as the join target', /^\d{5}$/.test(dynastyRows[0].id), dynastyRows[0].id);
  delete STATE.approvals['77777'];

  // ---- empty state: a fresh device with no joined leagues ----
  const savedMbl = STATE.memberByLeague;
  STATE.memberByLeague = {};
  C(T + 'empty when nothing joined', joinedLeaguesList().length === 0);
  const emptyHtml = (renderGateLanding(), $('gate-inner').innerHTML);
  C(T + 'landing page has no "Your leagues" section when nothing joined', !emptyHtml.includes('Your leagues'));
  C(T + 'landing page still offers manual entry (unchanged first-time flow)', emptyHtml.includes('gate-ln'));
  STATE.memberByLeague = savedMbl;

  // ---- rendering: the landing page itself ----
  renderGateLanding();
  const html = $('gate-inner').innerHTML;
  C(T + 'landing page shows the "Your leagues" section', html.includes('Your leagues'));
  C(T + 'each joined league name appears', ['Best Game League','Jarens Dynasty','Hoops Night','Paused League'].every(n => html.includes(n)),
    html.slice(0, 200));
  C(T + 'sport icon/label shown per league', html.includes(SPORTS.fba.label));
  C(T + 'paused league flagged visually', /Paused League[\s\S]{0,200}access paused/.test(html));
  // search from the "Your leagues" list, not the tagline (which repeats the league name)
  const listStart = html.indexOf('Your leagues');
  const rowFor = (name) => html.slice(html.indexOf(name, listStart), html.indexOf(name, listStart) + 500);
  // REGRESSION: the landing gate is the front door — you are NOT inside any league
  // while it is showing, so EVERY listed league must be enterable. A previous build
  // rendered the still-bound league as a disabled "Current" chip, which left a user
  // who was bound to a league with no way back into it.
  C(T + 'every joined league has a live Enter button, including the bound one',
    list.every(j => new RegExp(`onclick="joinLeagueById\\('${j.id}'\\)"`).test(html)),
    html.match(/joinLeagueById\('\d+'\)/g)?.join(',') || 'none');
  C(T + 'no league row is rendered disabled', !/disabled/.test(html));
  C(T + 'the bound league is enterable rather than a dead "Current" chip',
    /onclick="joinLeagueById\('12345'\)"/.test(rowFor('Best Game League'))
      && !/disabled/.test(rowFor('Best Game League')), rowFor('Best Game League'));
  C(T + 'buttons cannot be squeezed away by a long league name',
    (html.match(/flex:none/g) || []).length === list.length,
    (html.match(/flex:none/g) || []).length + ' of ' + list.length);
  C(T + 'the bound league is still marked so you know where you left off',
    /last opened/.test(rowFor('Best Game League')));

  // ---- quick-join actually switches leagues (and sport) ----
  const fbaLg = S.setupLeague('fba', { teams: 4, week: 1, name: 'Hoops Night' });
  STATE.approvals['11111'].leagueDocId = 'league_11111';
  STATE.activeLeagueDoc = 'league_12345';
  STATE.sport = 'flb';
  const ok = joinLeagueById('11111', { silent: true });
  C(T + 'quick-join succeeds', ok === true);
  C(T + 'quick-join adopts the target sport', STATE.sport === 'fba', STATE.sport);
  C(T + 'quick-join rebinds activeLeagueDoc', STATE.activeLeagueDoc === 'league_11111', STATE.activeLeagueDoc);
  C(T + 'quick-join restores this device\'s prior identity in that league',
    STATE.memberId === 'm3', String(STATE.memberId));

  // ---- refreshGateIfLanding: only touches the gate when landing is actually showing ----
  STATE.sport = 'flb'; STATE.activeLeagueDoc = 'league_12345';
  $('gate-inner').innerHTML = '<div id="sentinel">untouched</div>';
  window._gateStep = 'league';               // a different gate step is showing
  refreshGateIfLanding();
  C(T + 'refresh is a no-op when a different gate step is active',
    document.getElementById('sentinel') !== null);
  window._gateStep = 'landing';
  $('gate').style.display = 'none';           // gate not actually visible
  refreshGateIfLanding();
  C(T + 'refresh is a no-op when the gate is hidden',
    document.getElementById('sentinel') !== null);
  $('gate').style.display = 'flex';
  refreshGateIfLanding();
  C(T + 'refresh re-renders when landing IS showing',
    document.getElementById('sentinel') === null && $('gate-inner').innerHTML.includes('Your leagues'));
  $('gate').style.display = 'none';
  window._gateStep = null;

  const bad = S.renderAll();
  C(T + 'all pages still render', bad.length === 0, bad.join(' ; '));
})();
