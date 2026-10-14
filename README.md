# 요미노트 YomiNote

일본어 글을 붙여 넣으면 **후리가나**와 **단어 뜻·JLPT 급수**를 보여 주고, 모르는 단어와 한자를 **나만의 단어장**에 모아 두는 개인용 학습 앱입니다.
서버·로그인·DB 없이 정적 파일만으로 동작하며, 모든 데이터는 브라우저의 `localStorage`에 저장됩니다.

## 주요 기능

| 기능 | 설명 |
| --- | --- |
| 후리가나 자동 표시 | kuromoji.js 형태소 분석으로 한자 부분에만 후리가나를 붙입니다. 켜기/끄기, “N5 단어는 숨기기”처럼 급수별로 숨기기, 단어장에서 ‘외웠어요’로 표시한 단어는 자동으로 숨깁니다. |
| 단어 클릭 → 뜻 | 기본형·품사·활용형, 영어 뜻(JMdict 기반), JLPT 급수, 네이버 일본어사전·Jisho·파파고(문장 번역) 바로가기 |
| 나만의 단어장 | 단어·한자를 따로 관리, 한국어 뜻 직접 입력, 발견한 문장(예문) 자동 저장, 외우는 중/외웠어요 상태, 검색·JLPT·상태 필터, 정렬, 직접 추가 |
| 일본어 읽어 주기(TTS) | 본문 전체(읽는 문장 강조), 단어, 문장, 단어장 목록 읽기. 속도 조절과 음성 선택 |
| 한자 카드 | 획순 애니메이션(KanjiVG), 음독·훈독·뜻·획수·학년, 그 한자가 들어간 단어. “지금 읽는 글 / 단어장 / JLPT 전체” + JLPT 급수 필터 |
| 읽기 속도 기록 | 읽기 시작 → 다 읽었어요로 분당 글자 수를 기록하고 그래프로 보여 줍니다. |
| 내보내기 | 엑셀(.xlsx, 단어·한자 시트), 워드(.docx), PDF(인쇄 → “PDF로 저장”), CSV, 본문(후리가나 포함) PDF |
| 백업·복원 | 전체 데이터를 JSON 파일로 저장하고 다른 브라우저에서 불러올 수 있습니다. |

## 실행하기

사전 파일을 `fetch`로 불러오므로 `index.html`을 더블클릭(file://)하면 동작하지 않습니다. 간단한 웹 서버로 여세요.

```bash
cd yomi-note
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

## GitHub Pages로 배포하기

1. 이 저장소를 GitHub에 푸시합니다.
2. 저장소 **Settings → Pages**에서 *Source*를 `Deploy from a branch`, 브랜치를 `main`(루트 `/`)으로 지정합니다.
3. 잠시 후 `https://<아이디>.github.io/<저장소 이름>/yomi-note/` 에서 열립니다.

처음 열 때 형태소 사전(약 18MB)을 내려받으며, 이후에는 브라우저 캐시를 사용합니다.

## 폴더 구조

```
yomi-note/
├── index.html
├── css/style.css
├── js/
│   ├── app.js        # 화면과 이벤트
│   ├── analyzer.js   # kuromoji 형태소 분석
│   ├── dict.js       # 단어·한자 사전 검색
│   ├── text.js       # 후리가나 정렬 등 문자열 도우미
│   ├── tts.js        # Web Speech API 읽어 주기
│   ├── strokes.js    # KanjiVG 획순
│   ├── export.js     # 엑셀·워드·PDF·CSV 내보내기
│   └── store.js      # localStorage 저장
├── data/             # 빌드된 사전 (words.json 약 400KB, kanji.json 약 250KB)
├── tools/build-data.mjs
└── vendor/           # kuromoji(사전 포함), SheetJS, docx
```

## 사전 데이터 다시 만들기 / 확장하기

기본 내장 사전은 JLPT N5~N1 단어 약 8천 개와 한자 약 3천 자입니다. 더 많은 단어가 필요하면 [jmdict-simplified](https://github.com/scriptin/jmdict-simplified/releases)의 `jmdict-eng-common-*.json`(일반 단어 약 2만 2천 개)을 내려받아 함께 빌드하세요.

```bash
# 원본 데이터 받기
mkdir -p /tmp/yomi && cd /tmp/yomi
for n in 1 2 3 4 5; do curl -sLO https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/n$n.csv; done
curl -sLO https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json

# 빌드 (JMdict는 선택)
cd <저장소>/yomi-note
node tools/build-data.mjs --jlpt /tmp/yomi --kanji /tmp/yomi/kanji.json [--jmdict /tmp/yomi/jmdict-eng-common-x.y.z.json]
```

## 알아 두면 좋은 점

- **한국어 뜻**: 공개된 일한 사전 데이터가 없어 한국어 뜻은 직접 입력하는 방식입니다. 단어 패널의 네이버 사전 링크를 참고해 적어 두면 단어장·내보내기에 함께 저장됩니다.
- **TTS 음성**: 브라우저·운영체제에 설치된 일본어 음성을 사용합니다. 음성이 없으면 데이터 탭의 안내대로 일본어 음성을 설치하세요. (Chrome·Edge·Safari 권장)
- **획순**: 한자 카드를 열 때 GitHub(raw.githubusercontent.com)에서 해당 한자의 KanjiVG 파일만 받아옵니다. 오프라인이면 획순 대신 글자만 보입니다.
- **저장 공간**: localStorage는 보통 5MB 정도라 단어 수천 개는 충분합니다. 브라우저 데이터를 지우면 사라지므로 가끔 백업 파일을 저장하세요.
- **형태소 분석 한계**: IPADIC 기반이라 고유명사·신조어는 읽기가 틀릴 수 있습니다.

## 라이선스와 출처

- [kuromoji.js](https://github.com/takuyaa/kuromoji.js) — Apache-2.0 (IPADIC 포함, `vendor/kuromoji/NOTICE.md`). 서버가 이미 압축을 풀어 보낸 경우에도 동작하도록 사전 로더를 한 줄 수정했습니다(`[yomi-note patch]`).
- [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks) — MIT (JLPT 단어·영어 뜻)
- [kanji-data](https://github.com/davidluzgouveia/kanji-data) — MIT, [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) 기반 (CC BY-SA 4.0, EDRDG)
- [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) — CC BY-SA 4.0, EDRDG
- [KanjiVG](https://kanjivg.tagaini.net/) — CC BY-SA 3.0, Ulrich Apel
- [SheetJS CE](https://sheetjs.com/) — Apache-2.0 · [docx](https://docx.js.org/) — MIT
