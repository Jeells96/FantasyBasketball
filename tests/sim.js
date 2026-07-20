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
  // Test transform: run the app as a classic script with Firebase stubbed out so
  // module-scoped internals (STATE, LG, ...) are reachable from page.evaluate.
  html = html.replace('<script type="module">', '<script>');
  html = html.replace(/import \{ initializeApp \} from[^;]+;/, `
    const initializeApp = () => ({});`);
  html = html.replace(/import \{ getFirestore, doc, getDoc, setDoc, onSnapshot \}\s*from[^;]+;/, `
    const getFirestore = () => ({});
    const doc = (...a) => ({ __path: a.slice(1).join('/') });
    const getDoc = async () => ({ exists: () => false, data: () => null });
    const setDoc = async () => {};
    const onSnapshot = () => (() => {});`);
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
            proTeam: 'BOS', seasonPts: 2000 - i, gp: 70, fpg: (2000 - i) / 70 });
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
      for (const p of lg.playerPool) {
        if (!p.mlbId) continue;
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

async function main() {
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
