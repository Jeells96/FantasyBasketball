(() => {
  const S = window.__sim, C = window.__check;
  const T = 'LineupUX: ';
  const lg = S.setupLeague('flb', { teams: 6, week: 5, name: 'LineupUX',
    settings: { leagueType: 'redraft', scoringFormat: 'regular', playoffStartWeek: 23, tradeDeadlineWeek: 26 } });
  S.runDraft(); S.genLogs(26);
  S.as(1);

  const slots = activeLineupSlots();
  const futureWk = currentWeekNow() + 2;    // fully unlocked
  lg.viewWeek = futureWk;
  ensureLineupExists(futureWk);
  const assign = () => lg.lineups['t1'][futureWk].assignments;

  // ---- 1. emptied slot STAYS as an empty slot ----
  const starterId = assign()[0];
  C(T + 'slot 0 starts filled', !!starterId);
  moveToSlot(starterId, 'bench');
  // vacancy is an explicit null, never a deleted key: league sync uses setDoc(merge:true),
  // which cannot remove a field, so a deleted key would come back on the next snapshot
  C(T + 'benching writes an explicit null (survives merge:true sync)', assign()[0] === null,
    JSON.stringify(assign()[0]));
  C(T + 'slot key is retained, not deleted', Object.prototype.hasOwnProperty.call(assign(), '0'));
  C(T + 'other slots untouched', Object.keys(assign()).length === slots.length,
    Object.keys(assign()).length + ' of ' + slots.length);
  // getLineup must NOT auto-refill the emptied slot
  C(T + 'getLineup does not resurrect an emptied slot', !getLineup('t1', futureWk).assignments[0]);
  // simulate a Firestore merge round-trip: merge cannot delete keys, so a null must persist
  const merged = Object.assign({}, { 0: starterId, 1: assign()[1] }, assign());
  C(T + 'after a merge round-trip the slot is still empty', !merged[0], JSON.stringify(merged[0]));
  C(T + 'player is not left in two slots after a merge',
    Object.values(merged).filter(v => v && String(v) === String(starterId)).length === 0);
  C(T + 'emptied slot excluded from starters', !getStarters('t1', futureWk).includes(String(starterId)));

  // ---- empty every slot: still not auto-refilled ----
  Object.values(assign()).slice().forEach(pid => { if (pid) moveToSlot(pid, 'bench'); });
  C(T + 'fully emptied lineup stays empty (userSet honored)',
    Object.keys(getLineup('t1', futureWk).assignments).filter(k => getLineup('t1', futureWk).assignments[k]).length === 0);
  C(T + 'fully empty lineup scores 0', teamWeekTotal('t1', futureWk) === 0, teamWeekTotal('t1', futureWk));

  // ---- fillSlot puts a player back ----
  const emptyIdx = 0;
  const cand = teamRoster('t1').find(p => slots[emptyIdx].eligible.some(e => p.eligible.includes(e)));
  moveToSlot(cand.espnId, emptyIdx);
  C(T + 'slot refills', String(assign()[emptyIdx]) === String(cand.espnId));
  C(T + 'refilled player scores again', getStarters('t1', futureWk).includes(String(cand.espnId)));

  // ---- consistency: getStarters agrees with what the roster view shows ----
  const staleWk = futureWk;
  const a2 = lg.lineups['t1'][staleWk].assignments;
  const assignedNow = new Set(Object.values(a2).filter(Boolean).map(String));
  const benched = teamRoster('t1').find(p => !assignedNow.has(String(p.espnId)));
  a2[999] = benched.espnId;                          // stale index past the slot count
  C(T + 'stale slot index does not count as a starter',
    !getStarters('t1', staleWk).includes(String(benched.espnId)),
    'starters=' + getStarters('t1', staleWk).length);
  delete a2[999];
  // a dropped player left in an assignment must not score
  const ghost = teamRoster('t1')[3];
  const gIdx = slots.findIndex((s, i) => s.eligible.some(e => ghost.eligible.includes(e)));
  a2[gIdx] = ghost.espnId;
  confirmDrop(ghost.espnId);
  C(T + 'dropping clears the player from current+future lineups, not just the viewed week',
    !getStarters('t1', staleWk).includes(String(ghost.espnId)));
  C(T + 'dropped player contributes no points', !teamRoster('t1').some(p => String(p.espnId) === String(ghost.espnId)));
  // IL players never occupy a starting slot
  const ilP = teamRoster('t1').find(p => !isOnIR(p.espnId, 't1'));
  const ilIdx = slots.findIndex(s => s.eligible.some(e => ilP.eligible.includes(e)));
  a2[ilIdx] = ilP.espnId;
  ilP.injured = true;
  lg.playerPool.find(x => String(x.espnId) === String(ilP.espnId)).injured = true;
  moveToIR(ilP.espnId);
  C(T + 'IL player is pulled from the lineup', !getStarters('t1', staleWk).includes(String(ilP.espnId)));
  activateFromIR(ilP.espnId);

  // ---- 2. edit-lineup editor is gone ----
  C(T + 'editLineup removed', typeof window.editLineup === 'undefined');
  C(T + 'assignSlot removed', typeof window.assignSlot === 'undefined');
  C(T + 'saveLineup removed', typeof window.saveLineup === 'undefined');
  C(T + 'fillSlot available as replacement', typeof window.fillSlot === 'function');
  C(T + 'pickPosition available', typeof window.pickPosition === 'function');

  // ---- 3. per-player locks ----
  const pastWk = 2, curWk = currentWeekNow();
  const anyP = teamRoster('t1')[0];
  C(T + 'past week is locked', playerLockedForWeek(anyP, pastWk));
  C(T + 'future week is open', !playerLockedForWeek(anyP, futureWk));
  // MLB is schedule-backed: with no game found, the lock FAILS OPEN rather than
  // locking someone out over a game that isn't happening / hasn't loaded
  const savedLogs0 = lg.gameLogs; lg.gameLogs = {};
  lg.scheduleCache = {};
  C(T + 'schedule-backed sport with no known game stays editable', playerLockTime(anyP, curWk) === null,
    String(playerLockTime(anyP, curWk)));
  C(T + 'and is therefore not locked', !playerLockedForWeek(anyP, curWk));
  lg.gameLogs = savedLogs0;
  C(T + 'a player who already logged a game this week IS locked', playerLockedForWeek(anyP, curWk));
  // BOTH sports are schedule-backed now (NBA got a real provider), so neither falls
  // back to the blunt week-start lock while a schedule is reachable
  C(T + 'MLB is schedule-backed', FEAT().schedule === true);
  STATE.sport = 'fba';
  C(T + 'NBA is schedule-backed too', FEAT().schedule === true);
  C(T + 'NBA unknown game => fails open, not locked for the week',
    playerLockTime({ espnId: 2001, name: 'N' }, futureWk) === null);
  STATE.sport = 'flb';

  // schedule-driven: player with a game later today is still editable
  const days = weekDays(curWk).map(ymd);
  const soon = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
  const past = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const key = `${SP().season}_${days[0]}_${days[days.length - 1]}`;
  const openP = teamRoster('t1')[1], lockedP = teamRoster('t1')[2];
  openP.mlbTeamId = 501; lockedP.mlbTeamId = 502;
  lg.playerPool.find(x => String(x.espnId) === String(openP.espnId)).mlbTeamId = 501;
  lg.playerPool.find(x => String(x.espnId) === String(lockedP.espnId)).mlbTeamId = 502;
  lg.scheduleCache = {};
  lg.scheduleCache[key] = { [days[0]]: [
    { homeId: 501, awayId: 999, time: soon }, { homeId: 502, awayId: 998, time: past } ] };
  // clear logs so the "already played" shortcut doesn't dominate
  const savedLogs = lg.gameLogs; lg.gameLogs = {};
  C(T + 'player whose game is later today is NOT locked', !playerLockedForWeek(openP, curWk),
    'lock at ' + new Date(playerLockTime(openP, curWk)).toISOString());
  C(T + 'player whose game already started IS locked', playerLockedForWeek(lockedP, curWk));
  C(T + 'countdown shows time remaining for open player', playerLockCountdown(openP, curWk) !== 'Locked',
    playerLockCountdown(openP, curWk));
  C(T + 'countdown says Locked for started player', playerLockCountdown(lockedP, curWk) === 'Locked');

  // moving the unlocked player in the CURRENT week works (old code blocked the whole week)
  lg.viewWeek = curWk;
  ensureLineupExists(curWk);
  const curAssign = lg.lineups['t1'][curWk].assignments;
  Object.keys(curAssign).forEach(k => { if (String(curAssign[k]) === String(openP.espnId)) delete curAssign[k]; });
  const idxOpen = slots.findIndex(s => s.eligible.some(e => openP.eligible.includes(e)) && !curAssign[slots.indexOf(s)]);
  const freeIdx = slots.findIndex((s, i) => !curAssign[i] && s.eligible.some(e => openP.eligible.includes(e)));
  if (freeIdx >= 0) {
    moveToSlot(openP.espnId, freeIdx);
    C(T + 'unlocked player CAN be moved during the live week', String(curAssign[freeIdx]) === String(openP.espnId),
      'slot ' + freeIdx);
  } else C(T + 'found a free slot for open player', false);
  // locked player cannot be moved
  const lockedIdx = slots.findIndex((s, i) => !curAssign[i] && s.eligible.some(e => lockedP.eligible.includes(e)));
  if (lockedIdx >= 0) {
    moveToSlot(lockedP.espnId, lockedIdx);
    C(T + 'locked player cannot be moved', String(curAssign[lockedIdx]) !== String(lockedP.espnId));
  }
  // a locked occupant cannot be bumped out of their slot
  const bumpIdx = slots.findIndex(s => s.eligible.some(e => lockedP.eligible.includes(e))
                                    && s.eligible.some(e => openP.eligible.includes(e)));
  if (bumpIdx >= 0) {
    curAssign[bumpIdx] = lockedP.espnId;
    moveToSlot(openP.espnId, bumpIdx);
    C(T + 'cannot bump a locked player out of their slot', String(curAssign[bumpIdx]) === String(lockedP.espnId));
  }
  lg.gameLogs = savedLogs;
  lg.viewWeek = null;

  // ---- 4. headshots ----
  const H = 'Headshot: ';
  const p0 = lg.playerPool[0];
  const url = headshotUrl(p0, 96);
  C(H + 'MLB url uses espnId on ESPN cdn', /a\.espncdn\.com.*\/mlb\/players\/full\/1000\.png/.test(url), url);
  C(H + 'url is scaled via combiner (small payload)', /combiner/.test(url) && /w=96/.test(url));
  C(H + 'MLB fallback uses mlbId', /midfield\.mlbstatic\.com\/v1\/people\/5000\//.test(headshotFallbackUrl(p0)),
    headshotFallbackUrl(p0));
  const html = headshotImg(p0, 40);
  C(H + 'img has lazy loading + onerror fallback', /loading="lazy"/.test(html) && /onerror="headshotFail\(this\)"/.test(html));
  C(H + 'initials computed from name', playerInitials('Mike Trout') === 'MT', playerInitials('Mike Trout'));
  C(H + 'no-id player renders placeholder, never a broken img',
    !/<img/.test(headshotImg({ name: 'No Id' }, 40)));

  // ---- "extra" MLB players (added via search, synthetic non-numeric espnId) ----
  // must still hit the MLB CDN by mlbId instead of skipping straight to initials.
  const extraP = { espnId: 'mlb_660271', mlbId: 660271, name: 'Shohei Ohtani' };
  C(H + 'extra player has no ESPN-id url (synthetic espnId)', headshotUrl(extraP, 96) === null);
  C(H + 'extra player DOES have an mlbId fallback url', /midfield\.mlbstatic\.com\/v1\/people\/660271\//.test(headshotFallbackUrl(extraP)),
    headshotFallbackUrl(extraP));
  const extraHtml = headshotImg(extraP, 40);
  C(H + 'extra player renders the MLB CDN <img>, not an initials chip',
    /<img/.test(extraHtml) && /midfield\.mlbstatic\.com\/v1\/people\/660271\//.test(extraHtml), extraHtml);
  C(H + 'extra player img has no further fallback to loop to (already the last resort)',
    !/data-fb=/.test(extraHtml), extraHtml);

  // ---- injection safety: names/ids come from an external API + commissioner input ----
  const hostile = [
    { espnId: 1, name: `A" onerror="window.__pwned=1` },
    { espnId: 2, name: `<img src=x onerror=alert(1)>` },
    { espnId: 3, name: `</span><script>window.__pwned=1<\/script>` },
    { espnId: `4" onload="window.__pwned=1`, name: 'Bad Id' },
    { espnId: 5, name: `&quot;;window.__pwned=1;//` },
  ];
  window.__pwned = 0;
  const probe = document.createElement('div');
  probe.innerHTML = hostile.map(x => headshotImg(x, 40)).join('');
  document.body.appendChild(probe);
  C(H + 'hostile names produce no extra elements/injection',
    probe.querySelectorAll('script').length === 0 && !window.__pwned,
    probe.innerHTML.slice(0, 120));
  C(H + 'initials strip markup characters',
    hostile.every(x => /^[A-Z0-9?]{1,2}$/.test(playerInitials(x.name))),
    hostile.map(x => playerInitials(x.name)).join(','));
  C(H + 'non-numeric espnId yields no image URL', headshotUrl(hostile[3], 96) === null);
  C(H + 'every element rendered is an img or initials chip',
    [...probe.children].every(el => el.tagName === 'IMG' || el.classList.contains('ph')),
    [...probe.children].map(e => e.tagName).join(','));
  // fallback handler swaps to a textContent chip — never parses HTML
  const img = probe.querySelector('img');
  if (img) {
    img.dataset.tried = '1';
    headshotFail(img);
    C(H + 'fallback chip uses textContent (no markup parsed)',
      probe.querySelectorAll('script').length === 0 && !window.__pwned);
  }
  probe.remove();
  // NBA namespace
  STATE.sport = 'fba';
  const nbaP = { espnId: 4066261, name: 'Test Player' };
  C(H + 'NBA url uses nba namespace', /\/nba\/players\/full\/4066261\.png/.test(headshotUrl(nbaP, 96)), headshotUrl(nbaP, 96));
  C(H + 'NBA has no mlb fallback', headshotFallbackUrl(nbaP) === null);
  STATE.sport = 'flb';

  const bad = S.renderAll();
  C(T + 'all pages render', bad.length === 0, bad.join(' ; '));
})();
