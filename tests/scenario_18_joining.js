/* Joining a league: a new league starts with no teams, whoever joins gets one and
   must name it, and anyone joining later can tell exactly which team they are
   taking over. Plus the commissioner tools for teams and autodraft. */
(() => {
  const S = window.__sim, C = window.__check;

  const fresh = (name) => {
    STATE.sport = 'flb';
    STATE.leagues.flb = blankLeague(name);
    STATE.activeLeagueDoc = 'join_' + name;
    STATE.memberId = null;
    STATE._loaded = true;
    LG().playerPool = S.makePool('flb', 300);
    return LG();
  };
  const claimAs = (teamId, teamName, first, last) => {
    pickMyTeam(teamId);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('mb-team', teamName); set('mb-first', first); set('mb-last', last);
    confirmMyTeam(teamId);
  };

  // ============================================================
  // a new league has no teams at all
  // ============================================================
  const N = 'NewLeague: ';
  let lg = fresh('Empty');
  C(N + 'a brand-new league starts with zero teams', LG().teams.length === 0, LG().teams.length);
  renderPage('home');
  let html = document.getElementById('page-home').innerHTML;
  C(N + 'and says so rather than showing an empty list', /no teams yet/.test(html));
  C(N + 'offering to start one', /createMyTeam\(\)/.test(html));

  // ============================================================
  // joining makes you a team, and you must name it
  // ============================================================
  const J = 'Joining: ';
  createMyTeam();
  C(J + 'a team slot is created for the joiner', LG().teams.length === 1);
  const slot = LG().teams[0].id;
  C(J + 'and it is marked as not-yet-real', LG().teams[0]._new === true);
  C(J + 'the name box is empty, not pre-filled with a generic name',
    (document.getElementById('mb-team') || {}).value === '', '');
  const setF = () => {
    document.getElementById('mb-first').value = 'Al';
    document.getElementById('mb-last').value = 'Pine';
  };
  setF();
  confirmMyTeam(slot);
  C(J + 'a blank team name is refused', !myTeamId());
  document.getElementById('mb-team').value = '   ';
  setF(); confirmMyTeam(slot);
  C(J + 'so is whitespace', !myTeamId());
  document.getElementById('mb-team').value = 'Team 1';
  setF(); confirmMyTeam(slot);
  C(J + 'and so is the generic placeholder — that is the whole point', !myTeamId());
  document.getElementById('mb-team').value = 'The Sandlot';
  setF(); confirmMyTeam(slot);
  C(J + 'a real name is accepted', !!myTeamId());
  C(J + 'the team takes that name', teamById(myTeamId()).name === 'The Sandlot');
  C(J + 'the owner is recorded', teamById(myTeamId()).owner === 'Al Pine');
  C(J + 'and it is no longer a placeholder slot', !teamById(myTeamId())._new);

  // backing out must not leave an unnamed team behind for the next person
  STATE.memberId = null;
  createMyTeam();
  C(J + 'starting a second team adds a slot', LG().teams.length === 2);
  cancelNewTeam(LG().teams[1].id);
  C(J + 'cancelling takes the empty slot with it', LG().teams.length === 1, LG().teams.length);
  C(J + 'leaving only real, named teams',
    LG().teams.every(t => t.name && !/^team\s*\d+$/i.test(t.name)),
    LG().teams.map(t => t.name).join(','));

  // ============================================================
  // the second device can see what it is joining
  // ============================================================
  const P = 'PickTeam: ';
  // commissioner lays out a few empty teams
  window._masterUnlocked = true;
  addTeamsPrompt();
  document.getElementById('nt-count').value = '3';
  doAddTeams();
  C(P + 'a commissioner can add several teams at once', LG().teams.length === 4, LG().teams.length);
  window._masterUnlocked = false;

  STATE.memberId = null;                       // a fresh device
  renderPage('home');
  html = document.getElementById('page-home').innerHTML;
  C(P + 'open teams are offered', /Join<\/button>/.test(html));
  C(P + 'each says whether it has a roster already', /empty roster/.test(html));
  C(P + 'the claimed team is shown as taken, not hidden',
    /The Sandlot/.test(html) && /taken/.test(html));
  C(P + 'and the warning is on the page before you tap anything', /permanent/.test(html));

  // a team WITH a roster must announce that — it is the dangerous case
  const withRoster = LG().teams[1].id;
  LG().draft.picks = LG().playerPool.slice(0, 5)
    .map((p, i) => ({ teamId: withRoster, playerId: p.espnId, pick: i + 1 }));
  renderPage('home');
  html = document.getElementById('page-home').innerHTML;
  C(P + 'a team that comes with players says so', /5 players already drafted/.test(html));
  pickMyTeam(withRoster);
  let modal = document.getElementById('modal-body').innerHTML;
  C(P + 'the confirmation names the team you are taking over',
    /Take over/.test(modal) && modal.includes(teamById(withRoster).name));
  C(P + 'repeats that it comes with players', /already-drafted player/.test(modal));
  C(P + 'and that there is no going back', /cannot swap/.test(modal));
  document.getElementById('mb-team').value = 'Bench Mob';
  document.getElementById('mb-first').value = 'Bo';
  document.getElementById('mb-last').value = 'Ken';
  confirmMyTeam(withRoster);
  C(P + 'taking it over works', teamById(myTeamId()).name === 'Bench Mob');
  C(P + 'and the roster came with it', teamRoster(myTeamId()).length === 5);

  // an already-claimed team cannot be taken
  STATE.memberId = null;
  pickMyTeam(withRoster);
  C(P + 'a claimed team refuses a second owner',
    /already claimed/.test(document.getElementById('modal-body').innerHTML));
  closeModal();

  // ============================================================
  // commissioner autodraft
  // ============================================================
  const A = 'CommishDraft: ';
  lg = fresh('DraftMe');
  window._masterUnlocked = true;
  addTeamsPrompt(); document.getElementById('nt-count').value = '6'; doAddTeams();
  LG().settings.useSalaryCap = true;
  STATE.salaryDB = { flb: {} };
  LG().playerPool.forEach((p, i) => {
    STATE.salaryDB.flb[normName(p.name)] = { aav: Math.max(1000000, 20000000 - i * 60000) };
  });
  commishAutodraft();
  modal = document.getElementById('modal-body').innerHTML;
  C(A + 'the commissioner is asked to confirm', /Autodraft every team/.test(modal));
  C(A + 'told how many picks that is', new RegExp(`${6 * draftRounds()} picks`).test(modal),
    `${6 * draftRounds()}`);
  C(A + 'and warned it fixes the salary cap', /fixes\s*\n?\s*the league's salary cap/.test(modal.replace(/\s+/g, ' ')));
  closeModal();
  autodraft();
  C(A + 'every team is filled', LG().teams.every(t => teamRoster(t.id).length === rosterCap()),
    LG().teams.map(t => teamRoster(t.id).length).join(','));
  C(A + 'it uses the roster size this league actually plays with, not the sport default',
    LG().draft.rounds === draftRounds(), `${LG().draft.rounds} vs ${draftRounds()}`);
  C(A + 'the draft is marked complete', LG().draft.complete === true);
  C(A + 'and the salary cap is fixed by it, like any other draft',
    !!LSET().capSetFrom && leagueCap() > 0, fmtMoney(leagueCap()));
  C(A + 'which is written down', /Autodraft ran/.test((LG().transactions || []).map(t => t.text).join(' ')));

  // a roster-size override must be honoured
  lg = fresh('BigRoster');
  addTeamsPrompt(); document.getElementById('nt-count').value = '4'; doAddTeams();
  LG().rosterOverride = { lineupSlots: activeLineupSlots(), benchCount: rosterBenchCount() + 4, irCount: 0 };
  autodraft();
  C(A + 'a custom roster size is filled, not the sport default',
    LG().teams.every(t => teamRoster(t.id).length === rosterCap()) && rosterCap() !== SP().rosterSize,
    `${rosterCap()} vs sport default ${SP().rosterSize}`);

  // guards
  lg = fresh('TooFew');
  autodraft();
  C(A + 'one team is not a draft', !LG().draft.complete);
  window._masterUnlocked = false;
  commishAutodraft();
  C(A + 'and a manager cannot start one', !LG().draft.complete);

  STATE.salaryDB = {};
  const bad = S.renderAll();
  C('Joining: all pages render', bad.length === 0, bad.join(' ; '));
})();
