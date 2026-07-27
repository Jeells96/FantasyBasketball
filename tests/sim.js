/* Full-season simulation harness for the FantasyBasketball single-file app.
   Drives the real app in headless Chromium, calling its own functions. */
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');

const PORT = 8931;
const results = [];
const consoleErrors = [];

function startServer() {
  let html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  // Test transform: run the app as a classic script so module-scoped internals
  // (STATE, LG, ...) are reachable from page.evaluate. Firebase loads via dynamic
  // import inside the app and fails gracefully offline (local mode).
  html = html.replace('<script type="module">', '<script>');
  return new Promise(res => {
    const s = http.createServer((req, resp) => {
      resp.writeHead(200, { 'content-type': 'text/html' });
      resp.end(html);
    });
    s.listen(PORT, () => res(s));
  });
}

// ---------- in-page helper installed after load ----------
const SIM_SETUP = () => {
  window.__err = [];
  window.__results = [];
  window.__check = (name, cond, detail) =>
    window.__results.push({ name, pass: !!cond, detail: detail === undefined ? '' : String(detail) });

  window.__sim = {
    alpha(i) { let s = ''; let n = i; do { s += String.fromCharCode(97 + (n % 26)); n = Math.floor(n / 26); } while (n > 0); return s; },
    makePool(sport, n) {
      const pool = [];
      if (sport === 'flb') {
        const cyc = [['C'],['1B'],['2B'],['3B'],['SS'],['OF'],['OF'],['OF'],['SP'],['SP'],['SP'],['RP'],['DH'],['1B','OF'],['2B','SS']];
        for (let i = 0; i < n; i++) {
          const eligible = cyc[i % cyc.length];
          pool.push({ espnId: 1000 + i, name: 'Mlb ' + this.alpha(i) + ' Player', adp: i + 1, eligible,
            proTeam: 'NYY', mlbId: 5000 + i, mlbTeamId: 147, seasonPts: 500 - i });
        }
      } else {
        const cyc = [['PG'],['SG'],['SF'],['PF'],['C'],['PG','SG'],['SF','PF'],['PF','C']];
        for (let i = 0; i < n; i++) {
          pool.push({ espnId: 2000 + i, name: 'Nba ' + this.alpha(i) + ' Player', adp: i + 1, eligible: cyc[i % cyc.length],
            proTeam: 'BOS', mlbId: String(2000 + i), mlbTeamId: 2, seasonPts: 2000 - i, gp: 70, fpg: (2000 - i) / 70 });
        }
      }
      return pool;
    },
    setupLeague(sport, opts = {}) {
      STATE.sport = sport;
      STATE.leagues[sport] = blankLeague(opts.name || 'Sim League');
      STATE.activeLeagueDoc = 'simleague_' + sport + '_' + (opts.name || 'x').replace(/\W/g, '');
      const lg = LG();
      const nT = opts.teams || 10;
      lg.teams = [];
      lg.members = {};
      for (let i = 1; i <= nT; i++) {
        lg.teams.push({ id: 't' + i, name: 'Team ' + i, owner: 'Owner ' + i, abbrev: 'T' + i, claimed: true });
        lg.members['m' + i] = { name: 'Owner ' + i, teamId: 't' + i, joined: Date.now() };
      }
      STATE.memberId = 'm1';
      Object.assign(lg.settings, opts.settings || {});
      lg.playerPool = this.makePool(sport, opts.poolSize || 320);
      this.setWeek(opts.week || 1);
      return lg;
    },
    as(n) { STATE.memberId = 'm' + n; },
    // Set the league schedule opener so that currentWeekNow() === w today.
    setWeek(w) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const open = new Date(today);
      open.setDate(today.getDate() - (w - 1) * 7 - 3); // today lands mid-week w
      LG().schedule = { opener: open.toISOString().slice(0, 10), durations: {} };
      // shifting the opener moves week windows — regenerate logs to match
      if (Object.keys(LG().gameLogs || {}).length) this.genLogs(this._logWeeks || 26);
    },
    // Deterministic per-game logs for every mlbId player, weeks 1..W
    genLogs(W) {
      this._logWeeks = W;
      const lg = LG();
      lg.gameLogs = {};
      const isNba = STATE.sport === 'fba';
      for (const p of lg.playerPool) {
        if (!p.mlbId) continue;
        if (isNba) {
          const logs = [];
          for (let w = 1; w <= W; w++) {
            const days = weekDays(w).map(ymd);
            for (let gi = 0; gi < 3; gi++) {
              const seed = (p.espnId * 31 + w * 7 + gi * 3) % 13;
              logs.push({ date: days[gi * 2], group: 'stats', teamId: 2,
                stat: { points: 10 + seed, rebounds: 2 + (seed % 5), assists: 1 + (seed % 4),
                        steals: seed % 3, blocks: seed % 2, turnovers: seed % 4 } });
            }
          }
          lg.gameLogs[p.mlbId] = logs;
          continue;
        }
        const pit = /SP|RP/.test((p.eligible || []).join(','));
        const logs = [];
        for (let w = 1; w <= W; w++) {
          const days = weekDays(w).map(ymd);
          for (let gi = 0; gi < 3; gi++) {
            const seed = (p.espnId * 31 + w * 7 + gi * 3) % 13;
            const stat = pit
              ? { outs: 12 + seed, earnedRuns: seed % 4, strikeOuts: 3 + (seed % 6),
                  wins: (gi === 0 && seed % 2 === 0) ? 1 : 0, losses: 0, hits: 4 + (seed % 4), baseOnBalls: seed % 3 }
              : { atBats: 4, hits: seed % 4, doubles: gi % 2, triples: 0,
                  homeRuns: (seed === 5 && gi === 0) ? 1 : 0, runs: seed % 3, rbi: (seed + gi) % 3,
                  baseOnBalls: 1, strikeOuts: 1, stolenBases: (seed === 7 && gi === 1) ? 1 : 0,
                  caughtStealing: 0, hitByPitch: 0 };
            logs.push({ date: days[gi * 2], group: pit ? 'pitching' : 'hitting', stat });
          }
        }
        lg.gameLogs[p.mlbId] = logs;
      }
    },
    // run a full live draft using the app's own engine
    runDraft() {
      const lg = LG();
      lg.draft.order = lg.teams.map(t => t.id);
      startLiveDraft();
      let guard = 0;
      while (lg.draft.live && !lg.draft.complete && guard++ < 3000) autoPickForCurrent();
      return { complete: lg.draft.complete, picks: lg.draft.picks.length };
    },
    renderAll() {
      const bad = [];
      for (const pg of ['home','draft','rookie','standings','matchups','teams','myteam','players','settings']) {
        try { renderPage(pg); } catch (e) { bad.push(pg + ': ' + e.message); }
      }
      return bad;
    },
  };
};

/* ---------------------------------------------------------------------------
   SOURCE AUDIT — inline event handlers must be reachable from the GLOBAL scope.

   The app ships as <script type="module">, so its top-level functions are
   module-scoped, not global. An inline handler (onclick="foo()") is evaluated
   against the global scope, so referencing a module-scoped function makes the
   control silently dead: ReferenceError, no visible error, nothing happens.

   This audit exists because the harness below rewrites the module script to a
   classic one (so tests can reach internals) — which makes every module-scoped
   function global and hides exactly this class of bug. So we check the SOURCE
   text, not the running page. Static analysis also covers handlers in code
   paths the scenarios never render.
   --------------------------------------------------------------------------- */
function auditInlineHandlers(src) {
  const exposed = new Set();
  for (const m of src.matchAll(/window\.(\w+)\s*=\s*(?:async\s+)?(?:function|\()/g)) exposed.add(m[1]);
  for (const m of src.matchAll(/window\.(\w+)\s*=\s*(\w+)\s*;/g)) exposed.add(m[1]);

  const BUILTINS = new Set(['if','for','while','switch','return','typeof','new','function','catch',
    'parseInt','parseFloat','String','Number','Boolean','Array','Object','JSON','Math','Date',
    'alert','confirm','prompt','isNaN','encodeURIComponent','decodeURIComponent','setTimeout']);

  const missing = new Map();
  const attr = /\bon(?:click|change|input|keydown|keyup|submit)\s*=\s*"([^"]*)"/g;
  for (const m of src.matchAll(attr)) {
    const body = m[1];
    for (const c of body.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = c[1];
      if (BUILTINS.has(name) || exposed.has(name)) continue;
      // skip method calls (this.foo(), x.foo()) and render-time template calls (${esc(...)})
      const at = c.index;
      const before = body.slice(Math.max(0, at - 2), at);
      if (before.endsWith('.')) continue;
      if (body.slice(0, at).lastIndexOf('${') > body.slice(0, at).lastIndexOf('}')) continue;
      if (!new RegExp(`function\\s+${name}\\s*\\(`).test(src)) continue;  // not ours; ignore
      missing.set(name, (missing.get(name) || 0) + 1);
    }
  }
  return missing;
}

async function main() {
  const srcText = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const missingHandlers = auditInlineHandlers(srcText);
  results.push({
    name: 'Source: every inline on*= handler is reachable from the global scope',
    pass: missingHandlers.size === 0,
    detail: missingHandlers.size
      ? [...missingHandlers.entries()].map(([n, c]) => `${n} (${c} refs)`).join(', ') +
        ' — module-scoped, so these controls throw ReferenceError and do nothing'
      : '',
  });

  const server = await startServer();
  const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  const page = await browser.newPage();
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text().slice(0, 300)); });
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('http://localhost')) r.continue(); else r.abort();
  });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForTimeout(500);
  await page.evaluate(SIM_SETUP);

  const scenarios = fs.readdirSync(__dirname).filter(f => f.startsWith('scenario_')).sort();
  for (const f of scenarios) {
    const code = fs.readFileSync(`${__dirname}/${f}`, 'utf8');
    try {
      await page.evaluate(code);
    } catch (e) {
      results.push({ name: f + ' (script crash)', pass: false, detail: e.message.slice(0, 500) });
    }
    const r = await page.evaluate(() => { const x = window.__results; window.__results = []; return x; });
    r.forEach(x => results.push(x));
  }

  await browser.close();
  server.close();

  let passN = 0, failN = 0;
  for (const r of results) {
    if (r.pass) passN++; else failN++;
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  | ' + r.detail : ''}`);
  }
  console.log(`\n${passN} passed, ${failN} failed`);
  if (consoleErrors.length) {
    console.log('\n-- page errors --');
    [...new Set(consoleErrors)].slice(0, 30).forEach(e => console.log(e));
  }
  fs.writeFileSync(`${__dirname}/results.json`, JSON.stringify({ results, consoleErrors }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
