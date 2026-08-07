/* THE WEEK YOU ACTUALLY PLAY.
   Box score, games-this-week, one-tap lineup fill, who my hitters are facing, news
   and trending, and the wider NBA scoring set. Both sports throughout.

   A note on how these are written: the multi-device join shipped invisible because
   its test called the handler directly and never checked that anything in the UI
   could reach it. So every feature here is asserted from RENDERED HTML first, and
   only then by calling the function. */
(() => {
  const S = window.__sim, C = window.__check;
  const grab = () => document.getElementById('modal-body')?.innerHTML || '';

  // a schedule the app will find in its own cache, keyed exactly as getWeekSchedule does
  const seedSchedule = (week, build) => {
    const days = weekDays(week).map(ymd);
    const key = `${statSeasonNow()}_${days[0]}_${days[days.length - 1]}`;
    LG().scheduleCache = LG().scheduleCache || {};
    LG().scheduleCache[key] = build(days);
    LG().scheduleFetchedAt = { [key]: Date.now() };
    return days;
  };

  ['flb', 'fba'].forEach(sport => {

    // ============================================================
    // games this week / games left
    // ============================================================
    const G = `GameWeek[${sport}]: `;
    S.setupLeague(sport, { teams: 4, week: 3, name: 'Week' + sport });
    S.runDraft();
    const me = myTeamId();
    const roster = teamRoster(me);
    const p0 = roster[0];
    // three fixtures for p0's club: two in the past, one still to come
    const teamId = p0.mlbTeamId;
    const days = seedSchedule(3, (d) => ({
      [d[0]]: [{ homeId: teamId, awayId: 999, homeAbbr: 'HOM', awayAbbr: 'AWY',
                 homeProb: null, awayProb: 555, awayProbName: 'Rival Ace' }],
      [d[1]]: [{ homeId: 998, awayId: teamId, homeAbbr: 'OPP', awayAbbr: 'HOM',
                 homeProb: 777, homeProbName: 'Другой Starter', awayProb: null }],
      [d[6]]: [{ homeId: teamId, awayId: 997, homeAbbr: 'HOM', awayAbbr: 'FUT',
                 homeProb: null, awayProb: null }],
    }));
    const sched = playerScheduledGames(p0, 3);
    C(G + 'scheduled games are counted from the fixture list, not the game log',
      sched.length === 3, sched.length);
    C(G + 'each carries the day it falls on', sched.map(x => x.dayIdx).join(',') === '0,1,6',
      sched.map(x => x.dayIdx).join(','));
    C(G + 'home and away read the right way round',
      sched[0].opp.startsWith('vs') && sched[1].opp.startsWith('@'),
      `${sched[0].opp} / ${sched[1].opp}`);
    C(G + 'a player with no club id has no schedule',
      playerScheduledGames({ name: 'Nobody' }, 3).length === 0);

    const cnt = playerWeekGameCount(p0, 3);
    C(G + 'the count separates played from scheduled', cnt.total === 3, JSON.stringify(cnt));
    C(G + 'and games-left never counts a day already gone',
      cnt.left <= 1, JSON.stringify(cnt));
    C(G + 'a week with no cached schedule reports nothing rather than guessing', (() => {
      const keep = LG().scheduleCache; LG().scheduleCache = {};
      const c = playerWeekGameCount(p0, 3);
      LG().scheduleCache = keep;
      return c.total === c.played;         // falls back to what was actually played
    })());
    renderPage('home');
    C(G + 'the roster card shows it', /gm<\/span>|gm ·|>\d+ gm/.test(
      document.getElementById('page-home').innerHTML), '');

    // ============================================================
    // one-tap Fill
    // ============================================================
    const O = `Fill[${sport}]: `;
    renderPage('home');
    let hh = document.getElementById('page-home').innerHTML;
    C(O + 'the button is on the page, not just in the code', /optimizeLineup\(/.test(hh));
    // empty every slot, then fill
    ensureLineupExists(3);
    const assign = LG().lineups[me][3].assignments;
    Object.keys(assign).forEach(k => { assign[k] = null; });
    LG().lineups[me][3].userSet = true;
    // give everyone a game left so the filler has legal choices
    roster.forEach(p => { p.mlbTeamId = teamId; });
    optimizeLineup(3);
    const filled = getStarters(me, 3).filter(Boolean).length;
    C(O + 'empty slots get filled', filled > 0, `${filled} starters`);
    C(O + 'nobody is started twice', (() => {
      const ids = getStarters(me, 3).filter(Boolean).map(String);
      return new Set(ids).size === ids.length;
    })());
    C(O + 'every starter is eligible for the slot they landed in', (() => {
      const slots = activeLineupSlots();
      const a = LG().lineups[me][3].assignments;
      return slots.every((s, i) => {
        const pl = roster.find(r => String(r.espnId) === String(a[i]));
        return !pl || slotEligible(s.slot, pl);
      });
    })());
    C(O + 'running it again changes nothing — it is idempotent', (() => {
      const before = JSON.stringify(LG().lineups[me][3].assignments);
      optimizeLineup(3);
      return JSON.stringify(LG().lineups[me][3].assignments) === before;
    })());
    // a player on the IL must never be started
    C(O + 'an IL player is never put in a starting slot', (() => {
      const victim = teamRoster(me).find(p => !getStarters(me, 3).map(String).includes(String(p.espnId)))
                  || teamRoster(me)[0];
      LG().playerPool.find(x => String(x.espnId) === String(victim.espnId)).injured = true;
      LG().irStash = { [me]: [String(victim.espnId)] };
      const a = LG().lineups[me][3].assignments;
      Object.keys(a).forEach(k => { a[k] = null; });
      optimizeLineup(3);
      const started = getStarters(me, 3).map(String);
      LG().irStash = {};
      return !started.includes(String(victim.espnId));
    })());
    C(O + 'and a player with no game left is not started either', (() => {
      const a = LG().lineups[me][3].assignments;
      Object.keys(a).forEach(k => { a[k] = null; });
      // teamRoster() hands back COPIES ({...p, pick}), so moving a player to a club
      // with no fixtures has to be done on the pool entry itself — mutating the copy
      // changes nothing the optimiser will ever see
      const benched = teamRoster(me)[2];
      const poolEntry = LG().playerPool.find(x => String(x.espnId) === String(benched.espnId));
      poolEntry.mlbTeamId = 123456;                   // a club with no fixtures seeded
      optimizeLineup(3);
      const started = getStarters(me, 3).map(String);
      poolEntry.mlbTeamId = teamId;
      return !started.includes(String(benched.espnId));
    })());

    // ============================================================
    // the box score
    // ============================================================
    const B = `BoxScore[${sport}]: `;
    S.setupLeague(sport, { teams: 4, week: 3, name: 'Box' + sport });
    S.runDraft(); S.genLogs(8);
    renderPage('matchups');
    const mh = document.getElementById('page-matchups').innerHTML;
    C(B + 'a matchup card is tappable', /openBoxScore\(/.test(mh));
    const pair = matchupSchedule()[((3 - 1) % Object.keys(matchupSchedule()).length) + 1][0];
    openBoxScore(pair[0], pair[1], 3);
    const bh = grab();
    C(B + 'both teams are named', bh.includes(teamById(pair[0]).name) && bh.includes(teamById(pair[1]).name));
    C(B + 'the totals match what standings would say', (() => {
      const a = teamWeekTotal(pair[0], 3).toFixed(1), b = teamWeekTotal(pair[1], 3).toFixed(1);
      return bh.includes(a) && bh.includes(b);
    })(), `${teamWeekTotal(pair[0],3)} / ${teamWeekTotal(pair[1],3)}`);
    C(B + 'every lineup slot has a row', (activeLineupSlots() || []).every(s =>
      bh.includes(esc(s.label || s.slot))));
    C(B + 'players are named and tappable through to their card', /showPlayer\(/.test(bh));
    C(B + 'the bench is shown — that is where the second-guessing happens', /Bench/.test(bh));
    C(B + 'and the margin is spelled out', /\+\d|tied/.test(bh));
    closeModal();

    // ============================================================
    // NBA scoring: the wider set, without rescoring anyone
    // ============================================================
    if (sport === 'fba') {
      const N = 'NbaScoring: ';
      STATE.sport = 'fba';
      S.setupLeague('fba', { teams: 2, week: 2, name: 'Cats' });
      const ids = scoringCatalog().map(c => c.id);
      C(N + 'the standard categories exist',
        ['3PM', 'FGM', 'FGA', 'FTM', 'FTA', 'DD', 'TD'].every(x => ids.includes(x)), ids.join(','));
      C(N + 'and every one of them ships at zero, so no league is rescored behind its back',
        ['3PM', 'FGM', 'FGA', 'FTM', 'FTA', 'DD', 'TD']
          .every(x => scoringCatalog().find(c => c.id === x).def === 0));
      const line = { points: 30, rebounds: 12, assists: 11, steals: 1, blocks: 0,
                     turnovers: 3, threesMade: 5, fgMade: 10, fgAtt: 20, ftMade: 5, ftAtt: 6 };
      const before = gamePoints(line, 'stats');
      LG().customScoring = { ...NBA_STANDARD_SCORING };
      const after = gamePoints(line, 'stats');
      C(N + 'a triple-double scores more once the categories are switched on',
        after > before, `${before} -> ${after}`);
      C(N + 'double/triple-doubles count categories at ten', (() => {
        return bigCats({ points: 30, rebounds: 12, assists: 11 }) === 3
            && bigCats({ points: 30, rebounds: 12, assists: 9 }) === 2
            && bigCats({ points: 9, rebounds: 9, assists: 9 }) === 0;
      })());
      C(N + 'a triple-double pays and a double-double pays less', (() => {
        const td = gamePoints({ points: 30, rebounds: 12, assists: 11 }, 'stats');
        const dd = gamePoints({ points: 30, rebounds: 12, assists: 4 }, 'stats');
        return td > dd;
      })());
      C(N + 'three-pointers are scored from the log', (() => {
        const a = gamePoints({ points: 10, threesMade: 0 }, 'stats');
        const b = gamePoints({ points: 10, threesMade: 4 }, 'stats');
        return b - a === 4 * NBA_STANDARD_SCORING['3PM'];
      })());
      // THE GUARD THAT MATTERS: a league that never touched scoring is untouched
      C(N + 'a league with default scoring scores exactly as it did before', (() => {
        LG().customScoring = {};
        const only6 = { points: 30, rebounds: 12, assists: 11, steals: 1, blocks: 0, turnovers: 3 };
        const withNew = { ...only6, threesMade: 5, fgMade: 10, fgAtt: 20, ftMade: 5, ftAtt: 6 };
        return gamePoints(only6, 'stats') === gamePoints(withNew, 'stats');
      })());
      C(N + 'the preset is reachable from the scoring editor', (() => {
        window._masterUnlocked = true;
        editScoring();
        const ok = /applyNbaStandard\(\)/.test(grab());
        closeModal(); window._masterUnlocked = false;
        return ok;
      })());
      C(N + 'and applying it turns the new categories on', (() => {
        LG().customScoring = {};
        applyNbaStandard();
        return scoringValues()['3PM'] === 1 && scoringValues().DD === 3 && scoringValues().TD === 5;
      })());
      LG().customScoring = {};
    }

    // ============================================================
    // MLB: who my hitters are facing
    // ============================================================
    if (sport === 'flb') {
      const P = 'Probables: ';
      S.setupLeague('flb', { teams: 2, week: 3, name: 'Probs' });
      S.runDraft();
      const hitter = teamRoster(myTeamId())[0];
      // the harness puts "today" at day index 3, and the grid only previews days
      // from today forward — so the announced game goes later in the week
      const d = seedSchedule(3, (dd) => ({
        [dd[4]]: [{ homeId: hitter.mlbTeamId, awayId: 42, homeAbbr: 'HOM', awayAbbr: 'NYY',
                    homeProb: null, awayProb: 888, awayProbName: 'Gerrit Cole' }],
        // a fixture with nobody announced yet — the common case more than a day out
        [dd[5]]: [{ homeId: 43, awayId: hitter.mlbTeamId, homeAbbr: 'BOS', awayAbbr: 'HOM',
                    homeProb: null, homeProbName: null, awayProb: null }],
      }));
      const key = `${statSeasonNow()}_${d[0]}_${d[d.length-1]}`;
      const m0 = playerDayMatchup(hitter, d[4], LG().scheduleCache[key]);
      C(P + 'a hitter is told who he is facing', m0.oppProb && m0.oppProb.name === 'Gerrit Cole',
        JSON.stringify(m0));
      C(P + 'and it is the OTHER club\'s starter, not his own',
        m0.isProbable === false);
      const m3 = playerDayMatchup(hitter, d[5], LG().scheduleCache[key]);
      C(P + 'an unannounced game still gives the opponent', m3 && m3.opp.includes('BOS'), JSON.stringify(m3));
      C(P + 'with no pitcher invented for it', m3.oppProb === null);
      C(P + 'only the surname is shown — a day cell is 40px wide',
        lastNameOf('Gerrit Cole') === 'Cole' && lastNameOf('') === '');
      renderPage('home');
      C(P + 'and it reaches the day grid', /Cole/.test(document.getElementById('page-home').innerHTML));
    }
  });

  // ============================================================
  // news + trending (sport-neutral plumbing)
  // ============================================================
  const NW = 'News: ';
  S.setupLeague('flb', { teams: 2, week: 2, name: 'Newsy' });
  S.runDraft();
  const someone = LG().playerPool[0];
  _newsCache = { sport: 'flb', at: Date.now(), items: [
    { headline: `${someone.name} leaves game early`, blurb: 'Expected to miss a week.',
      published: '', link: '', athleteIds: [] },
    { headline: 'Someone else does a thing', blurb: 'Unrelated.', published: '', link: '', athleteIds: [] },
    { headline: 'Tagged story', blurb: 'x', published: '', link: '', athleteIds: [String(someone.espnId)] },
  ]};
  const hits = newsFor(someone, _newsCache.items);
  C(NW + 'an ESPN athlete tag wins over reading the headline',
    hits.length === 1 && hits[0].headline === 'Tagged story', JSON.stringify(hits.map(h => h.headline)));
  C(NW + 'falling back to the name still finds the story', (() => {
    const untagged = _newsCache.items.filter(a => !a.athleteIds.length);
    const r = newsFor(someone, untagged);
    return r.length === 1 && /leaves game early/.test(r[0].headline);
  })());
  C(NW + 'and an unrelated player gets nothing',
    newsFor({ name: 'Zzz Nobody', espnId: 'zz' }, _newsCache.items).length === 0);
  C(NW + 'it shows on the player card', (() => {
    showPlayer(someone.espnId);
    return /Latest/.test(grab()) && /leaves game early|Tagged story/.test(grab());
  })());
  closeModal();

  const TR = 'Trending: ';
  // the page defaults to available-only, and runDraft() rostered the top of the
  // pool — so tag two players who are actually still free agents
  const free = LG().playerPool.filter(p =>
    !LG().draft.picks.some(pk => String(pk.playerId) === String(p.espnId)));
  free[0].ownedChange = 12.5;
  free[1].ownedChange = -8.25;
  renderPage('players');
  const ph = document.getElementById('page-players').innerHTML;
  C(TR + 'a trending sort is offered once there is data to sort on', /setSort\('ownedChange'\)/.test(ph));
  C(TR + 'a big riser is marked on the row', /▲12\.5%/.test(ph), '');
  C(TR + 'and a big faller too', /▼8\.3%|▼8\.25%/.test(ph), '');
  setSort('ownedChange');
  C(TR + 'sorting really puts the most-added first', (() => {
    const first = filteredPool()[0];
    return (first.ownedChange || 0) >= 0;
  })());
  setSort('adp');
  _newsCache = { sport: null, at: 0, items: [] };

  const bad = S.renderAll();
  C('GameWeek: every page renders', bad.length === 0, bad.join(' ; '));
})();
