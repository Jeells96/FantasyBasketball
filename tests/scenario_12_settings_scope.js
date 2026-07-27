(() => {
  const S = window.__sim, C = window.__check;
  const T = 'SettingsScope: ';
  const lg = S.setupLeague('flb', { teams: 4, week: 2, name: 'ScopeLeague' });
  STATE.approvals = {
    '12345': { leagueName: 'ScopeLeague', leagueDocId: STATE.activeLeagueDoc, approved: true, sport: 'flb' },
  };
  STATE._loaded = true;

  const headings = () => { renderPage('settings');
    return [...document.querySelectorAll('#page-settings .h2')].map(e => e.textContent.trim()); };
  const html = () => { renderPage('settings'); return document.getElementById('page-settings').innerHTML; };
  const MASTER = ['Player pool', 'Commissioner approvals', 'Player eligibility', '⚡ Quick test'];

  // ---- inside a league: only THAT league's settings ----
  window._settingsScope = 'league';
  window._masterUnlocked = false;
  let h = headings();
  C(T + 'in-league shows the league settings card', h.some(x => /Commissioner settings/.test(x)), h.join(' | '));
  C(T + 'in-league hides site-wide admin cards', !MASTER.some(m => h.includes(m)), h.join(' | '));
  C(T + 'in-league cannot switch sport (that would leave the league)',
    !/onclick="switchSport\(/.test(html()));
  C(T + 'in-league names the league it is configuring', /ScopeLeague/.test(html()));

  // ---- master unlocked, still inside a league: STILL league-scoped ----
  // (being bound to a league is not the same as viewing site-wide admin)
  window._masterUnlocked = true;
  h = headings();
  C(T + 'unlocking master does NOT leak site-wide cards into a league',
    !MASTER.some(m => h.includes(m)), h.join(' | '));
  C(T + 'but offers an explicit door to site-wide admin',
    /onclick="openMasterScope\(\)"/.test(html()));

  // ---- stepping through that door ----
  openMasterScope();
  h = headings();
  C(T + 'master scope reveals the site-wide cards', MASTER.every(m => h.includes(m)), h.join(' | '));
  C(T + 'master scope restores the sport switcher', /onclick="switchSport\(/.test(html()));

  // ---- the door is PIN-gated: it must not work while master is locked ----
  window._settingsScope = 'league';
  window._masterUnlocked = false;
  openMasterScope();
  C(T + 'site-wide door refuses when the master PIN is locked',
    window._settingsScope === 'league' && !MASTER.some(m => headings().includes(m)));

  // ---- a bound device must still reach site-wide admin from the hub ----
  // This is why the scope is an explicit flag rather than inferred from the binding:
  // goToHub() does not clear activeLeagueDoc.
  window._masterUnlocked = true;
  window._settingsScope = 'master';
  C(T + 'bound device can still open site-wide admin from the hub',
    MASTER.every(m => headings().includes(m)) && !!STATE.activeLeagueDoc);

  // ---- leaving master scope returns you to league settings ----
  lockMaster();
  C(T + 'locking master returns to league scope', window._settingsScope === 'league');
  window._masterUnlocked = false;
  C(T + 'and site-wide cards are gone again', !MASTER.some(m => headings().includes(m)));

  // ---- NBA copy must not claim stats are missing (they are wired up now) ----
  const N = 'NBAcopy: ';
  const nba = S.setupLeague('fba', { teams: 4, week: 2, name: 'Hoops' });
  window._settingsScope = 'master'; window._masterUnlocked = true;
  const nbaHtml = html();
  C(N + 'settings no longer claims NBA scoring is unwired',
    !/isn't wired up yet|don't populate yet/.test(nbaHtml));
  C(N + 'settings explains ESPN IDs need no mapping step',
    /no separate ID-mapping step/.test(nbaHtml), '');
  renderPage('players');
  const playersHtml = document.getElementById('page-players').innerHTML;
  C(N + 'players page no longer says points stay at 0 for NBA',
    !/points stay at 0/.test(playersHtml));
  C(N + 'NBA counts as having live stats', FEAT().gameLogs === true);
  window._settingsScope = 'league'; window._masterUnlocked = false;

  const bad = S.renderAll();
  C(T + 'all pages render', bad.length === 0, bad.join(' ; '));
})();
