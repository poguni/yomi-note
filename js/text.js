// 문자열 도우미: 가나 변환, 후리가나 정렬, HTML 이스케이프
export const KANJI_RE = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/;
const KANA_ONLY_RE = /^[぀-ヿー・゛゜]+$/;

export const toHiragana = (s = '') =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

export const hasKanji = (s = '') => KANJI_RE.test(s);
export const isKanaOnly = (s = '') => KANA_ONLY_RE.test(s);

export const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 표기와 읽기를 맞춰 한자 부분에만 후리가나를 붙입니다.
 * 例) 食べる / たべる → [{text:'食', rt:'た'}, {text:'べる'}]
 */
export function alignFurigana(surface, reading) {
  if (!reading || !hasKanji(surface)) return [{ text: surface }];
  const hira = toHiragana(reading);
  // 표기를 한자 덩어리 / 가나 덩어리로 나눕니다.
  const parts = surface.match(new RegExp(`(${KANJI_RE.source}+|[^${KANJI_RE.source.slice(1, -1)}]+)`, 'g')) || [surface];
  const pattern = parts
    .map((p) => (hasKanji(p) ? '(.+?)' : `(${escapeRe(toHiragana(p))})`))
    .join('');
  const m = hira.match(new RegExp(`^${pattern}$`));
  if (!m) return [{ text: surface, rt: hira }];
  return parts.map((p, i) => (hasKanji(p) ? { text: p, rt: m[i + 1] } : { text: p }));
}

export function rubyHtml(surface, reading) {
  return alignFurigana(surface, reading)
    .map((s) => (s.rt ? `<ruby>${escapeHtml(s.text)}<rt>${escapeHtml(s.rt)}</rt></ruby>` : escapeHtml(s.text)))
    .join('');
}

// 읽기 속도용 글자 수: 공백·줄바꿈 제외
export const countChars = (s = '') => s.replace(/\s/g, '').length;

export const isPunct = (s = '') => /^[\s、。，．・：；？！「」『』（）()［］【】〈〉《》…‥ー〜～!?.,:;"'\-—―]+$/.test(s);

export function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// 한자 훈독 표기: か.つ → か(つ)
export const kunLabel = (k) => k.replace(/^(-?)([^.]+)\.(.+)$/, '$1$2($3)');
