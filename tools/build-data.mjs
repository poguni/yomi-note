#!/usr/bin/env node
// 요미노트 사전 데이터 빌드 스크립트 (의존성 없음, Node 18+)
//
// 사용법:
//   node tools/build-data.mjs --jlpt <n1~n5.csv 폴더> --kanji <kanji.json> [--jmdict <jmdict-eng-common.json>]
//
// 입력 데이터
//   --jlpt   : jamsinclair/open-anki-jlpt-decks 의 src/n1.csv ~ n5.csv (MIT)
//   --kanji  : davidluzgouveia/kanji-data 의 kanji.json (MIT, KANJIDIC 기반)
//   --jmdict : (선택) scriptin/jmdict-simplified 의 jmdict-eng-common-*.json (CC BY-SA 4.0)
//              지정하면 JLPT 목록에 없는 일반 단어(약 2만 2천 개)까지 사전에 포함됩니다.
//
// 출력
//   data/words.json : [[표기, 읽기(히라가나), 영어 뜻, JLPT(1~5, 없으면 0)], ...]
//   data/kanji.json : { "漢": [획수, JLPT, 학년, 빈도순위, "음독,...", "훈독,...", "뜻; ..."] }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'data');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
if (!args.jlpt || !args.kanji) {
  console.error('사용법: node tools/build-data.mjs --jlpt <csv 폴더> --kanji <kanji.json> [--jmdict <json>]');
  process.exit(1);
}

const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const clean = (s) => s.replace(/[～〜~]/g, '').replace(/[(（][^)）]*[)）]/g, '').replace(/\s+/g, '').trim();

// 따옴표·쉼표를 처리하는 최소 CSV 파서
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

// ---------- 1) JLPT 단어 목록 ----------
const words = new Map(); // key: 표기|읽기
const jlptOf = new Map(); // key: 표기 → 가장 쉬운 급수
for (const level of [5, 4, 3, 2, 1]) {
  const file = path.join(args.jlpt, `n${level}.csv`);
  const [header, ...rows] = parseCsv(fs.readFileSync(file, 'utf8'));
  const iExp = header.indexOf('expression');
  const iRead = header.indexOf('reading');
  const iMean = header.indexOf('meaning');
  for (const r of rows) {
    const forms = clean(r[iExp]).split(/[;；、]/).map((s) => s.trim()).filter(Boolean);
    let reading = kataToHira(clean(r[iRead]).split(/[;；、]/)[0].trim());
    const meaning = r[iMean].trim();
    const isKana = (s) => /^[\u3040-\u30ffー・]+$/.test(s);
    // 원본 데이터에서 읽기가 비었거나 표기와 뒤바뀐 행 보정
    if (!reading || !isKana(reading)) {
      if (reading && isKana(forms[0])) forms[0] = reading;
      reading = kataToHira(clean(r[iExp]).split(/[;；、]/)[0]);
    }
    for (const form of forms) {
      const key = `${form}|${reading}`;
      if (!words.has(key)) words.set(key, [form, reading, meaning, level]);
      if (!jlptOf.has(form)) jlptOf.set(form, level);
    }
  }
}
console.log(`JLPT 단어: ${words.size}개`);

// ---------- 2) (선택) JMdict 일반 단어 병합 ----------
if (args.jmdict) {
  const jm = JSON.parse(fs.readFileSync(args.jmdict, 'utf8'));
  let added = 0;
  for (const w of jm.words) {
    const kana = w.kana.find((k) => k.common) || w.kana[0];
    if (!kana) continue;
    const reading = kataToHira(kana.text);
    const gloss = w.sense
      .slice(0, 3)
      .map((s) => s.gloss.filter((g) => g.lang === 'eng').map((g) => g.text).join(', '))
      .filter(Boolean)
      .join('; ');
    const forms = w.kanji.length ? w.kanji.filter((k) => k.common).map((k) => k.text) : [kana.text];
    for (const form of forms.length ? forms : [w.kanji[0].text]) {
      const key = `${form}|${reading}`;
      if (words.has(key)) continue;
      words.set(key, [form, reading, gloss, jlptOf.get(form) || 0]);
      added++;
    }
  }
  console.log(`JMdict에서 추가: ${added}개`);
}

// ---------- 3) 한자 데이터 ----------
const rawKanji = JSON.parse(fs.readFileSync(args.kanji, 'utf8'));
const kanji = {};
const stripMark = (s) => s.replace(/^[\^!]/, '');
for (const [ch, k] of Object.entries(rawKanji)) {
  // 상용·교육·JLPT 한자이거나 빈도 순위가 있는 한자만 포함해 용량을 줄입니다.
  if (!k.jlpt_new && !k.grade && !k.freq) continue;
  kanji[ch] = [
    k.strokes || 0,
    k.jlpt_new || 0,
    k.grade || 0,
    k.freq || 0,
    (k.readings_on || []).map(stripMark).join(','),
    (k.readings_kun || []).map(stripMark).join(','),
    (k.meanings || []).map(stripMark).join('; '),
  ];
}
console.log(`한자: ${Object.keys(kanji).length}자`);

fs.mkdirSync(outDir, { recursive: true });
const wordList = [...words.values()].sort((a, b) => (b[3] || 0) - (a[3] || 0) || a[1].localeCompare(b[1], 'ja'));
fs.writeFileSync(path.join(outDir, 'words.json'), JSON.stringify(wordList));
fs.writeFileSync(path.join(outDir, 'kanji.json'), JSON.stringify(kanji));
for (const f of ['words.json', 'kanji.json']) {
  const size = fs.statSync(path.join(outDir, f)).size;
  console.log(`→ data/${f} (${(size / 1024).toFixed(0)} KB)`);
}
