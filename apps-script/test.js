// node test.js — Code.gs 의 순수 함수(정산·요약·입력 검사) 검사
const fs = require('fs');
const path = require('path');
const m = { exports: {} };
new Function('module', fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'))(m);
const { balance_, summarize_, validateEntry_, validateSettle_, normDate_, normStamp_ } = m.exports;

const P = ['정윤', '민서'];
let n = 0, fail = 0;
function eq(name, got, want) {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log('✗', name, '\n   got ', JSON.stringify(got), '\n   want', JSON.stringify(want)); }
}
function throws(name, fn) { n++; try { fn(); fail++; console.log('✗', name, '(안 터짐)'); } catch (e) { /* ok */ } }

const r = (date, payer, amount, split, category = '식비', deleted = false) =>
  ({ id: date + payer + amount, date, payer, amount, split, category, memo: '', createdAt: date + ' 12:00:00', deleted });

// ── 정산 잔액 (양수 = 민서가 정윤에게 줄 돈)
eq('빈 기록', balance_([], P), 0);
eq('정윤 반반 10000 → 민서가 5000', balance_([r('2026-11-13', '정윤', 10000, '반반')], P), 5000);
eq('민서 반반 10000 → 정윤가 5000', balance_([r('2026-11-13', '민서', 10000, '반반')], P), -5000);
eq('내 것은 정산 없음', balance_([r('2026-11-13', '정윤', 7000, '내 것')], P), 0);
eq('정윤가 민서 것 대신 삼 → 전액', balance_([r('2026-11-13', '정윤', 7000, '상대 것')], P), 7000);
eq('서로 반반 상쇄',
  balance_([r('2026-11-13', '정윤', 10000, '반반'), r('2026-11-13', '민서', 10000, '반반')], P), 0);
eq('민서가 5000 송금하면 0',
  balance_([r('2026-11-13', '정윤', 10000, '반반'), r('2026-11-13', '민서', 5000, '정산')], P), 0);
eq('삭제된 기록은 빼기',
  balance_([r('2026-11-13', '정윤', 10000, '반반', '식비', true)], P), 0);
eq('홀수 반반 반올림 (3333 → 1667)', balance_([r('2026-11-13', '정윤', 3333, '반반')], P), 1667);
eq('홀수 두 번 합쳐서 정확 (3333+3333 → 3333)',
  balance_([r('2026-11-13', '정윤', 3333, '반반'), r('2026-11-13', '정윤', 3333, '반반')], P), 3333);

// ── 한 달 요약
const rows = [
  r('2026-11-12', '정윤', 20000, '반반', '식비'),
  r('2026-11-13', '민서', 6000, '내 것', '간식'),
  r('2026-11-13', '민서', 4000, '상대 것', '쇼핑'),
  r('2026-11-13', '민서', 9000, '정산', '정산'),
  r('2026-10-31', '정윤', 99999, '반반', '식비'),        // 다른 달
  r('2026-11-13', '정윤', 50000, '반반', '식비', true),  // 삭제
];
const s = summarize_(rows, '2026-11', P);
eq('합계 (정산·다른 달·삭제 제외)', s.total, 30000);
eq('낸 돈', s.paid, { 정윤: 20000, 민서: 10000 });
eq('실제 부담', s.share, { 정윤: 14000, 민서: 16000 });
eq('항목별 (정해진 순서)', s.categories, [{ name: '식비', amount: 20000 }, { name: '간식', amount: 6000 }, { name: '쇼핑', amount: 4000 }]);
eq('하루 항목별 (정산 제외)', s.days[0].cats, [{ name: '간식', amount: 6000 }, { name: '쇼핑', amount: 4000 }]);
eq('다른 날 항목별', s.days[1].cats, [{ name: '식비', amount: 20000 }]);
eq('날짜 최신순', s.days.map(d => d.date), ['2026-11-13', '2026-11-12']);
eq('날짜 합계는 정산 제외', s.days[0].total, 10000);
eq('정산 줄도 목록엔 보임', s.days[0].items.length, 3);

// ── 입력 검사
const T = '2026-11-13';
eq('정상 입력', validateEntry_({ amount: '12,500', payer: '민서', category: '간식', split: '반반', memo: '아아\n2잔' }, T),
  { date: T, payer: '민서', amount: 12500, category: '간식', split: '반반', memo: '아아 2잔' });
eq('항목 비면 기타 부대비용', validateEntry_({ amount: 1000, payer: '정윤' }, T).category, '기타 부대비용');
eq('목록에 없는 항목도 기타 부대비용', validateEntry_({ amount: 1000, payer: '정윤', category: '카페' }, T).category, '기타 부대비용');
eq('날짜 비면 오늘', validateEntry_({ amount: 1000, payer: '정윤' }, T).date, T);
eq('나누기 비면 반반', validateEntry_({ amount: 1000, payer: '정윤' }, T).split, '반반');
throws('금액 0', () => validateEntry_({ amount: 0, payer: '정윤' }, T));
throws('금액 글자', () => validateEntry_({ amount: 'abc', payer: '정윤' }, T));
throws('모르는 사람', () => validateEntry_({ amount: 1000, payer: '철수' }, T));
throws('정산을 일반 입력으로', () => validateEntry_({ amount: 1000, payer: '정윤', split: '정산' }, T));
eq('정산 기록', validateSettle_('민서', '9,000', T),
  { date: T, payer: '민서', amount: 9000, category: '정산', split: '정산', memo: '' });
throws('정산 0원', () => validateSettle_('민서', 0, T));

// ── 시트가 날짜를 날짜값으로 바꿔 저장한 경우
eq('글자 날짜 그대로', normDate_('2026-11-13'), '2026-11-13');
eq('날짜값(Date)', normDate_(new Date(2026, 10, 13)), '2026-11-13');
eq('시트 표시형 2026. 11. 3', normDate_('2026. 11. 3'), '2026-11-03');
eq('슬래시', normDate_('2026/1/5'), '2026-01-05');
eq('빈칸', normDate_(''), '');
eq('입력시각 Date', normStamp_(new Date(2026, 10, 13, 9, 5, 7)), '2026-11-13 09:05:07');
// 날짜값으로 읽힌 줄도 요약에 잡히는지
const asDate = [{ id: 'z', date: normDate_(new Date(2026, 10, 13)), payer: '정윤', amount: 8000, split: '반반', category: '식비', memo: '', createdAt: 'x', deleted: false }];
eq('날짜값 줄이 그날 합계에 잡힘', summarize_(asDate, '2026-11', P).days[0].total, 8000);

console.log(fail ? `\n${fail}/${n} 실패` : `${n}개 모두 통과`);
process.exit(fail ? 1 : 0);
