# 우리 가계부 (정윤 · 민서)

둘이 하루하루 쓴 돈을 적고 **정산**까지 하는 휴대폰 홈 화면 앱.

- **앱 주소**: https://endia4644.github.io/couple-budget/
- 기록은 정윤의 구글 시트(`기록` 탭)에 저장된다. 이 저장소에는 **화면만** 있고 지출 기록 · PIN은 없다.

## 휴대폰에 설치

1. 위 앱 주소를 연다. **카톡 안에서 열렸다면 Safari / Chrome으로 다시 열기.**
2. - 아이폰(Safari): 공유 버튼(□↑) → **홈 화면에 추가**
   - 안드로이드(Chrome): ⋮ → **앱 설치** (또는 홈 화면에 추가)
3. 홈 화면의 **가계부** 아이콘으로 열고, PIN 입력 → "나는 정윤 / 나는 민서" 선택 (처음 한 번만)

## 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 앱 화면 (`apps-script/Index.html`과 **같은 파일**) |
| `config.js` | 구글 Apps Script 웹 앱 주소 (`…/exec`) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png`, `apple-touch-icon.png` | 홈 화면 설치 · 빠른 실행 |
| `apps-script/Code.gs` | 구글 시트에 붙여넣는 서버 코드 (**PIN은 `0000` 자리표시** — 실제 PIN은 구글 쪽에만) |
| `apps-script/Index.html` | 구글 시트에 붙여넣는 화면 (구글 링크로 열 때용) |
| `apps-script/설치안내.md` | 구글 시트 · Apps Script 설치 방법 |
| `apps-script/*.js` | 검사: `node apps-script/test.js` (정산 계산), `preview.js` · `pwa_test.js` (화면) |

## 고칠 때

- 화면을 고치면 `index.html`과 `apps-script/Index.html`을 **똑같이** 맞추고, 구글 쪽에도 붙여넣은 뒤
  **배포 관리 → 새 버전**. 앱은 두 번 껐다 켜면 새 화면이 뜬다 (바로 보려면 `sw.js`의 `budget-v1` 숫자를 올림).
- Code.gs를 고치면 구글에 붙여넣고 **PIN을 실제 숫자로 바꾼 뒤** 새 버전 배포. 저장소엔 PIN을 올리지 않는다.
- 웹 앱 주소가 바뀌면(새 배포를 만든 경우) `config.js`만 고친다.
