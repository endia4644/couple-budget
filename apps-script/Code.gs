/**
 * 우리 가계부 (정윤 · 민서) — Google Apps Script 웹앱
 *
 * 구글 시트 한 장을 저장소로 쓰고, 휴대폰에서 여는 입력 화면(Index.html)을 띄운다.
 * 설치 방법은 README.md 참고.
 *
 * 맨 아래 순수 함수(balance_, summarize_ 등)는 구글 API를 쓰지 않아서
 * node 로도 테스트한다 (test.js).
 */

// ───────── 설정: 여기만 고치면 된다 ─────────
var CFG = {
  PIN: '0000',                    // ⚠️ 배포 전에 둘만 아는 숫자로 바꾸세요
  PEOPLE: ['정윤', '민서'],
  CATEGORIES: ['식비', '간식', '쇼핑', '기타 부대비용'],
  SHEET: '기록',
  TZ: 'Asia/Seoul',               // 날짜 기준 시간대 (스크립트 설정과 상관없이 한국 시간)
};
var VERSION = 4;                  // Index.html 이 이 값으로 Code.gs 가 최신인지 확인한다

var HEAD = ['id', '날짜', '낸 사람', '금액', '항목', '나누기', '메모', '입력시각', '삭제'];
var SPLIT = { HALF: '반반', MINE: '내 것', THEIRS: '상대 것', SETTLE: '정산' };

// ───────── 웹앱 진입점 ─────────
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('우리 가계부')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 앱(PWA)에서 부르는 통로. 몸통은 JSON {pin, op, ...}. 응답도 JSON.
 * 오류는 {error: '...'} 로 돌려준다 (앱이 화면에 띄운다).
 */
function doPost(e) {
  var out;
  try {
    out = api(JSON.parse((e && e.postData && e.postData.contents) || '{}'));
  } catch (err) {
    out = { error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** 처음 한 번 실행: 시트와 머리줄을 만든다. */
function setup() {
  var sh = sheet_();
  Logger.log('준비 완료: ' + sh.getParent().getUrl());
}

/** 화면에서 부르는 유일한 함수. req = {pin, op, month, ...} */
function api(req) {
  req = req || {};
  checkPin_(req.pin);
  var op = req.op || 'state';
  if (op !== 'state') {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (op === 'add') appendRow_(validateEntry_(req.entry, todayStr_()));
      else if (op === 'settle') appendRow_(validateSettle_(req.from, req.amount, todayStr_()));
      else if (op === 'delete') markDeleted_(String(req.id));
      else throw new Error('알 수 없는 요청: ' + op);
    } finally {
      lock.releaseLock();
    }
  }
  var rows = readRows_();
  var month = /^\d{4}-\d{2}$/.test(req.month || '') ? req.month : todayStr_().slice(0, 7);
  return {
    version: VERSION,
    people: CFG.PEOPLE,
    categories: CFG.CATEGORIES,
    today: todayStr_(),
    month: month,
    balance: balance_(rows, CFG.PEOPLE),
    summary: summarize_(rows, month, CFG.PEOPLE),
  };
}

/** PIN 확인. 10분 안에 10번 틀리면 10분 동안 잠근다 (주소가 알려져도 PIN을 맞혀 보기 어렵게). */
function checkPin_(pin) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('pinFails') || 0);
  if (fails >= 10) throw new Error('PIN을 너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요');
  if (String(pin) !== String(CFG.PIN)) {
    cache.put('pinFails', String(fails + 1), 600);
    throw new Error('PIN이 맞지 않습니다');
  }
}

// ───────── 시트 읽기·쓰기 ─────────
function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SHEET);
  if (!sh) {
    sh = ss.insertSheet(CFG.SHEET);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // 날짜·시각을 글자 그대로 저장 (시트가 날짜로 바꿔버리지 않게)
    sh.getRange('B:B').setNumberFormat('@');
    sh.getRange('H:H').setNumberFormat('@');
    sh.getRange('D:D').setNumberFormat('#,##0');
  }
  return sh;
}

function readRows_() {
  var sh = sheet_();
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, HEAD.length).getValues().map(function (r) {
    return {
      id: String(r[0]), date: normDate_(r[1]), payer: String(r[2]).trim(), amount: Number(String(r[3]).replace(/[^\d.-]/g, '')) || 0,
      category: String(r[4]), split: String(r[5]), memo: String(r[6]),
      createdAt: normStamp_(r[7]), deleted: String(r[8]).trim().toUpperCase() === 'Y',
    };
  });
}

function appendRow_(e) {
  var now = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
  var id = new Date().getTime().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  sheet_().appendRow([id, e.date, e.payer, e.amount, e.category, e.split, e.memo, now, '']);
}

function markDeleted_(id) {
  var sh = sheet_();
  var n = sh.getLastRow() - 1;
  if (n < 1) return;
  var ids = sh.getRange(2, 1, n, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) { sh.getRange(i + 2, 9).setValue('Y'); return; }
  }
}

function todayStr_() {
  return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
}

// ───────── 순수 함수 (node 테스트 대상) ─────────

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/**
 * 시트 날짜 칸을 'yyyy-MM-dd' 글자로. 시트가 글자를 날짜값으로 바꿔 저장해도 읽히게 한다.
 * (날짜값이면 Date, 글자면 '2026-11-13' / '2026. 11. 13' / '2026/11/13' 등)
 */
function normDate_(v) {
  if (v instanceof Date && !isNaN(v)) {
    if (typeof Utilities !== 'undefined') return Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd');
    return v.getFullYear() + '-' + pad2_(v.getMonth() + 1) + '-' + pad2_(v.getDate());
  }
  var m = String(v).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? m[1] + '-' + pad2_(+m[2]) + '-' + pad2_(+m[3]) : '';
}

function normStamp_(v) {
  if (v instanceof Date && !isNaN(v)) {
    if (typeof Utilities !== 'undefined') return Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd HH:mm:ss');
    return normDate_(v) + ' ' + pad2_(v.getHours()) + ':' + pad2_(v.getMinutes()) + ':' + pad2_(v.getSeconds());
  }
  return String(v);
}

/** 입력값 검사. 틀리면 Error */
function validateEntry_(e, today) {
  e = e || {};
  var amount = Math.round(Number(String(e.amount).replace(/[^\d]/g, '')));
  if (!(amount > 0) || amount > 100000000) throw new Error('금액을 확인해 주세요');
  if (CFG.PEOPLE.indexOf(e.payer) < 0) throw new Error('낸 사람을 골라 주세요');
  var split = e.split || SPLIT.HALF;
  if ([SPLIT.HALF, SPLIT.MINE, SPLIT.THEIRS].indexOf(split) < 0) throw new Error('나누기 방식을 골라 주세요');
  var date = /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? e.date : today;
  var category = CFG.CATEGORIES.indexOf(e.category) >= 0 ? e.category : CFG.CATEGORIES[CFG.CATEGORIES.length - 1];
  var memo = String(e.memo || '').replace(/[\r\n]+/g, ' ').slice(0, 100);
  return { date: date, payer: e.payer, amount: amount, category: category, split: split, memo: memo };
}

function validateSettle_(from, amount, today) {
  var a = Math.round(Number(String(amount).replace(/[^\d]/g, '')));
  if (!(a > 0)) throw new Error('정산 금액을 확인해 주세요');
  if (CFG.PEOPLE.indexOf(from) < 0) throw new Error('보낸 사람을 확인해 주세요');
  return { date: today, payer: from, amount: a, category: '정산', split: SPLIT.SETTLE, memo: '' };
}

/**
 * 정산 잔액. 양수 = people[1]이 people[0]에게 줘야 할 돈, 음수 = 반대.
 *  반반   : 낸 사람이 상대에게 절반을 받을 몫
 *  상대 것: 상대 물건을 대신 샀으니 전액을 받을 몫
 *  내 것  : 정산과 무관 (기록만)
 *  정산   : 실제로 송금한 돈. 보낸 사람이 받을 몫이 생기는 것과 같다
 */
function balance_(rows, people) {
  var b = 0;
  rows.forEach(function (r) {
    if (r.deleted) return;
    var sign = r.payer === people[0] ? 1 : r.payer === people[1] ? -1 : 0;
    if (r.split === SPLIT.HALF) b += sign * r.amount / 2;
    else if (r.split === SPLIT.THEIRS || r.split === SPLIT.SETTLE) b += sign * r.amount;
  });
  return Math.round(b);
}

/** 한 달 요약: 날짜별 목록·합계, 사람별 낸 돈·실제 부담, 항목별 합계 */
function summarize_(rows, month, people) {
  var live = rows.filter(function (r) { return !r.deleted && r.date.slice(0, 7) === month; });
  var spend = live.filter(function (r) { return r.split !== SPLIT.SETTLE; });
  var paid = {}, share = {}, byCat = {};
  people.forEach(function (p) { paid[p] = 0; share[p] = 0; });
  var total = 0;
  spend.forEach(function (r) {
    var other = r.payer === people[0] ? people[1] : people[0];
    total += r.amount;
    paid[r.payer] = (paid[r.payer] || 0) + r.amount;
    if (r.split === SPLIT.HALF) { share[r.payer] += r.amount / 2; share[other] += r.amount / 2; }
    else if (r.split === SPLIT.MINE) share[r.payer] += r.amount;
    else if (r.split === SPLIT.THEIRS) share[other] += r.amount;
    byCat[r.category] = (byCat[r.category] || 0) + r.amount;
  });
  people.forEach(function (p) { share[p] = Math.round(share[p]); });

  var dayMap = {};
  live.forEach(function (r) {
    var d = dayMap[r.date] || (dayMap[r.date] = { date: r.date, total: 0, cats: {}, items: [] });
    if (r.split !== SPLIT.SETTLE) { d.total += r.amount; d.cats[r.category] = (d.cats[r.category] || 0) + r.amount; }
    d.items.push({ id: r.id, payer: r.payer, amount: r.amount, category: r.category,
                   split: r.split, memo: r.memo, createdAt: r.createdAt });
  });
  var days = Object.keys(dayMap).sort().reverse().map(function (k) {
    dayMap[k].items.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    var c = dayMap[k].cats;
    dayMap[k].cats = order_(Object.keys(c)).map(function (n) { return { name: n, amount: c[n] }; });
    return dayMap[k];
  });
  var cats = order_(Object.keys(byCat)).map(function (k) { return { name: k, amount: byCat[k] }; });
  return { total: total, paid: paid, share: share, categories: cats, days: days };
}

/** 항목을 CFG.CATEGORIES 순서로 (목록에 없는 옛 항목은 뒤로) */
function order_(names) {
  var rank = function (n) { var i = CFG.CATEGORIES.indexOf(n); return i < 0 ? 99 : i; };
  return names.slice().sort(function (a, b) { return rank(a) - rank(b) || (a < b ? -1 : 1); });
}

// node 테스트용 (Apps Script 에서는 module 이 없어 무시된다)
if (typeof module !== 'undefined') {
  module.exports = { CFG: CFG, SPLIT: SPLIT, balance_: balance_, summarize_: summarize_,
                     validateEntry_: validateEntry_, validateSettle_: validateSettle_,
                     normDate_: normDate_, normStamp_: normStamp_ };
}
