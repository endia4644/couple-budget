// node pwa_test.js <출력폴더> — pwa/ 를 localhost 로 띄우고, 구글 주소는 가짜 서버(Code.gs 계산 그대로)로 대신해 앱 모드를 검사
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const out = process.argv[2], dir = path.join(__dirname, '..');
const m = { exports: {} }; new Function('module', fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'))(m);
const G = m.exports, CFG = G.CFG;
let rows = [], n = 0, fails = 0; const today = '2026-11-13';
function api(req) {
  if (fails >= 10) throw new Error('PIN을 너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요');
  if (String(req.pin) !== CFG.PIN) { fails++; throw new Error('PIN이 맞지 않습니다'); }
  const push = e => rows.push(Object.assign({ id: 'r' + (++n), createdAt: e.date + ' 12:00:' + String(n).padStart(2, '0'), deleted: false }, e));
  if (req.op === 'add') push(G.validateEntry_(req.entry, today));
  if (req.op === 'settle') push(G.validateSettle_(req.from, req.amount, today));
  if (req.op === 'delete') rows.forEach(r => { if (r.id === req.id) r.deleted = true; });
  const month = /^\d{4}-\d{2}$/.test(req.month || '') ? req.month : today.slice(0, 7);
  return { version: 4, people: CFG.PEOPLE, categories: CFG.CATEGORIES, today, month,
           balance: G.balance_(rows, CFG.PEOPLE), summary: G.summarize_(rows, month, CFG.PEOPLE) };
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((q, s) => {
  let f = decodeURIComponent(q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html';
  if (f === '/config.js') { s.writeHead(200, { 'content-type': types['.js'] }); return s.end("window.BUDGET_API='https://script.google.com/macros/s/TEST/exec';"); }
  const p = path.join(dir, f); if (!fs.existsSync(p)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s);
}).listen(0, async () => {
  const port = srv.address().port, b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  let calls = 0;
  await ctx.route('https://script.google.com/**', async route => {
    calls++; let body;
    try { body = api(JSON.parse(route.request().postData())); } catch (e) { body = { error: e.message }; }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://localhost:${port}/`);
  await pg.waitForSelector('#lock:not(.hidden)');
  const manifest = await pg.evaluate(() => fetch('manifest.webmanifest').then(r => r.json()).then(j => j.display + '/' + j.icons.length));
  // 틀린 PIN
  await pg.fill('#pin', '1234'); await pg.click('text=나는 민서'); await pg.click('#enter'); await pg.waitForSelector('#lock:not(.hidden)');
  const wrongPin = await pg.textContent('.toast');
  await pg.fill('#pin', CFG.PIN); await pg.click('#enter'); await pg.waitForSelector('#main:not(.hidden)');
  await pg.fill('#amt', '12000'); await pg.click('#cats >> text=간식'); await pg.click('#save'); await pg.waitForTimeout(200);
  const dayTotal = await pg.textContent('#day .v'), bal = await pg.textContent('#bal');
  const sw = await pg.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active));
  await pg.evaluate(() => window.scrollTo(0, 0)); await pg.screenshot({ path: out + '/pwa_main.png' });
  console.log(JSON.stringify({ manifest, wrongPin, dayTotal, bal, sw, calls, errs }));
  await b.close(); srv.close();
});
