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
  C(T + 'benching leaves the slot key absent (renders empty, not removed)', assign()[0] === undefined);
  C(T + 'other slots untouched', Object.keys(assign()).length === slots.length - 1,
    Object.keys(assign()).length + ' of ' + slots.length);
  // getLineup must NOT auto-refill the emptied slot
  C(T + 'getLineup does not resurrect an emptied slot', getLineup('t1', futureWk).assignments[0] === undefined);
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

  // ---- 2. edit-lineup editor is gone ----
  C(T + 'editLineup removed', typeof window.editLineup === 'undefined');
  C(T + 'assignSlot removed', typeof window.assignSlot === 'undefined');
  C(T + 'saveLineup removed', typeof window.saveLineup === 'undefined');
  C(T + 'fillSlot available as replacement', typeof window.fillSlot === 'function');
  C(T + 'pickPosition available', typeof window.pickPosition === 'function');

  // ---- 3. per-player locks ----
  // no schedule (test env) → lock falls back to week start; a past week is locked
  const pastWk = 2, curWk = currentWeekNow();
  const anyP = teamRoster('t1')[0];
  C(T + 'past week is locked', playerLockedForWeek(anyP, pastWk));
  C(T + 'future week is open', !playerLockedForWeek(anyP, futureWk));
  // current week: week already started (setWeek puts today mid-week) → locked by fallback
  C(T + 'current week locked once week has begun (no-schedule fallback)', playerLockedForWeek(anyP, curWk));
  C(T + 'lock fallback = week start, not Sunday 11am',
    playerLockTime(anyP, futureWk) === weekStart(futureWk).getTime());

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
