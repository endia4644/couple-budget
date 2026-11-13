// node preview.js <출력폴더> — 가짜 서버로 Index.html 을 휴대폰 크기에서 눌러 보고 화면을 찍는다
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const out = process.argv[2];
const code = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');
const mock = `
  ${code}
  var __rows = [], __today = '2026-11-13', __n = 0;
  function __state(month) {
    month = /^\\d{4}-\\d{2}$/.test(month||'') ? month : __today.slice(0,7);
    if (window.__oldCode) return { people: CFG.PEOPLE, categories: CFG.CATEGORIES, today: __today, month: month, balance: 0, summary: { total: 0, paid: {}, share: {}, categories: [], days: [] } };
    return { version: VERSION, people: CFG.PEOPLE, categories: CFG.CATEGORIES, today: __today, month: month,
             balance: balance_(__rows, CFG.PEOPLE), summary: summarize_(__rows, month, CFG.PEOPLE) };
  }
  function __push(e) { __n++; __rows.push(Object.assign({ id: 'r'+__n, createdAt: e.date+' 12:00:'+String(__n).padStart(2,'0'), deleted:false }, e)); }
  function __api(req) {
    if (String(req.pin) !== String(CFG.PIN)) throw new Error('PIN이 맞지 않습니다');
    if (window.__failNext) { window.__failNext = false; throw new Error('Exception: 서비스 오류'); }
    if (req.op === 'add') __push(validateEntry_(req.entry, __today));
    if (req.op === 'settle') __push(validateSettle_(req.from, req.amount, __today));
    if (req.op === 'delete') __rows.forEach(function(r){ if (r.id === req.id) r.deleted = true; });
    return __state(req.month);
  }
  function __runner(ok, bad) { return {
    withSuccessHandler: function(f){ return __runner(f, bad); },
    withFailureHandler: function(f){ return __runner(ok, f); },
    api: function(req){ setTimeout(function(){ try { var r = __api(JSON.parse(JSON.stringify(req))); ok && ok(r); } catch(e){ bad && bad(e); } }, 50); }
  }; }
  window.google = { script: { run: __runner() } };
  window.confirm = function(){ return true; };
`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(mock);
  await pg.goto('file://' + path.join(__dirname, 'Index.html'));
  await pg.waitForSelector('#lock:not(.hidden)');
  await pg.screenshot({ path: out + '/1_lock.png' });
  await pg.fill('#pin', '0000');
  await pg.click('text=나는 정윤'); await pg.screenshot({ path: out + '/1b_lock_picked.png' });
  await pg.click('#enter');
  await pg.waitForSelector('#main:not(.hidden)');
  await pg.screenshot({ path: out + '/2_empty.png' });
  const save = async (amt, cat, payer, split, memo) => {
    await pg.fill('#amt', amt); await pg.click('#cats >> text=' + cat);
    await pg.click('#payer >> text=' + payer); await pg.click('#split >> text=' + split);
    if (memo) await pg.fill('#memo', memo);
    await pg.click('#save'); await pg.waitForTimeout(150);
  };
  // 항목 안 고르면 막히는지
  await pg.fill('#amt', '1000'); await pg.click('#save'); await pg.waitForTimeout(100);
  const blocked = await pg.textContent('.toast');
  const needLabel = await pg.textContent('.label.need');
  await pg.evaluate(() => window.scrollTo(0, 500)); await pg.screenshot({ path: out + '/2b_need.png' });
  // 서버 오류가 화면에 남는지
  await pg.click('#cats >> text=식비'); await pg.evaluate(() => { window.__failNext = true; }); await pg.click('#save'); await pg.waitForTimeout(150);
  const errShown = await pg.textContent('#err');
  await pg.screenshot({ path: out + '/2c_err.png' });
  await pg.click('#cats >> text=식비');
  await pg.fill('#amt', '');
  // 오늘
  await save('32000', '식비', '정윤', '반반', '저녁 삼겹살');
  await save('5500', '간식', '민서', '내 것');
  await save('4000', '쇼핑', '민서', '상대 것');
  const today = await pg.textContent('#day .v');
  await pg.evaluate(() => window.scrollTo(0, 0)); await pg.screenshot({ path: out + '/3_today.png' });
  // 어제로 가서 입력
  await pg.click('#prevDay'); await pg.waitForTimeout(100);
  const yLabel = await pg.textContent('#wLabel');
  await save('18000', '기타 부대비용', '정윤', '반반', '주차');
  const yTotal = await pg.textContent('#day .v');
  await pg.evaluate(() => window.scrollTo(0, 0)); await pg.screenshot({ path: out + '/4_yesterday.png' });
  await pg.evaluate(() => window.scrollTo(0, 900)); await pg.screenshot({ path: out + '/4b_form.png' });
  await pg.click('#toToday'); await pg.waitForTimeout(100);
  const bal1 = await pg.textContent('#bal');
  await pg.click('#bal button'); await pg.waitForSelector('.sheet');
  await pg.fill('.sheet input', '5000'); await pg.click('.sheet .go'); await pg.waitForTimeout(200);
  const bal2 = await pg.textContent('#bal');
  await pg.click('.item:has-text("간식") .x'); await pg.waitForTimeout(200);
  const total = await pg.textContent('#month .mtot b');
  const todayAfter = await pg.textContent('#day .v');
  await pg.evaluate(() => window.scrollTo(0, 99999)); await pg.waitForTimeout(100); await pg.screenshot({ path: out + '/6_final.png' });
  // 월 목록에서 날짜 누르면 이동
  await pg.click('.mday:has-text("12일")'); await pg.waitForTimeout(100);
  const jumped = await pg.textContent('#dLabel');
  // 지난달로 넘겨 보기
  await pg.click('#prevMonth'); await pg.waitForTimeout(200);
  const prevM = { label: await pg.textContent('#mLabel'), date: await pg.textContent('#dLabel'), next: await pg.isDisabled('#nextMonth'), empty: await pg.textContent('#month') };
  await save('7000', '간식', '민서', '반반', '10월 말 기록');
  await pg.evaluate(() => window.scrollTo(0, 99999)); await pg.waitForTimeout(100);
  await pg.screenshot({ path: out + '/7_prevmonth.png' });
  await pg.click('#nextMonth'); await pg.waitForTimeout(200);
  const backM = { label: await pg.textContent('#mLabel'), date: await pg.textContent('#dLabel'), next: await pg.isDisabled('#nextMonth') };
  // 달력으로 날짜 고르기
  await pg.fill('#pick', '2026-11-12'); await pg.dispatchEvent('#pick', 'change'); await pg.waitForTimeout(100);
  const picked = await pg.textContent('#dLabel');
  await pg.evaluate(() => window.scrollTo(0, 0)); await pg.screenshot({ path: out + '/8_picked.png' });
  await pg.reload(); await pg.waitForSelector('#main:not(.hidden)');
  // 예전 Code.gs 흉내
  await pg.evaluate(() => { window.__oldCode = true; }); await pg.click('#prevDay'); await pg.click('#prevMonth'); await pg.waitForTimeout(200);
  const oldCode = await pg.textContent('#err');
  await pg.screenshot({ path: out + '/9_old.png' });
  console.log(JSON.stringify({ blocked, today, yLabel, yTotal, bal1, bal2, total, todayAfter, jumped, prevM, backM, picked, needLabel, errShown, oldCode, errs }));
  await b.close();
})();
