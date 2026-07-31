/* Switching between two saved leagues from the hub.

   The bug: Enter read appr.sport and, when that field was missing, left the active
   sport alone. So opening a baseball league while basketball was active bound the
   baseball DOC to the basketball league object — LG() still returned basketball, so
   it looked like the app had just reopened the league you were trying to leave. It
   also renamed the basketball league to the baseball one on the way past. */
(() => {
  const S = window.__sim, C = window.__check;
  const T = 'LeagueSwitch: ';

  const setup = (hoopsSport, bySport) => {
    STATE.approvals = {
      '11111': Object.assign({ leagueName: 'Hoops', leagueDocId: 'league_11111', approved: true },
                             hoopsSport ? { sport: hoopsSport } : {}),
      '22222': { leagueName: 'The Show', leagueDocId: 'league_22222', approved: true, sport: 'flb' },
    };
    STATE.memberByLeague = { league_11111: 'm1', league_22222: 'm1' };
    STATE.sportByDoc = {};
    STATE.leaguesBySport = bySport || {};
    STATE.leagues.fba = blankLeague('Hoops');
    STATE.leagues.flb = blankLeague('The Show');
    STATE._loaded = true;
  };
  const bothBound = {
    fba: { activeLeagueDoc: 'league_11111', memberId: 'm1', leagueName: 'Hoops' },
    flb: { activeLeagueDoc: 'league_22222', memberId: 'm1', leagueName: 'The Show' },
  };

  // ---- the reported case: a tagged basketball league, entering the baseball one ----
  setup('fba', bothBound);
  STATE.sport = 'fba'; STATE.activeLeagueDoc = 'league_11111';
  joinLeagueById('22222');
  C(T + 'entering the baseball league switches the sport', STATE.sport === 'flb', STATE.sport);
  C(T + 'and binds the baseball doc', STATE.activeLeagueDoc === 'league_22222');
  C(T + 'and shows the baseball league', LG().leagueName === 'The Show', LG().leagueName);
  C(T + 'the basketball league is left alone',
    STATE.leagues.fba.leagueName === 'Hoops', STATE.leagues.fba.leagueName);
  joinLeagueById('11111');
  C(T + 'and back again', STATE.sport === 'fba' && STATE.activeLeagueDoc === 'league_11111');

  // ---- an approval with NO sport recorded: the actual defect ----
  setup(null, bothBound);
  STATE.sport = 'flb'; STATE.activeLeagueDoc = 'league_22222';
  C(T + 'an untagged league resolves from what the device has bound',
    sportForApproval('11111') === 'fba', sportForApproval('11111'));
  joinLeagueById('11111');
  C(T + 'so entering it really does open basketball',
    STATE.sport === 'fba' && STATE.activeLeagueDoc === 'league_11111',
    `${STATE.sport} / ${STATE.activeLeagueDoc}`);
  C(T + 'and it does not rename the other sport\'s league',
    STATE.leagues.flb.leagueName === 'The Show', STATE.leagues.flb.leagueName);

  // ---- untagged with nothing to go on: baseball, matching the master self-heal ----
  setup(null, {});
  C(T + 'with nothing to go on an untagged league is baseball',
    sportForApproval('11111') === 'flb');
  C(T + 'because approvals predate basketball entirely', !STATE.approvals['11111'].sport);

  // ---- and the device learns, so it is wrong at most once ----
  STATE.leaguesBySport = { fba: { activeLeagueDoc: 'league_11111', memberId: 'm1', leagueName: 'Hoops' } };
  switchSport('fba');           // the workaround: the sport picker
  C(T + 'using the sport picker teaches the device',
    STATE.sportByDoc['league_11111'] === 'fba', JSON.stringify(STATE.sportByDoc));
  STATE.sport = 'flb'; STATE.activeLeagueDoc = 'league_22222';
  STATE.leaguesBySport = {};    // even with the bindings gone, the lesson sticks
  C(T + 'and Enter gets it right from then on', sportForApproval('11111') === 'fba');
  joinLeagueById('11111');
  C(T + 'landing in the right sport', STATE.sport === 'fba');

  // ---- the hub row can never disagree with where Enter takes you ----
  setup(null, bothBound);
  const rows = joinedLeaguesList();
  C(T + 'the hub lists both leagues', rows.length === 2, rows.length);
  rows.forEach(r => {
    STATE.sport = r.sport === 'flb' ? 'fba' : 'flb';   // start from the other sport
    joinLeagueById(r.id);
    C(T + `the row for ${r.leagueName} is labelled with the sport it opens`,
      STATE.sport === r.sport, `${r.sport} labelled, ${STATE.sport} opened`);
  });

  // ---- a paused league must not bind anything, whatever its sport ----
  setup('fba', bothBound);
  STATE.approvals['11111'].approved = false;
  STATE.sport = 'flb'; STATE.activeLeagueDoc = 'league_22222';
  joinLeagueById('11111', { silent: true });
  C(T + 'a paused league does not switch you anywhere',
    STATE.sport === 'flb' && STATE.activeLeagueDoc === 'league_22222',
    `${STATE.sport} / ${STATE.activeLeagueDoc}`);

  // ---- an empty, undrafted league is still a real league to switch into ----
  setup('fba', bothBound);
  STATE.leagues.fba.teams = [];               // the reported league had no teams
  STATE.sport = 'flb'; STATE.activeLeagueDoc = 'league_22222';
  joinLeagueById('11111');
  C(T + 'an empty undrafted league still opens', STATE.sport === 'fba');
  const bad = S.renderAll();
  C(T + 'and every page renders for it', bad.length === 0, bad.join(' ; '));

  STATE.approvals = {};
  STATE.memberByLeague = {};
  STATE.leaguesBySport = {};
  STATE.sportByDoc = {};
  STATE.activeLeagueDoc = null;
})();
