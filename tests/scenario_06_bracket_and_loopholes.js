(() => {
  const S = window.__sim, C = window.__check;
  const T = 'Bracket: ';

  // ---- 14-team league, 6 playoff teams (byes + 3 rounds) ----
  let lg = S.setupLeague('flb', { teams: 14, week: 1, name: 'BigLeague', poolSize: 400,
    settings: { leagueType: 'redraft', scoringFormat: 'regular', playoffStartWeek: 20, playoffTeams: 6, tradeDeadlineWeek: 26 } });
  S.runDraft(); S.genLogs(26);
  S.setWeek(20);
  let br = playoffBracket();
  C(T + '6-team bracket = 3 rounds', br && br.rounds.length === 3, br && br.rounds.map(r => r.label).join('>'));
  C(T + 'round 1 has 2 byes for top seeds', br && br.rounds[0].pairs.filter(p => p.includes(null)).length === 2,
    JSON.stringify(br && br.rounds[0].pairs));
  const seeds = standingsBestFirst().slice(0, 6).map(String);
  const byeTeams = br.rounds[0].pairs.filter(p => p.includes(null)).map(p => String(p[0] ?? p[1]));
  C(T + 'byes go to seeds 1-2', byeTeams.includes(seeds[0]) && byeTeams.includes(seeds[1]), byeTeams + ' vs ' + seeds.slice(0, 2));
  S.setWeek(23); // past all 3 rounds (wk 20,21,22)
  br = playoffBracket();
  C(T + 'champion crowned after 3 rounds', !!br.champ, br.champ);
  C(T + 'no TBD left when season done', br.rounds.every(r => r.pairs.every(p => p[0] !== undefined && p[1] !== undefined)));

  // ---- 12 playoff teams of 14 ----
  lg.settings.playoffTeams = 12;
  S.setWeek(20);
  br = playoffBracket();
  C(T + '12-team bracket = 4 rounds, 4 byes', br.rounds.length === 4 &&
    br.rounds[0].pairs.filter(p => p.includes(null)).length === 4);
  // playoffTeams clamped to league size
  lg.settings.playoffTeams = 50;
  br = playoffBracket();
  C(T + 'playoffTeams clamps to team count', br.rounds[0].pairs.flat().filter(x => x != null).length === 14);

  // ---- 3-team playoff (odd) ----
  lg.settings.playoffTeams = 3;
  S.setWeek(22);
  br = playoffBracket();
  C(T + '3-team playoff: 1 bye, 2 rounds, champ', br.rounds.length === 2 && !!br.champ);

  const L = 'Loophole: ';
  // ---- salary-cap loophole tests (dynasty) ----
  lg = S.setupLeague('flb', { teams: 6, week: 2, name: 'Loopholes',
    settings: { leagueType: 'dynasty', useSalaryCap: true, scoringFormat: 'regular',
                tradeDeadlineWeek: 20, playoffStartWeek: 23, playoffTeams: 4 } });
  lg.seasonYear = 2026;
  STATE.salaryDB = { flb: {} };
  lg.playerPool.slice(0, 150).forEach((p, i) => {
    STATE.salaryDB.flb[normName(p.name)] = { aav: 30000000 - i * 100000 };
  });
  S.runDraft(); S.genLogs(26);

  // sign guard: cannot sign a free agent
  S.as(1);
  const faP = lg.playerPool.find(p => importedAAV(p) != null && !lg.draft.picks.some(pk => String(pk.playerId) === String(p.espnId)));
  window._signTerm = 5; confirmSign(faP.espnId);
  C(L + 'cannot sign a free agent', !playerContract(faP));
  // sign guard: cannot sign an opponent's player (cap sabotage)
  const oppP = teamRoster('t2').find(p => importedAAV(p) != null);
  window._signTerm = 10; confirmSign(oppP.espnId);
  C(L + "cannot sign another team's player", !playerContract(oppP));
  // term shortening blocked
  const mine = teamRoster('t1').find(p => importedAAV(p) != null);
  window._signTerm = 5; confirmSign(mine.espnId);
  C(L + 'own signing works', playerContract(mine) && playerContract(mine).termYears === 5);
  window._signTerm = 1; confirmSign(mine.espnId);
  C(L + 'contract cannot be shortened', playerContract(mine).termYears === 5, 'term=' + playerContract(mine).termYears);
  window._signTerm = 7; confirmSign(mine.espnId);
  C(L + 'contract CAN be extended', playerContract(mine).termYears === 7);

  // dead cap applies on EVERY drop path
  const hit = playerCapHit(mine, 2026);
  confirmDrop(mine.espnId);   // add/drop modal path (previously skipped dead cap)
  C(L + 'dead cap applied via add/drop modal path', (lg.deadCap['t1'] || []).some(d => d.amount === 2 * hit),
    JSON.stringify(lg.deadCap['t1']));
  // add-with-swap path
  const mine2 = teamRoster('t1').find(p => importedAAV(p) != null && !playerContract(p));
  window._signTerm = 2; confirmSign(mine2.espnId);
  const hit2 = playerCapHit(mine2, 2026);
  const fa2 = lg.playerPool.find(p => !lg.draft.picks.some(pk => String(pk.playerId) === String(p.espnId)) && !(lg.waivers || {})[p.espnId]);
  confirmSwap(fa2.espnId, mine2.espnId);
  C(L + 'dead cap applied via add-with-swap path', (lg.deadCap['t1'] || []).some(d => d.amount === 2 * hit2));

  // contract follows a traded player
  S.as(2);
  const signed2 = teamRoster('t2').find(p => importedAAV(p) != null && !playerContract(p));
  window._signTerm = 4; confirmSign(signed2.espnId);
  window._trade = { to: 't3', fromPlayers: [String(signed2.espnId)], toPlayers: [String(teamRoster('t3')[3].espnId)], fromPicks: [], toPicks: [], money: [] };
  sendTradeProposal();
  S.as(3); acceptTrade(lg.trades[lg.trades.length - 1].id);
  C(L + 'contract teamId follows trade', playerContract(signed2).teamId === 't3', JSON.stringify(playerContract(signed2)));

  // negative cash rejected
  S.as(2);
  window._trade = { to: 't4', fromPlayers: [], toPlayers: [], fromPicks: [{ year: 2027, round: 2 }], toPicks: [],
    money: [{ dir: 'toFrom', amount: -5000000, years: 1 }] };
  sendTradeProposal();
  const negTr = lg.trades[lg.trades.length - 1];
  S.as(4); acceptTrade(negTr.id);
  C(L + 'negative cash trade rejected', negTr.status !== 'accepted' && !(lg.moneyTrades || []).some(m => m.amount < 0),
    'status=' + negTr.status);

  // uneven trade cannot exceed roster cap (both teams full: 2-for-1)
  S.as(2);
  const a1 = teamRoster('t2')[5], a2 = teamRoster('t2')[6], b1 = teamRoster('t5')[5];
  window._trade = { to: 't5', fromPlayers: [String(a1.espnId), String(a2.espnId)], toPlayers: [String(b1.espnId)], fromPicks: [], toPicks: [], money: [] };
  sendTradeProposal();
  const unevenTr = lg.trades[lg.trades.length - 1];
  S.as(5); acceptTrade(unevenTr.id);
  C(L + '2-for-1 blocked when receiver is at roster cap', unevenTr.status !== 'accepted' && teamRoster('t5').length === 21,
    'status=' + unevenTr.status + ' t5=' + teamRoster('t5').length);

  // rookie draft honors penalty-removed + traded picks
  lg.removedPicks = { 2026: { 1: { t1: true } } };          // t1 lost their 2026 R1
  lg.draftPicks = { 2026: { 2: { t2: 't4' } } };            // t2 traded their 2026 R2 to t4
  ensureRD(); lg.rookieDraft.enabled = true; lg.rookieDraft.rounds = 2; lg.rookieDraft.snake = false;
  lg.rookieDraft.order = lg.teams.map(t => t.id);
  const seq = rookieSequence();
  C(L + 'penalized pick skipped in rookie draft', seq.length === 11 && String(seq[0]) !== 't1',
    seq.join(','));
  C(L + 'traded rookie pick made by new owner', String(seq[6 + 1 - 0]) !== 't2' && seq.filter(x => String(x) === 't4').length === 3,
    seq.join(','));

  // ---- IL/IR ----
  const I = 'IL: ';
  lg.removedPicks = {}; lg.draftPicks = {};
  window._masterUnlocked = false;   // ensure no commissioner override is active
  S.as(1);
  const irP = teamRoster('t1')[2];
  moveToIR(irP.espnId);
  C(I + 'healthy player cannot be stashed', !isOnIR(irP.espnId, 't1'));
  irP.injured = true;
  const poolP = lg.playerPool.find(x => String(x.espnId) === String(irP.espnId)); poolP.injured = true;
  moveToIR(irP.espnId);
  C(I + 'injured player stashes on IL', isOnIR(irP.espnId, 't1'));
  C(I + 'IL frees a roster spot', rosterActiveCount('t1') === teamRoster('t1').length - 1);
  C(I + 'IL player excluded from starters', !getStarters('t1', currentWeekNow() + 1).includes(String(irP.espnId)));
  const slots = activeLineupSlots();
  const okIdx = slots.findIndex(s => s.eligible.some(e => irP.eligible.includes(e)));
  lg.viewWeek = currentWeekNow() + 2;
  moveToSlot(irP.espnId, okIdx);
  C(I + 'IL player cannot be slotted into lineup',
    String((lg.lineups['t1']?.[lg.viewWeek]?.assignments || {})[okIdx]) !== String(irP.espnId));
  lg.viewWeek = null;
  activateFromIR(irP.espnId);
  C(I + 'activation returns player', !isOnIR(irP.espnId, 't1') && rosterActiveCount('t1') === teamRoster('t1').length);

  const bad = S.renderAll();
  C(T + 'all pages render', bad.length === 0, bad.join(' ; '));
})();
