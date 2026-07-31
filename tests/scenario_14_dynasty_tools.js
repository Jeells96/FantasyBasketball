/* Contract-dynasty mechanics: IL relief, configurable dead cap, pinned future
   caps, an undoable season rollover, counter-offers, the activity log and the
   generated rulebook. */
(() => {
  const S = window.__sim, C = window.__check;

  // ============================================================
  // IL relief
  // ============================================================
  const I = 'ILrelief: ';
  STATE.salaryConfig = {};
  STATE.salaryDB = {};
  let lg = S.setupLeague('flb', { teams: 4, week: 2, name: 'ILLeague',
    settings: { leagueType: 'dynasty', useSalaryCap: true, salaryCapDollars: 300000000 } });
  S.runDraft();
  const tid = LG().teams[0].id;
  const guy = teamRoster(tid)[0];
  LG().contracts = LG().contracts || {};
  LG().contracts[String(guy.espnId)] = { baseAAV: 20000000, signedYear: currentSeasonYear(),
    termYears: 4, teamId: tid };

  const fullPay = teamSalaryTotal(tid);
  window._masterUnlocked = true;      // IL-ing a healthy player is a commissioner act
  moveToIR(guy.espnId);
  window._masterUnlocked = false;
  C(I + 'the player is actually on the IL', isOnIR(guy.espnId, tid));
  const ilPay = teamSalaryTotal(tid);
  C(I + 'parking a player on the IL lowers the team payroll', ilPay < fullPay,
    `${fullPay} -> ${ilPay}`);
  const hit = playerCapHit(guy, currentSeasonYear());
  C(I + 'the relief is exactly the configured share',
    fullPay - ilPay === hit - Math.round(hit * 0.5), `saved ${fullPay - ilPay} of ${hit}`);
  C(I + 'the IL player still counts something — this is a discount, not a hole',
    teamPlayerCapHit(tid, guy, currentSeasonYear()) > 0);
  // future years must stay at full price: nobody knows who'll be hurt in 2031
  const nextYr = currentSeasonYear() + 1;
  C(I + 'future seasons are unaffected by today\'s injury',
    teamPlayerCapHit(tid, guy, nextYr) === playerCapHit(guy, nextYr),
    `${teamPlayerCapHit(tid, guy, nextYr)} vs ${playerCapHit(guy, nextYr)}`);
  // and the rule is editable per sport
  setSalCfg('irDiscount', 1);
  C(I + 'setting the discount to 1 charges full freight again',
    teamSalaryTotal(tid) === fullPay, `${teamSalaryTotal(tid)} vs ${fullPay}`);
  setSalCfg('irDiscount', 0.5);
  C(I + 'basketball keeps its own IL rule', SALCFG('fba').irDiscount === 0.5);
  activateFromIR(guy.espnId);
  C(I + 'activating off the IL restores the full charge', teamSalaryTotal(tid) === fullPay);

  // ============================================================
  // dead cap is a rule, not a constant
  // ============================================================
  const D = 'DeadCap: ';
  C(D + 'default is still double the salary',
    dropDeadCap(guy) === 2 * contractSalaryForYear(playerContract(guy), currentSeasonYear()));
  setSalCfg('dropPenalty', 3);
  C(D + 'a commissioner can make dropping hurt more',
    dropDeadCap(guy) === 3 * contractSalaryForYear(playerContract(guy), currentSeasonYear()));
  setSalCfg('dropPenalty', 0);
  C(D + 'zero means zero — not a silent fallback to the default', dropDeadCap(guy) === 0,
    dropDeadCap(guy));
  const beforeDrop = ((LG().deadCap || {})[tid] || []).length;
  applyDropDeadCap(guy.espnId, tid);
  C(D + 'a free drop records no dead-cap entry',
    ((LG().deadCap || {})[tid] || []).length === beforeDrop);
  C(D + 'but the contract is still torn up', !playerContract(guy));
  setSalCfg('dropPenalty', 2);

  // ============================================================
  // pinned future caps
  // ============================================================
  const P = 'CapPin: ';
  lg = S.setupLeague('flb', { teams: 4, week: 2, name: 'PinLeague',
    settings: { leagueType: 'dynasty', useSalaryCap: true, salaryCapDollars: 200000000 } });
  const base = currentSeasonYear();
  C(P + 'this season is the league cap', capForYear(base) === 200000000, capForYear(base));
  const grown = capForYear(base + 2);
  C(P + 'later seasons compound the growth rate', grown > 200000000, grown);
  setCapOverride(base + 2, 500);
  C(P + 'a pinned year uses the exact number', capForYear(base + 2) === 500000000,
    capForYear(base + 2));
  C(P + 'years before the pin are untouched', capForYear(base + 1) !== 500000000);
  C(P + 'years after the pin grow from it, not from today',
    capForYear(base + 3) > 500000000, capForYear(base + 3));
  setCapOverride(base + 2, '');
  C(P + 'clearing the pin returns to plain growth', capForYear(base + 2) === grown,
    `${capForYear(base + 2)} vs ${grown}`);
  C(P + 'cleared pins are stored as null, never deleted (merge writes cannot delete)',
    LG().settings.capOverrides[String(base + 2)] === null);

  // ============================================================
  // the rollover can be taken back
  // ============================================================
  const R = 'Rollover: ';
  lg = S.setupLeague('flb', { teams: 4, week: 2, name: 'RollbackLeague',
    settings: { leagueType: 'dynasty', useSalaryCap: true, salaryCapDollars: 200000000 } });
  S.runDraft();
  const rtid = LG().teams[0].id;
  const keep = teamRoster(rtid)[0], expiring = teamRoster(rtid)[1];
  LG().contracts = {
    [String(keep.espnId)]:     { baseAAV: 10000000, signedYear: currentSeasonYear(), termYears: 5, teamId: rtid },
    [String(expiring.espnId)]: { baseAAV: 10000000, signedYear: currentSeasonYear(), termYears: 1, teamId: rtid },
  };
  const yearBefore = currentSeasonYear();
  const rosterBefore = teamRoster(rtid).length;
  const capBefore = LSET().salaryCapDollars;
  confirmSeasonRollover();
  C(R + 'the season advances', currentSeasonYear() === yearBefore + 1, currentSeasonYear());
  C(R + 'an expiring contract is gone', !LG().contracts[String(expiring.espnId)]);
  C(R + 'and that player is off the roster', teamRoster(rtid).length === rosterBefore - 1);
  C(R + 'a snapshot was taken', !!LG().rollbackSnapshot && LG().rollbackSnapshot.fromYear === yearBefore);
  undoSeasonRollover();
  C(R + 'undo puts the year back', currentSeasonYear() === yearBefore, currentSeasonYear());
  C(R + 'undo restores the expired contract', !!LG().contracts[String(expiring.espnId)]);
  C(R + 'undo puts the released player back on the roster',
    teamRoster(rtid).length === rosterBefore, `${teamRoster(rtid).length} vs ${rosterBefore}`);
  C(R + 'undo restores the cap', LSET().salaryCapDollars === capBefore);
  C(R + 'the snapshot is spent — one undo, not a time machine', !LG().rollbackSnapshot);
  C(R + 'undoing again is refused rather than corrupting state',
    (undoSeasonRollover(), currentSeasonYear() === yearBefore));

  // ============================================================
  // counter-offers
  // ============================================================
  const T = 'Counter: ';
  lg = S.setupLeague('flb', { teams: 4, week: 2, name: 'CounterLeague',
    settings: { leagueType: 'dynasty' } });
  S.runDraft();
  const a = LG().teams[0].id, b = LG().teams[1].id;
  const aPlayer = teamRoster(a)[0], bPlayer = teamRoster(b)[0];
  // team A offers to team B
  S.as(1);
  window._trade = { to: b, fromPlayers: [String(aPlayer.espnId)], toPlayers: [String(bPlayer.espnId)],
                    fromPicks: [], toPicks: [], money: [{ dir: 'fromTo', amount: 5000000, years: 1, perYearList: [5000000] }] };
  sendTradeProposal();
  const offer = LG().trades[LG().trades.length - 1];
  C(T + 'the offer is pending', offer.status === 'pending');

  // team B counters
  S.as(2);
  C(T + 'the receiving team sees it waiting on them', pendingForMe().length === 1);
  counterTrade(offer.id);
  C(T + 'countering opens the builder aimed back at the proposer', window._trade.to === a);
  C(T + 'what they offered becomes what I ask for',
    window._trade.toPlayers.includes(String(aPlayer.espnId)), JSON.stringify(window._trade.toPlayers));
  C(T + 'what they asked for becomes what I offer',
    window._trade.fromPlayers.includes(String(bPlayer.espnId)));
  C(T + 'cash flips direction with the proposer', window._trade.money[0].dir === 'toFrom');
  C(T + 'the original is still live until the counter is sent', offer.status === 'pending');
  sendTradeProposal();
  C(T + 'sending the counter retires the original', offer.status === 'countered');
  const ctr = LG().trades[LG().trades.length - 1];
  C(T + 'the counter is a live offer from the other side',
    ctr.status === 'pending' && String(ctr.from) === String(b) && String(ctr.to) === String(a));
  C(T + 'and it remembers what it answered', ctr.counterOf === offer.id);
  S.as(1);
  C(T + 'the counter now waits on the original proposer', pendingForMe().length === 1);
  S.as(3);
  C(T + 'a team not involved has nothing waiting', pendingForMe().length === 0);
  S.as(2);
  window._trade = null;
  counterTrade(ctr.id);               // team B is the proposer here, not the recipient
  C(T + 'a team may not counter its own offer', window._trade === null);
  S.as(1);

  // ============================================================
  // activity log
  // ============================================================
  const L = 'Activity: ';
  C(L + 'the trade offer was logged',
    (LG().transactions || []).some(t => t.type === 'trade' && /offered a trade/.test(t.text)));
  C(L + 'so was the counter',
    (LG().transactions || []).some(t => t.type === 'trade' && /countered a trade/.test(t.text)));
  const before = (LG().transactions || []).length;
  logTxn('contract', 'test entry');
  C(L + 'newest entries come first', LG().transactions[0].text === 'test entry');
  C(L + 'the log grows', LG().transactions.length === before + 1);
  window._txnFilter = null;
  openActivityLog();
  let logHtml = document.getElementById('modal-body')?.innerHTML
    || document.querySelector('.modal')?.innerHTML || '';
  C(L + 'the log renders every entry', /test entry/.test(logHtml), logHtml.slice(0, 100));
  C(L + 'and offers type filters', /setTxnFilter\('trade'\)/.test(logHtml));
  setTxnFilter('trade');
  logHtml = document.getElementById('modal-body')?.innerHTML
    || document.querySelector('.modal')?.innerHTML || '';
  C(L + 'filtering to trades hides other types', !/test entry/.test(logHtml));
  C(L + 'and keeps the trades', /a trade to/.test(logHtml));
  setTxnFilter('trade');   // toggles back off
  C(L + 'clicking the same filter clears it', window._txnFilter === null);
  C(L + 'export is available', typeof window.exportActivityLog === 'function');
  closeModal();
  // the log is capped so it can't grow without bound
  for (let i = 0; i < 260; i++) logTxn('add', 'flood ' + i);
  C(L + 'the log is capped at 200', LG().transactions.length === 200, LG().transactions.length);

  // ============================================================
  // the rulebook
  // ============================================================
  const B = 'Rulebook: ';
  lg = S.setupLeague('flb', { teams: 10, week: 2, name: 'RuleLeague',
    settings: { leagueType: 'dynasty', useSalaryCap: true, salaryCapDollars: 250000000,
                tradeDeadlineWeek: 18, waiverMode: 'faab', faabBudget: 250 } });
  const house = Object.fromEntries(houseRules());
  C(B + 'house rules state the format', /dynasty/.test(house['Format']), house['Format']);
  C(B + 'house rules quote this league\'s actual cap', /250/.test(house['Salary cap']), house['Salary cap']);
  C(B + 'house rules quote this league\'s actual deadline',
    /week 18/.test(house['Trade deadline']), house['Trade deadline']);
  C(B + 'house rules describe the FAAB budget', /250/.test(house['Waivers']), house['Waivers']);
  C(B + 'house rules explain the drop penalty',
    /2× his current salary/.test(house['Dropping a signed player']), house['Dropping a signed player']);
  C(B + 'house rules explain IL relief', /50%/.test(house['Injured list']), house['Injured list']);
  // generated rules must TRACK the settings, not snapshot them
  LG().settings.tradeDeadlineWeek = 12;
  C(B + 'changing a setting changes the rulebook immediately',
    /week 12/.test(Object.fromEntries(houseRules())['Trade deadline']));
  setSalCfg('irDiscount', 1);
  C(B + 'turning IL relief off says so plainly',
    /no cap relief/.test(Object.fromEntries(houseRules())['Injured list']));
  setSalCfg('irDiscount', 0.5);
  // leagues without salaries shouldn't be told about caps they don't use
  const noCap = S.setupLeague('flb', { teams: 8, week: 2, name: 'NoCap', settings: { useSalaryCap: false } });
  C(B + 'a league without salaries gets no cap rules',
    !Object.fromEntries(houseRules())['Salary cap']);
  C(B + 'but still gets the basics', !!Object.fromEntries(houseRules())['Scoring']);

  // commissioner text + FAQ
  window._masterUnlocked = true;
  LG().rulesDoc = { text: '# Dues\n- $50 **before** the draft', faq: [{ q: 'Who breaks ties?', a: 'Points for.' }], updated: Date.now() };
  openLeagueRules();
  const rulesHtml = document.getElementById('modal-body')?.innerHTML
    || document.querySelector('.modal')?.innerHTML || '';
  C(B + 'commissioner text is rendered', /Dues/.test(rulesHtml));
  C(B + 'bullets and bold survive', /<b>before<\/b>/.test(rulesHtml), '');
  C(B + 'the FAQ is rendered', /Who breaks ties\?/.test(rulesHtml));
  C(B + 'markup in commissioner text cannot inject HTML',
    (LG().rulesDoc.text = '<img src=x onerror=alert(1)>',
     openLeagueRules(),
     !/<img/.test(document.getElementById('modal-body')?.innerHTML
       || document.querySelector('.modal')?.innerHTML || '')));
  closeModal();
  window._masterUnlocked = false;
  LG().rulesDoc = null;

  STATE.salaryConfig = {};
  STATE.salaryDB = {};
  const bad = S.renderAll();
  C('DynastyTools: all pages render', bad.length === 0, bad.join(' ; '));
})();
