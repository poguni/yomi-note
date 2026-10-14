// 요미노트 YomiNote — 메인
import { store } from './store.js';
import { initAnalyzer, analyze, posLabel, readingOf } from './analyzer.js';
import { loadDict, lookup, kanjiInfo, allKanji, wordsWithKanji, kanjiIn } from './dict.js';
import { escapeHtml, rubyHtml, hasKanji, isPunct, countChars, formatDuration, formatDate, kunLabel, toHiragana, KANJI_RE } from './text.js';
import * as tts from './tts.js';
import { exportXlsx, exportDocx, exportPdf, exportCsv, downloadBlob, printHtml } from './export.js';
import { fetchStrokes, renderStrokes } from './strokes.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const SAMPLE = `吾輩は猫である。名前はまだ無い。
どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。

今日は天気がいいので、友達と一緒に公園へ散歩に行きました。桜の花がとても綺麗で、たくさんの写真を撮りました。`;

const state = {
  analysis: null,
  tokens: [],
  text: '',
  selected: null,
  vocabSub: 'words',
  kanjiLevel: '',
  timer: null,
  dictReady: false,
  analyzerReady: false,
};

// ---------------------------------------------------------------- 공통
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

const jlptBadge = (n) => `<span class="jlpt ${n ? 'n' + n : ''}">${n ? 'N' + n : '급외'}</span>`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function speakOpts(extra = {}) {
  return { rate: store.settings.rate, voice: store.settings.voice, ...extra };
}
function say(text) {
  if (!tts.ttsSupported()) return toast('이 브라우저는 음성 읽기를 지원하지 않습니다.');
  if (!tts.japaneseVoices().length) toast('일본어 음성이 없어 기본 음성으로 읽습니다. 데이터 탭의 안내를 확인하세요.');
  tts.speak(text, speakOpts());
}

// ---------------------------------------------------------------- 탭
function showTab(name) {
  $$('.tabs [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $$('.panel').forEach((p) => (p.hidden = p.id !== `tab-${name}`));
  if (name === 'vocab') renderVocab();
  if (name === 'kanji') renderKanjiGrid();
  if (name === 'speed') renderSpeed();
  if (name === 'data') renderDataTab();
  try { history.replaceState(null, '', `#${name}`); } catch { /* file:// 등 */ }
}

// ---------------------------------------------------------------- 단어장 데이터
const findWord = (word) => store.vocab.words.find((w) => w.word === word);
const findKanji = (ch) => store.vocab.kanji.find((k) => k.word === ch);

function updateCounts() {
  const nw = store.vocab.words.length;
  const nk = store.vocab.kanji.length;
  $('#vocab-count').textContent = nw + nk;
  $('#cnt-words').textContent = nw;
  $('#cnt-kanji').textContent = nk;
}

function addWord(item) {
  const existing = findWord(item.word);
  if (existing) {
    Object.assign(existing, Object.fromEntries(Object.entries(item).filter(([, v]) => v)));
  } else {
    store.vocab.words.unshift({ id: uid(), status: 'learning', addedAt: new Date().toISOString(), ko: '', en: '', pos: '', context: '', jlpt: 0, ...item });
  }
  store.save('vocab');
  updateCounts();
}

function addKanji(ch, extra = {}) {
  const info = kanjiInfo(ch);
  if (findKanji(ch)) {
    toast(`「${ch}」은(는) 이미 단어장에 있어요.`);
    return;
  }
  store.vocab.kanji.unshift({
    id: uid(),
    word: ch,
    on: info.on.join('、'),
    kun: info.kun.map(kunLabel).join('、'),
    en: info.meanings,
    ko: '',
    strokes: info.strokes,
    jlpt: info.jlpt,
    status: 'learning',
    addedAt: new Date().toISOString(),
    ...extra,
  });
  store.save('vocab');
  updateCounts();
  toast(`한자 「${ch}」을(를) 단어장에 추가했어요.`);
}

function removeItem(kind, id) {
  store.vocab[kind] = store.vocab[kind].filter((x) => x.id !== id);
  store.save('vocab');
  updateCounts();
}

// ---------------------------------------------------------------- 읽기
async function boot() {
  applySettingsToUi();
  updateCounts();
  const status = $('#analyzer-status');
  status.textContent = '사전 불러오는 중… (처음 한 번은 약 18MB를 내려받아요)';

  loadDict()
    .then((n) => {
      state.dictReady = true;
      console.info(`사전: 단어 ${n.words}개, 한자 ${n.kanji}자`);
      if (state.analysis) renderReader();
    })
    .catch((e) => {
      console.error(e);
      toast('뜻 사전을 불러오지 못했습니다.');
    });

  tts.loadVoices().then(fillVoices);

  try {
    await initAnalyzer();
    state.analyzerReady = true;
    status.textContent = '준비 완료';
    status.className = 'status ready';
    if (store.lastText) {
      $('#source-text').value = store.lastText;
      runAnalysis();
    }
  } catch (e) {
    console.error(e);
    status.textContent = '형태소 사전을 불러오지 못했습니다. 웹 서버(예: GitHub Pages)에서 열었는지 확인하세요.';
    status.className = 'status error';
  }
}

function runAnalysis() {
  const text = $('#source-text').value.trim();
  if (!text) return toast('먼저 일본어 글을 붙여 넣어 주세요.');
  if (!state.analyzerReady) return toast('형태소 사전을 불러오는 중입니다. 잠시만 기다려 주세요.');
  state.text = text;
  state.analysis = analyze(text);
  state.tokens = state.analysis.paragraphs.flat();
  store.lastText = text;
  store.save('lastText');
  $('#input-area').hidden = true;
  $('#reader-toolbar').hidden = false;
  $('#reader-hint').hidden = false;
  closeWordPanel();
  renderReader();
}

function tokenEntries(t) {
  if (!state.dictReady) return [];
  if (!('entries' in t)) t.entries = lookup(t.base, t.surface, t.reading);
  return t.entries;
}

function tokenJlpt(t) {
  return tokenEntries(t)[0]?.jlpt || 0;
}

function renderReader() {
  const s = store.settings;
  const reader = $('#reader');
  reader.classList.toggle('no-furigana', !s.furigana);
  reader.classList.toggle('highlight', s.highlight);
  reader.style.setProperty('--reader-size', `${s.fontSize}px`);
  if (!state.analysis) return;

  const html = state.analysis.paragraphs
    .map((tokens) => {
      const inner = tokens
        .map((t) => {
          if (isPunct(t.surface) || (t.pos === '記号' && !hasKanji(t.surface))) {
            return `<span class="tok punct" data-s="${t.sentence}">${escapeHtml(t.surface)}</span>`;
          }
          const saved = findWord(t.base) || findWord(t.surface);
          const level = tokenJlpt(t);
          // 쉬운 급수의 단어나 '외웠어요' 단어는 후리가나를 숨깁니다.
          const hideRt = (s.furiganaLevel && level && level >= s.furiganaLevel) || saved?.status === 'known';
          let ruby = rubyHtml(t.surface, t.reading);
          if (hideRt) ruby = ruby.replace(/<rt>/g, '<rt class="hide">');
          const cls = ['tok', saved ? 'in-vocab' : '', saved?.status === 'known' ? 'known' : ''].filter(Boolean).join(' ');
          return `<span class="${cls}" data-i="${t.i}" data-s="${t.sentence}" tabindex="0">${ruby}</span>`;
        })
        .join('');
      return `<p>${inner}</p>`;
    })
    .join('');
  reader.innerHTML = html;
  if (state.selected) reader.querySelector(`[data-i="${state.selected.i}"]`)?.classList.add('active');
}

// ---------------------------------------------------------------- 단어 패널
function sentenceOf(t) {
  return (state.analysis?.sentences[t.sentence] || '').trim();
}

function openWordPanel(t) {
  state.selected = t;
  $$('#reader .tok.active').forEach((el) => el.classList.remove('active'));
  $(`#reader [data-i="${t.i}"]`)?.classList.add('active');

  const entries = tokenEntries(t);
  const top = entries[0];
  const word = top?.form && (top.form === t.base || top.form === t.surface) ? top.form : t.base;
  const baseReading = top && top.form === word ? top.reading : t.base === t.surface ? t.reading : readingOf(t.base);
  const saved = findWord(word);
  const kanjiList = [...new Set(word.match(new RegExp(KANJI_RE.source, 'g')) || [])];
  const jlpt = top?.jlpt || 0;
  const q = encodeURIComponent(word);

  const panel = $('#word-panel');
  panel.innerHTML = `
    <div class="wp-head">
      <p class="wp-word" lang="ja">${rubyHtml(word, baseReading)}</p>
      <button class="wp-close" aria-label="닫기" data-act="close">✕</button>
    </div>
    <div class="wp-meta">
      ${jlptBadge(jlpt)} ${escapeHtml(posLabel(t))}
      ${t.surface !== word ? `· 본문 형태 <span class="ja" lang="ja">${escapeHtml(t.surface)}</span>${t.reading ? ` (<span class="ja" lang="ja">${escapeHtml(t.reading)}</span>)` : ''}` : ''}
      ${t.conj ? `· ${escapeHtml(t.conj)}` : ''}
    </div>
    <div class="wp-actions">
      <button class="btn small" data-act="say-word">🔊 단어</button>
      <button class="btn small" data-act="say-sentence">🔊 문장</button>
    </div>
    <div class="wp-section">
      <h3>영어 뜻 (JMdict)</h3>
      ${entries.length
        ? `<ol class="wp-en">${entries.map((e) => `<li><span lang="ja">${escapeHtml(e.form)}【${escapeHtml(e.reading)}】</span> ${escapeHtml(e.en)} ${jlptBadge(e.jlpt)}</li>`).join('')}</ol>`
        : `<p class="hint">${state.dictReady ? '내장 사전(JLPT 단어 약 8천 개)에 없는 단어예요. 아래 사전 링크를 이용해 보세요.' : '사전을 불러오는 중…'}</p>`}
    </div>
    <div class="wp-section">
      <h3>한국어 뜻 (내가 적는 뜻)</h3>
      <input class="wp-ko" id="wp-ko" placeholder="예) 고양이" value="${escapeHtml(saved?.ko || '')}">
      <div class="wp-links">
        <a href="https://ja.dict.naver.com/#/search?query=${q}" target="_blank" rel="noopener">네이버 일본어사전 ↗</a>
        <a href="https://jisho.org/search/${q}" target="_blank" rel="noopener">Jisho ↗</a>
        <a href="https://papago.naver.com/?sk=ja&tk=ko&st=${encodeURIComponent(sentenceOf(t))}" target="_blank" rel="noopener">문장 번역(파파고) ↗</a>
      </div>
    </div>
    <div class="wp-actions">
      ${saved
        ? `<button class="btn primary" data-act="save">✓ 뜻 저장</button>
           <button class="btn ${saved.status === 'known' ? 'on' : ''}" data-act="known">${saved.status === 'known' ? '외웠어요 ✓' : '외웠어요로 표시'}</button>
           <button class="btn ghost" data-act="remove">단어장에서 빼기</button>`
        : `<button class="btn primary" data-act="add">＋ 단어장에 추가</button>`}
    </div>
    ${kanjiList.length ? `
    <div class="wp-section">
      <h3>한자</h3>
      <div class="kchips">
        ${kanjiList.map((ch) => {
          const k = kanjiInfo(ch);
          return `<div class="kchip">
            <div class="kc" lang="ja" data-kanji="${ch}" title="한자 카드 열기">${ch}</div>
            <div class="kinfo">${jlptBadge(k.jlpt)} ${k.strokes ? `${k.strokes}획` : ''}<br>
              음 <span class="ja">${escapeHtml(k.on.join('、') || '-')}</span> · 훈 <span class="ja">${escapeHtml(k.kun.map(kunLabel).join('、') || '-')}</span><br>
              ${escapeHtml(k.meanings || '')}</div>
            <button class="btn small ${findKanji(ch) ? 'on' : ''}" data-add-kanji="${ch}">${findKanji(ch) ? '저장됨' : '＋ 모르는 한자'}</button>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}
  `;
  panel.hidden = false;
  $('.reader-layout').classList.add('with-panel');

  const collect = () => ({
    word,
    reading: baseReading || toHiragana(word),
    ko: $('#wp-ko').value.trim(),
    en: entries.filter((e) => e.form === word).map((e) => e.en).join(' / ') || top?.en || '',
    pos: posLabel(t),
    jlpt,
    context: sentenceOf(t),
  });

  panel.onclick = (ev) => {
    const btn = ev.target.closest('[data-act],[data-kanji],[data-add-kanji]');
    if (!btn) return;
    if (btn.dataset.kanji) return openKanji(btn.dataset.kanji);
    if (btn.dataset.addKanji) {
      addKanji(btn.dataset.addKanji, { context: sentenceOf(t) });
      return openWordPanel(t);
    }
    switch (btn.dataset.act) {
      case 'close': return closeWordPanel();
      case 'say-word': return say(word);
      case 'say-sentence': return say(sentenceOf(t));
      case 'add':
        addWord(collect());
        toast(`「${word}」을(를) 단어장에 추가했어요.`);
        renderReader();
        return openWordPanel(t);
      case 'save':
        saved.ko = $('#wp-ko').value.trim();
        store.save('vocab');
        return toast('뜻을 저장했어요.');
      case 'known':
        saved.status = saved.status === 'known' ? 'learning' : 'known';
        store.save('vocab');
        renderReader();
        return openWordPanel(t);
      case 'remove':
        removeItem('words', saved.id);
        renderReader();
        return openWordPanel(t);
    }
  };
  $('#wp-ko').onkeydown = (ev) => {
    if (ev.key === 'Enter') panel.querySelector('[data-act="save"],[data-act="add"]')?.click();
  };
}

function closeWordPanel() {
  state.selected = null;
  $('#word-panel').hidden = true;
  $('.reader-layout').classList.remove('with-panel');
  $$('#reader .tok.active').forEach((el) => el.classList.remove('active'));
}

// ---------------------------------------------------------------- 한자 카드
let strokeCtl = null;
async function openKanji(ch) {
  const k = kanjiInfo(ch);
  const examples = state.dictReady ? wordsWithKanji(ch, 8) : [];
  const saved = findKanji(ch);
  const dlg = $('#kanji-dialog');
  $('#kanji-dialog-body').innerHTML = `
    <div class="kd">
      <div class="kd-top">
        <div>
          <div class="stroke-box" id="stroke-box"><div class="fallback" lang="ja">${ch}</div></div>
          <div class="kd-controls">
            <button class="btn small" data-s="play">▶ 획순</button>
            <button class="btn small" data-s="step">한 획씩</button>
            <button class="btn small" data-s="num">번호</button>
          </div>
        </div>
        <div class="kd-info">
          <dl>
            <dt>JLPT</dt><dd>${jlptBadge(k.jlpt)}</dd>
            <dt>획수</dt><dd>${k.strokes || '-'}획 ${k.grade ? `· ${k.grade <= 6 ? `초등 ${k.grade}학년` : '상용한자'}` : ''}</dd>
            <dt>음독</dt><dd lang="ja">${escapeHtml(k.on.join('、') || '-')}</dd>
            <dt>훈독</dt><dd lang="ja">${escapeHtml(k.kun.map(kunLabel).join('、') || '-')}</dd>
            <dt>뜻</dt><dd>${escapeHtml(k.meanings || '-')}</dd>
          </dl>
          <div class="kd-controls">
            <button class="btn small" data-s="say">🔊 읽기</button>
            <a class="btn small" href="https://ja.dict.naver.com/#/search?query=${encodeURIComponent(ch)}" target="_blank" rel="noopener">네이버 ↗</a>
          </div>
        </div>
      </div>
      ${examples.length ? `<div class="kd-words"><h3>이 한자가 들어간 단어</h3><ul>
        ${examples.map((e) => `<li><span class="ja" lang="ja">${escapeHtml(e.form)}</span><span class="rd" lang="ja">${escapeHtml(e.reading)}</span>${jlptBadge(e.jlpt)}<span class="en">${escapeHtml(e.en)}</span></li>`).join('')}
      </ul></div>` : ''}
      <div class="kd-foot">
        <span class="kd-credit">획순: KanjiVG (CC BY-SA 3.0)</span>
        <span>
          <button class="btn ${saved ? 'on' : 'primary'}" data-s="add">${saved ? '단어장에 있음' : '＋ 단어장에 추가'}</button>
          <button class="btn" data-s="close">닫기</button>
        </span>
      </div>
    </div>`;
  if (!dlg.open) dlg.showModal();
  strokeCtl?.stop();
  strokeCtl = null;

  dlg.onclick = (ev) => {
    if (ev.target === dlg) return dlg.close();
    const b = ev.target.closest('[data-s]');
    if (!b) return;
    const act = b.dataset.s;
    if (act === 'close') return dlg.close();
    if (act === 'say') return say([...k.on, ...k.kun.map((r) => r.replace(/[.-]/g, ''))].join('、') || ch);
    if (act === 'add') {
      if (!saved) {
        addKanji(ch);
        openKanji(ch);
        if (!$('#tab-kanji').hidden) renderKanjiGrid();
        if (state.selected) openWordPanel(state.selected);
      }
      return;
    }
    if (!strokeCtl) return toast('획순 데이터를 불러오는 중이거나 없습니다.');
    if (act === 'play') strokeCtl.play();
    if (act === 'step') strokeCtl.step();
    if (act === 'num') strokeCtl.toggleNumbers();
  };

  try {
    const data = await fetchStrokes(ch);
    const box = $('#stroke-box');
    if (!box || !dlg.open) return;
    strokeCtl = renderStrokes(box, data);
    strokeCtl.play();
  } catch (e) {
    console.warn(e);
  }
}

// ---------------------------------------------------------------- 단어장 화면
function filteredVocab(kind) {
  const q = $('#vocab-search').value.trim().toLowerCase();
  const lv = $('#vocab-jlpt').value;
  const st = $('#vocab-status').value;
  const sort = $('#vocab-sort').value;
  let list = store.vocab[kind].filter((w) => {
    if (lv !== '' && String(w.jlpt || 0) !== lv) return false;
    if (st && w.status !== st) return false;
    if (q) {
      const hay = [w.word, w.reading, w.ko, w.en, w.on, w.kun, w.context].join(' ').toLowerCase();
      if (!hay.includes(q) && !hay.includes(toHiragana(q))) return false;
    }
    return true;
  });
  const by = {
    new: (a, b) => b.addedAt.localeCompare(a.addedAt),
    old: (a, b) => a.addedAt.localeCompare(b.addedAt),
    kana: (a, b) => (a.reading || a.on || a.word).localeCompare(b.reading || b.on || b.word, 'ja'),
    jlpt: (a, b) => (b.jlpt || 0) - (a.jlpt || 0),
  }[sort];
  return list.sort(by);
}

function renderVocab() {
  const kind = state.vocabSub;
  $$('.subtab').forEach((b) => b.classList.toggle('active', b.dataset.sub === kind));
  const list = filteredVocab(kind);
  const box = $('#vocab-list');
  if (!store.vocab[kind].length) {
    box.innerHTML = `<div class="empty">아직 ${kind === 'words' ? '단어' : '한자'}가 없어요.<br>읽기 탭에서 단어를 눌러 <b>＋ 단어장에 추가</b>해 보세요.</div>`;
    return;
  }
  if (!list.length) {
    box.innerHTML = '<div class="empty">조건에 맞는 항목이 없어요.</div>';
    return;
  }
  box.innerHTML = list
    .map((w) => {
      const ctx = w.context
        ? escapeHtml(w.context).replace(escapeHtml(w.word), `<mark>${escapeHtml(w.word)}</mark>`)
        : '';
      const head =
        kind === 'words'
          ? `<div class="vw" lang="ja">${escapeHtml(w.word)}</div><div class="vr" lang="ja">${escapeHtml(w.reading || '')}</div>`
          : `<div class="vw kanji" lang="ja" data-open="${escapeHtml(w.word)}">${escapeHtml(w.word)}</div>
             <div class="vr" lang="ja">${escapeHtml(w.on || '')}${w.kun ? ` / ${escapeHtml(w.kun)}` : ''}</div>`;
      return `<div class="vcard ${w.status === 'known' ? 'known' : ''}" data-id="${w.id}">
        <div>${head}</div>
        <div class="vbody">
          <input class="vko" data-field="ko" value="${escapeHtml(w.ko || '')}" placeholder="한국어 뜻 입력">
          <div class="ven">${jlptBadge(w.jlpt)} ${w.pos ? escapeHtml(w.pos) + ' · ' : ''}${escapeHtml(w.en || '')}${w.strokes ? ` · ${w.strokes}획` : ''}</div>
          ${ctx ? `<div class="vctx" lang="ja">${ctx}</div>` : ''}
          <div class="vdate">${formatDate(w.addedAt)} 추가</div>
        </div>
        <div class="vact">
          <button class="btn small" data-act="say">🔊</button>
          <button class="btn small ${w.status === 'known' ? 'on' : ''}" data-act="known">${w.status === 'known' ? '외웠어요 ✓' : '외우는 중'}</button>
          <button class="btn small ghost" data-act="del">삭제</button>
        </div>
      </div>`;
    })
    .join('');
}

function onVocabClick(ev) {
  const card = ev.target.closest('.vcard');
  if (!card) return;
  const kind = state.vocabSub;
  const item = store.vocab[kind].find((x) => x.id === card.dataset.id);
  if (!item) return;
  if (ev.target.dataset.open) return openKanji(ev.target.dataset.open);
  const act = ev.target.closest('[data-act]')?.dataset.act;
  if (act === 'say') say(item.word);
  if (act === 'known') {
    item.status = item.status === 'known' ? 'learning' : 'known';
    store.save('vocab');
    renderVocab();
  }
  if (act === 'del' && confirm(`「${item.word}」을(를) 삭제할까요?`)) {
    removeItem(kind, item.id);
    renderVocab();
  }
}

function onVocabInput(ev) {
  const input = ev.target.closest('[data-field]');
  if (!input) return;
  const card = input.closest('.vcard');
  const item = store.vocab[state.vocabSub].find((x) => x.id === card.dataset.id);
  if (!item) return;
  item[input.dataset.field] = input.value.trim();
  store.save('vocab');
}

function onManualAdd(ev) {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const word = String(f.get('word')).trim();
  if (!word) return;
  const ko = String(f.get('ko')).trim();
  const en = String(f.get('en')).trim();
  if ([...word].length === 1 && hasKanji(word)) {
    addKanji(word, { ko, ...(en ? { en } : {}) });
    state.vocabSub = 'kanji';
  } else {
    const entry = state.dictReady ? lookup(word, word, '')[0] : null;
    const reading = String(f.get('reading')).trim() || entry?.reading || readingOf(word);
    addWord({ word, reading: toHiragana(reading), ko, en: en || entry?.en || '', jlpt: entry?.jlpt || 0 });
    state.vocabSub = 'words';
    toast(`「${word}」을(를) 추가했어요.`);
  }
  ev.target.reset();
  renderVocab();
}

async function onExport(type) {
  const scope = $('#export-scope').value;
  const data =
    scope === 'current'
      ? { words: state.vocabSub === 'words' ? filteredVocab('words') : [], kanji: state.vocabSub === 'kanji' ? filteredVocab('kanji') : [] }
      : { words: store.vocab.words, kanji: store.vocab.kanji };
  if (!data.words.length && !data.kanji.length) return toast('내보낼 항목이 없어요.');
  try {
    if (type === 'xlsx') await exportXlsx(data);
    if (type === 'docx') await exportDocx(data);
    if (type === 'pdf') exportPdf(data);
    if (type === 'csv') exportCsv(data);
    if (type !== 'pdf') toast('파일을 저장했어요.');
    else toast('인쇄 창에서 대상(프린터)을 “PDF로 저장”으로 고르세요.');
  } catch (e) {
    console.error(e);
    toast(`내보내기 실패: ${e.message}`);
  }
}

// ---------------------------------------------------------------- 한자 카드 그리드
function renderKanjiGrid() {
  const source = $('#kanji-source').value;
  const lv = state.kanjiLevel;
  const q = $('#kanji-search').value.trim().toLowerCase();
  let chars;
  if (source === 'text') chars = kanjiIn(state.text || '');
  else if (source === 'vocab') chars = [...new Set([...store.vocab.kanji.map((k) => k.word), ...store.vocab.words.flatMap((w) => kanjiIn(w.word))])];
  else chars = allKanji().filter((c) => kanjiInfo(c).jlpt).sort((a, b) => kanjiInfo(b).jlpt - kanjiInfo(a).jlpt || kanjiInfo(a).strokes - kanjiInfo(b).strokes);

  const infos = chars.map(kanjiInfo).filter((k) => {
    if (lv !== '' && String(k.jlpt) !== lv) return false;
    if (q) {
      const hay = [k.ch, k.on.join(' '), k.kun.join(' '), k.meanings].join(' ').toLowerCase();
      if (!hay.includes(q) && !hay.includes(toHiragana(q))) return false;
    }
    return true;
  });

  const levelCount = (n) => chars.filter((c) => kanjiInfo(c).jlpt === n).length;
  $('#kanji-summary').textContent = chars.length
    ? `${infos.length}자 표시 · 전체 ${chars.length}자 (N5 ${levelCount(5)} · N4 ${levelCount(4)} · N3 ${levelCount(3)} · N2 ${levelCount(2)} · N1 ${levelCount(1)} · 급외 ${levelCount(0)})`
    : source === 'text' ? '읽기 탭에서 글을 분석하면 그 글의 한자가 여기에 모여요.' : '단어장에 한자가 들어간 항목이 없어요.';

  $('#kanji-grid').innerHTML = infos
    .slice(0, 1500)
    .map((k) => `<div class="ktile" data-k="${k.ch}" tabindex="0">
        ${jlptBadge(k.jlpt)}${findKanji(k.ch) ? '<span class="saved" title="단어장에 있음">★</span>' : ''}
        <div class="kt" lang="ja">${k.ch}</div>
        <div class="km">${escapeHtml(k.meanings.split(';')[0] || '')}</div>
      </div>`)
    .join('');
}

// ---------------------------------------------------------------- 읽기 속도
function startTimer() {
  if (!state.analysis) return toast('먼저 글을 분석해 주세요.');
  state.timer = { start: Date.now(), id: setInterval(tickTimer, 500) };
  $('#btn-timer').textContent = '✅ 다 읽었어요';
  $('#btn-timer').classList.add('primary');
  $('#timer-display').hidden = false;
  $('#btn-timer-cancel').hidden = false;
  tickTimer();
}
function tickTimer() {
  if (!state.timer) return;
  $('#timer-display').textContent = formatDuration((Date.now() - state.timer.start) / 1000);
}
function stopTimer(save) {
  if (!state.timer) return;
  clearInterval(state.timer.id);
  const sec = (Date.now() - state.timer.start) / 1000;
  state.timer = null;
  $('#btn-timer').textContent = '⏱️ 읽기 시작';
  $('#btn-timer').classList.remove('primary');
  $('#timer-display').hidden = true;
  $('#btn-timer-cancel').hidden = true;
  if (!save) return;
  if (sec < 3) return toast('너무 짧아서 기록하지 않았어요.');
  const chars = countChars(state.text);
  const cpm = Math.round(chars / (sec / 60));
  store.speed.push({ id: uid(), date: new Date().toISOString(), title: state.text.replace(/\s+/g, ' ').slice(0, 24), chars, seconds: Math.round(sec), cpm });
  store.save('speed');
  toast(`${chars}자를 ${formatDuration(sec)}에 읽었어요 → 분당 ${cpm}자`);
}

function renderSpeed() {
  const list = store.speed;
  const tbody = $('#speed-table tbody');
  if (!list.length) {
    $('#speed-stats').innerHTML = '';
    $('#speed-chart').innerHTML = '<div class="empty">아직 읽기 기록이 없어요.</div>';
    tbody.innerHTML = '';
    return;
  }
  const avg = Math.round(list.reduce((s, r) => s + r.cpm, 0) / list.length);
  const best = Math.max(...list.map((r) => r.cpm));
  const recent = list.slice(-5);
  const recentAvg = Math.round(recent.reduce((s, r) => s + r.cpm, 0) / recent.length);
  const totalChars = list.reduce((s, r) => s + r.chars, 0);
  $('#speed-stats').innerHTML = [
    [list.length + '회', '읽은 횟수'],
    [avg + '자/분', '평균 속도'],
    [recentAvg + '자/분', '최근 5회 평균'],
    [best + '자/분', '최고 기록'],
    [totalChars.toLocaleString() + '자', '읽은 글자 수'],
  ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');

  // 최근 20회 막대그래프
  const data = list.slice(-20);
  const W = 600, H = 200, pad = 28;
  const max = Math.max(...data.map((r) => r.cpm), avg) * 1.15;
  const bw = (W - pad * 2) / data.length;
  const barW = Math.min(bw * 0.7, 36);
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  $('#speed-chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="읽기 속도 추이">
    ${data.map((r, i) => `<rect class="bar ${i === data.length - 1 ? 'last' : ''}" x="${pad + i * bw + (bw - barW) / 2}" y="${y(r.cpm)}" width="${barW}" height="${H - pad - y(r.cpm)}" rx="3"><title>${formatDate(r.date)} · ${r.cpm}자/분</title></rect>
      <text x="${pad + i * bw + bw / 2}" y="${y(r.cpm) - 4}" text-anchor="middle">${r.cpm}</text>`).join('')}
    <line class="avg" x1="${pad}" x2="${W - pad}" y1="${y(avg)}" y2="${y(avg)}"/>
    <text x="${W - pad}" y="${y(avg) - 4}" text-anchor="end">평균 ${avg}</text>
    <text x="${pad}" y="${H - 8}">최근 ${data.length}회 (자/분)</text>
  </svg>`;

  tbody.innerHTML = [...list].reverse().map((r) => `<tr>
      <td>${formatDate(r.date)}</td><td><span class="ja" lang="ja">${escapeHtml(r.title)}</span>…</td>
      <td class="num">${r.chars}</td><td class="num">${formatDuration(r.seconds)}</td><td class="num"><b>${r.cpm}</b></td>
      <td><button class="btn small ghost" data-del="${r.id}">삭제</button></td></tr>`).join('');
}

// ---------------------------------------------------------------- 데이터 탭
function renderDataTab() {
  const kb = (store.usageBytes() / 1024).toFixed(1);
  $('#storage-usage').textContent = `현재 사용량: 약 ${kb} KB (브라우저 한도는 보통 5MB 정도입니다)`;
  const voices = tts.japaneseVoices();
  $('#voice-info').innerHTML = !tts.ttsSupported()
    ? '이 브라우저는 음성 읽기(Web Speech API)를 지원하지 않습니다.'
    : voices.length
      ? `일본어 음성 ${voices.length}개를 찾았어요: ${voices.map((v) => escapeHtml(v.name)).join(', ')}`
      : '일본어 음성을 찾지 못했어요. <b>Windows</b>: 설정 → 시간 및 언어 → 언어 → 일본어 추가(음성 포함), <b>macOS/iOS</b>: 설정 → 손쉬운 사용 → 음성 콘텐츠 → 음성에서 일본어 음성 내려받기, <b>Android</b>: Google 텍스트 음성 변환에서 일본어 데이터 설치 후 브라우저를 다시 열어 주세요.';
}

function fillVoices(voices) {
  const sel = $('#opt-voice');
  sel.innerHTML = voices.length
    ? voices.map((v) => `<option value="${escapeHtml(v.voiceURI)}">${escapeHtml(v.name)}</option>`).join('')
    : '<option value="">일본어 음성 없음</option>';
  if (store.settings.voice && voices.some((v) => v.voiceURI === store.settings.voice)) sel.value = store.settings.voice;
}

// ---------------------------------------------------------------- 설정
function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  $('#opt-theme').value = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#1c1a18' : '#f6f2ea');
}

function applySettingsToUi() {
  const s = store.settings;
  applyTheme(s.theme);
  $('#opt-furigana').checked = s.furigana;
  $('#opt-furigana-level').value = String(s.furiganaLevel);
  $('#opt-highlight').checked = s.highlight;
  $('#opt-size').value = s.fontSize;
  $('#opt-rate').value = s.rate;
  $('#rate-out').textContent = Number(s.rate).toFixed(1);
}

function setSetting(key, value) {
  store.settings[key] = value;
  store.save('settings');
  renderReader();
}

// ---------------------------------------------------------------- TTS 전체 읽기
function readAll() {
  if (!state.analysis) return;
  if (!tts.ttsSupported()) return toast('이 브라우저는 음성 읽기를 지원하지 않습니다.');
  const sentences = state.analysis.sentences;
  $('#btn-tts-stop').disabled = false;
  const clear = () => $$('#reader .tok.speaking').forEach((el) => el.classList.remove('speaking'));
  tts.speakAll(sentences, speakOpts({
    onStart: (i) => {
      clear();
      const els = $$(`#reader [data-s="${i}"]`);
      els.forEach((el) => el.classList.add('speaking'));
      els[0]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    onEnd: () => {
      clear();
      $('#btn-tts-stop').disabled = true;
    },
  }));
}

// ---------------------------------------------------------------- 이벤트 연결
function bind() {
  $$('.tabs [role="tab"]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('[data-tab-link]').addEventListener('click', (e) => {
    e.preventDefault();
    showTab(e.currentTarget.dataset.tabLink);
  });
  $('#opt-theme').addEventListener('change', (e) => {
    store.settings.theme = e.target.value;
    store.save('settings');
    applyTheme(e.target.value);
  });

  $('#btn-analyze').addEventListener('click', runAnalysis);
  $('#source-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runAnalysis();
  });
  $('#btn-sample').addEventListener('click', () => ($('#source-text').value = SAMPLE));
  $('#btn-clear').addEventListener('click', () => {
    $('#source-text').value = '';
    $('#source-text').focus();
  });
  $('#btn-edit').addEventListener('click', () => {
    stopTimer(false);
    $('#input-area').hidden = false;
    $('#source-text').focus();
  });
  $('#btn-print-text').addEventListener('click', () => {
    const body = $('#reader').cloneNode(true);
    body.querySelectorAll('rt.hide').forEach((rt) => rt.remove());
    if (!store.settings.furigana) body.querySelectorAll('rt').forEach((rt) => rt.remove());
    printHtml('yominote-text', `<div class="ja reader">${body.innerHTML}</div>`,
      `.reader{font-size:16pt;line-height:2.4} .reader p{margin:0 0 .6em} rt{font-size:.5em;color:#b4483c}`);
  });

  $('#reader').addEventListener('click', (e) => {
    const el = e.target.closest('.tok[data-i]');
    if (!el) return;
    openWordPanel(state.tokens[Number(el.dataset.i)]);
  });
  $('#reader').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.tok[data-i]')) e.target.click();
  });

  $('#opt-furigana').addEventListener('change', (e) => setSetting('furigana', e.target.checked));
  $('#opt-furigana-level').addEventListener('change', (e) => setSetting('furiganaLevel', Number(e.target.value)));
  $('#opt-highlight').addEventListener('change', (e) => setSetting('highlight', e.target.checked));
  $('#opt-size').addEventListener('input', (e) => setSetting('fontSize', Number(e.target.value)));
  $('#opt-rate').addEventListener('input', (e) => {
    $('#rate-out').textContent = Number(e.target.value).toFixed(1);
    store.settings.rate = Number(e.target.value);
    store.save('settings');
  });
  $('#opt-voice').addEventListener('change', (e) => {
    store.settings.voice = e.target.value;
    store.save('settings');
  });
  $('#btn-tts-all').addEventListener('click', readAll);
  $('#btn-tts-stop').addEventListener('click', () => {
    tts.stop();
    $$('#reader .tok.speaking').forEach((el) => el.classList.remove('speaking'));
    $('#btn-tts-stop').disabled = true;
  });

  $('#btn-timer').addEventListener('click', () => (state.timer ? stopTimer(true) : startTimer()));
  $('#btn-timer-cancel').addEventListener('click', () => stopTimer(false));

  // 단어장
  $$('.subtab').forEach((b) => b.addEventListener('click', () => {
    state.vocabSub = b.dataset.sub;
    renderVocab();
  }));
  ['#vocab-search', '#vocab-jlpt', '#vocab-status', '#vocab-sort'].forEach((s) => $(s).addEventListener('input', renderVocab));
  $('#vocab-list').addEventListener('click', onVocabClick);
  $('#vocab-list').addEventListener('change', onVocabInput);
  $('#manual-add').addEventListener('submit', onManualAdd);
  $$('[data-export]').forEach((b) => b.addEventListener('click', () => onExport(b.dataset.export)));
  $('#btn-tts-vocab').addEventListener('click', () => {
    const list = filteredVocab(state.vocabSub);
    if (!list.length) return toast('읽을 항목이 없어요.');
    tts.speakAll(list.map((w) => w.word), speakOpts());
    toast(`${list.length}개 항목을 읽어요. 읽기 탭의 정지 버튼이나 다른 소리로 멈출 수 있어요.`);
  });

  // 한자
  $('#kanji-source').addEventListener('change', renderKanjiGrid);
  $('#kanji-search').addEventListener('input', renderKanjiGrid);
  $('#kanji-levels').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.kanjiLevel = chip.dataset.level;
    $$('#kanji-levels .chip').forEach((c) => c.classList.toggle('active', c === chip));
    renderKanjiGrid();
  });
  $('#kanji-grid').addEventListener('click', (e) => {
    const tile = e.target.closest('.ktile');
    if (tile) openKanji(tile.dataset.k);
  });
  $('#kanji-grid').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.ktile')) openKanji(e.target.dataset.k);
  });
  $('#kanji-dialog').addEventListener('close', () => {
    strokeCtl?.stop();
    if (!$('#tab-kanji').hidden) renderKanjiGrid();
  });

  // 읽기 기록
  $('#speed-table').addEventListener('click', (e) => {
    const id = e.target.dataset.del;
    if (!id || !confirm('이 기록을 삭제할까요?')) return;
    store.speed = store.speed.filter((r) => r.id !== id);
    store.save('speed');
    renderSpeed();
  });

  // 데이터
  $('#btn-backup').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.exportAll(), null, 2)], { type: 'application/json' });
    downloadBlob(blob, `yominote-backup-${new Date().toISOString().slice(0, 10)}.json`);
  });
  $('#file-restore').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm('현재 데이터를 백업 파일 내용으로 바꿀까요?')) return;
      store.importAll(data);
      applySettingsToUi();
      updateCounts();
      renderReader();
      renderDataTab();
      toast(`복원 완료: 단어 ${store.vocab.words.length}개, 한자 ${store.vocab.kanji.length}자`);
    } catch (err) {
      toast(`복원 실패: ${err.message}`);
    } finally {
      e.target.value = '';
    }
  });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('단어장과 읽기 기록을 모두 지울까요? 되돌릴 수 없습니다.')) return;
    store.reset();
    applySettingsToUi();
    updateCounts();
    renderReader();
    renderDataTab();
    toast('모든 데이터를 지웠어요.');
  });
  $('#btn-tts-test').addEventListener('click', () => say($('#tts-test').value));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#word-panel').hidden && !$('#kanji-dialog').open) closeWordPanel();
  });
}

bind();
const initialTab = location.hash.slice(1);
if (['reader', 'vocab', 'kanji', 'speed', 'data'].includes(initialTab)) showTab(initialTab);
boot();
