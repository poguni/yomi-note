// 사전 데이터(data/words.json, data/kanji.json) 불러오기와 검색
import { toHiragana, isKanaOnly, KANJI_RE } from './text.js';

let words = [];
const byForm = new Map();
const byReading = new Map();
let kanjiTable = {};

function push(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export async function loadDict() {
  const [w, k] = await Promise.all([
    fetch('data/words.json').then((r) => r.json()),
    fetch('data/kanji.json').then((r) => r.json()),
  ]);
  words = w.map(([form, reading, en, jlpt]) => ({ form, reading, en, jlpt }));
  for (const e of words) {
    push(byForm, e.form, e);
    push(byReading, e.reading, e);
  }
  kanjiTable = k;
  return { words: words.length, kanji: Object.keys(k).length };
}

// 기본형·표기·읽기로 사전 항목을 찾습니다. 읽기가 맞는 항목을 먼저 돌려줍니다.
export function lookup(base, surface, reading) {
  const r = reading ? toHiragana(reading) : '';
  let found = byForm.get(base) || byForm.get(surface) || [];
  if (!found.length && isKanaOnly(base)) found = byReading.get(toHiragana(base)) || [];
  if (!found.length && isKanaOnly(surface)) found = byReading.get(toHiragana(surface)) || [];
  if (r && found.length > 1) {
    const exact = found.filter((e) => e.reading === r || r.startsWith(e.reading.slice(0, -1)));
    if (exact.length) found = [...exact, ...found.filter((e) => !exact.includes(e))];
  }
  return found.slice(0, 4);
}

export function jlptOfWord(base, surface, reading) {
  const hit = lookup(base, surface, reading)[0];
  return hit ? hit.jlpt : 0;
}

export function kanjiInfo(ch) {
  const k = kanjiTable[ch];
  if (!k) return { ch, strokes: 0, jlpt: 0, grade: 0, freq: 0, on: [], kun: [], meanings: '', missing: true };
  const [strokes, jlpt, grade, freq, on, kun, meanings] = k;
  return {
    ch, strokes, jlpt, grade, freq,
    on: on ? on.split(',') : [],
    kun: kun ? kun.split(',') : [],
    meanings,
  };
}

export function allKanji() {
  return Object.keys(kanjiTable);
}

// 해당 한자가 들어간 예시 단어(쉬운 급수 우선)
export function wordsWithKanji(ch, limit = 8) {
  const out = [];
  for (const e of words) {
    if (e.form.includes(ch)) out.push(e);
  }
  out.sort((a, b) => (b.jlpt || -1) - (a.jlpt || -1) || a.form.length - b.form.length);
  return out.slice(0, limit);
}

export function kanjiIn(text) {
  return [...new Set(text.match(new RegExp(KANJI_RE.source, 'g')) || [])];
}
