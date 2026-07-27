(() => {
  const S = window.__sim, C = window.__check;
  const T = 'LeagueURL: ';
  S.setupLeague('flb', { teams: 4, week: 2, name: 'URLs' });

  STATE.approvals = {
    '12345': { leagueName: 'Best Game League', leagueDocId: 'league_12345', approved: true, sport: 'flb' },
    '67890': { leagueName: "Jaren's Dynasty!", leagueDocId: 'league_67890', approved: true, sport: 'flb' },
    '11111': { leagueName: 'Hoops Night',     leagueDocId: 'league_11111', approved: true, sport: 'fba' },
  };
  STATE._loaded = true;

  // ---- slugs come from the league NAME ----
  C(T + 'slug from name', leagueSlug('12345') === 'best-game-league', leagueSlug('12345'));
  C(T + 'punctuation/apostrophes stripped', leagueSlug('67890') === 'jarens-dynasty', leagueSlug('67890'));
  C(T + 'second sport slug', leagueSlug('11111') === 'hoops-night', leagueSlug('11111'));

  // ---- hash -> league id ----
  C(T + 'name slug resolves', leagueIdFromHash('best-game-league') === '12345');
  C(T + 'apostrophe slug resolves', leagueIdFromHash('jarens-dynasty') === '67890');
  C(T + 'legacy #league=<id> still works', leagueIdFromHash('league=12345') === '12345');
  C(T + 'bare 5-digit id works', leagueIdFromHash('12345') === '12345');
  C(T + 'unknown slug returns null', leagueIdFromHash('no-such-league') === null);
  C(T + 'empty hash returns null', leagueIdFromHash('') === null);

  // ---- share links + hash writing use the name ----
  C(T + 'shareLinkFor uses the name slug', /#best-game-league$/.test(shareLinkFor('12345')), shareLinkFor('12345'));
  setLeagueHash('67890');
  C(T + 'setLeagueHash writes the name slug', location.hash === '#jarens-dynasty', location.hash);
  setLeagueHash('12345');
  C(T + 'switching league switches the page', location.hash === '#best-game-league', location.hash);
  setLeagueHash(null);
  C(T + 'clearing hash returns to hub', !location.hash || location.hash === '', JSON.stringify(location.hash));

  // ---- name collisions get a disambiguating id suffix ----
  STATE.approvals['22222'] = { leagueName: 'Best Game League', leagueDocId: 'league_22222', approved: true, sport: 'flb' };
  C(T + 'colliding names get -id suffix', leagueSlug('12345') === 'best-game-league-12345', leagueSlug('12345'));
  C(T + 'both collided leagues are distinct', leagueSlug('22222') === 'best-game-league-22222');
  C(T + 'suffixed slug resolves to the right league', leagueIdFromHash('best-game-league-12345') === '12345');
  C(T + 'other suffixed slug resolves correctly', leagueIdFromHash('best-game-league-22222') === '22222');
  C(T + 'ambiguous bare slug does not silently pick one',
    leagueIdFromHash('best-game-league') === null, String(leagueIdFromHash('best-game-league')));
  delete STATE.approvals['22222'];

  // ---- a stale link with an id suffix still resolves after a rename ----
  STATE.approvals['67890'].leagueName = 'Totally New Name';
  C(T + 'renamed league: new slug works', leagueIdFromHash('totally-new-name') === '67890');
  C(T + 'renamed league: old link with id suffix still resolves',
    leagueIdFromHash('jarens-dynasty-67890') === '67890');
  C(T + 'renamed league: legacy id link still resolves', leagueIdFromHash('league=67890') === '67890');

  // ---- unnamed league falls back to an id-based page ----
  STATE.approvals['33333'] = { leagueName: '', leagueDocId: 'league_33333', approved: true, sport: 'flb' };
  C(T + 'nameless league gets league-<id> slug', leagueSlug('33333') === 'league-33333', leagueSlug('33333'));
  C(T + 'nameless slug resolves', leagueIdFromHash('league-33333') === '33333');

  // ---- a migrated league (two approval keys, ONE data doc) is not a name collision ----
  STATE.approvals['77777'] = { leagueName: 'Hoops Night', leagueDocId: 'league_11111',
                               approved: true, sport: 'fba', migratedFrom: '11111' };
  C(T + 'aliases of the same league do not trigger the collision suffix',
    leagueSlug('11111') === 'hoops-night' && leagueSlug('77777') === 'hoops-night',
    leagueSlug('11111') + ' / ' + leagueSlug('77777'));
  C(T + 'the shared name still resolves after migration', leagueIdFromHash('hoops-night') !== null,
    String(leagueIdFromHash('hoops-night')));
  C(T + 'both aliases point at the same data doc',
    leagueDocFor('11111') === leagueDocFor('77777'), leagueDocFor('77777'));
  delete STATE.approvals['77777'];

  // ---- migrated leagues keep their original data doc ----
  STATE.approvals['44444'] = { leagueName: 'Old Timers', leagueDocId: 'league_old-timers-text-key',
                               approved: true, sport: 'flb', migratedFrom: 'old-timers' };
  C(T + 'doc id comes from the approval, not league_<id>',
    leagueDocFor('44444') === 'league_old-timers-text-key', leagueDocFor('44444'));
  C(T + 'doc id defaults to league_<id> when unset', leagueDocFor('12345') === 'league_12345');
  C(T + 'migrated league still addressable by name', leagueIdFromHash('old-timers') === '44444');

  // ---- a legacy TEXT-keyed league is reachable by name (not rejected as "invalid id") ----
  STATE.approvals['jarens-league'] = { leagueName: 'Jarens League', leagueDocId: 'league_jarens-league',
                                       approved: true, sport: 'flb' };
  C(T + 'legacy text-key league resolves from its name', leagueIdFromHash('jarens-league') === 'jarens-league');
  const okJoin = joinLeagueById('jarens-league', { silent: true });
  C(T + 'joining a text-key league is not rejected by the 5-digit format guard', okJoin === true, String(okJoin));
  C(T + 'garbage id is still rejected', joinLeagueById('!!!nope!!!', { silent: true }) === false);
  delete STATE.approvals['jarens-league'];
  delete STATE.approvals['44444'];

  // ---- a league literally NAMED "12345" is still reachable ----
  STATE.approvals['55555'] = { leagueName: '12345', leagueDocId: 'league_55555', approved: true, sport: 'flb' };
  C(T + 'bare id wins when that id exists', leagueIdFromHash('12345') === '12345');
  delete STATE.approvals['12345'];
  C(T + 'league named "12345" resolves once no such id exists', leagueIdFromHash('12345') === '55555',
    String(leagueIdFromHash('12345')));
  STATE.approvals['12345'] = { leagueName: 'Best Game League', leagueDocId: 'league_12345', approved: true, sport: 'flb' };
  delete STATE.approvals['55555'];

  // ---- hash written before approvals load must still be resolvable ----
  const savedAll = STATE.approvals;
  STATE.approvals = {};
  setLeagueHash('99999');
  C(T + 'unknown league falls back to the resolvable legacy form', location.hash === '#league=99999', location.hash);
  C(T + 'that fallback round-trips', leagueIdFromHash(location.hash.slice(1)) === '99999');
  STATE.approvals = savedAll;
  setLeagueHash(null);

  // ---- deep link parking: slug seen before approvals load ----
  const savedAppr = STATE.approvals;
  STATE.approvals = {}; STATE._loaded = false;
  window._pendingDeepLink = null; window._pendingSlug = null;
  location.hash = '#best-game-league';
  readDeepLink();
  C(T + 'unresolvable slug is parked, not discarded',
    window._pendingSlug === 'best-game-league' && !window._pendingDeepLink, String(window._pendingSlug));
  tryDeepLinkJoin();
  C(T + 'parked slug survives a retry while master is still loading',
    window._pendingSlug === 'best-game-league', String(window._pendingSlug));
  // approvals arrive → resolves
  STATE.approvals = savedAppr; STATE._loaded = true;
  const resolved = leagueIdFromHash(window._pendingSlug);
  C(T + 'parked slug resolves once approvals arrive', resolved === '12345', String(resolved));
  window._pendingSlug = null; window._pendingDeepLink = null;
  location.hash = '';

  // ---- the league directory is cached locally so #slug resolves offline / pre-sync ----
  saveLocal();
  const cached = JSON.parse(localStorage.getItem('bgl_local_v1') || '{}');
  C(T + 'approvals are persisted locally', !!cached.approvals && !!cached.approvals['12345'],
    Object.keys(cached.approvals || {}).join(','));
  const liveAppr = STATE.approvals;
  STATE.approvals = {};                 // simulate a cold boot with Firebase unreachable
  loadLocal();
  C(T + 'loadLocal restores the directory', !!STATE.approvals['12345']);
  C(T + 'a name URL resolves with no Firebase at all', leagueIdFromHash('best-game-league') === '12345');
  STATE.approvals = liveAppr;
})();
