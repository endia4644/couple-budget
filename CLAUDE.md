# couple-budget

정윤 · 민서(사용자와 파트너) 둘이 쓰는 가계부 PWA. 사용자 이름은 **정윤**.
GitHub Pages(main 브랜치 루트)로 서빙, 데이터는 Google Apps Script 웹 앱(`config.js`의 주소) → 구글 시트.

- 항목: 식비 · 간식 · 쇼핑 · 기타 부대비용. 나누기: 반반 / 내 것 / 상대 것, 정산 기록.
- 화면은 날짜가 맨 위(하루 단위), 그날 합계·항목 4칸·내역 → 입력 → 정산 → 월 전체(‹ › 로 지난달).
- `index.html` == `apps-script/Index.html` (한 파일로 Apps Script 안 / PWA 둘 다 동작: `send()`가 google.script.run 또는 fetch).
- **PIN을 저장소에 올리지 말 것** — `apps-script/Code.gs`는 `'0000'` 자리표시. 공개 저장소다.
- 구글 쪽은 이 컨테이너에서 실행 불가(script.google.com 막힘). 검사는 node: `node apps-script/test.js`,
  화면은 `node apps-script/preview.js <폴더>`(Apps Script 모드), `node apps-script/pwa_test.js <폴더>`(앱 모드, 가짜 서버).
- 화면 바꾸면 사용자가 구글에 붙여넣고 **배포 관리 → 새 버전**을 해야 한다고 꼭 안내할 것. VERSION 상수로 옛 Code.gs 감지.
