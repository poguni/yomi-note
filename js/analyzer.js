// kuromoji.js 형태소 분석기 래퍼
import { toHiragana } from './text.js';

let tokenizer = null;
let loading = null;

export function initAnalyzer() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    // eslint-disable-next-line no-undef
    kuromoji.builder({ dicPath: 'vendor/kuromoji/dict/' }).build((err, t) => {
      if (err) {
        loading = null;
        reject(err);
        return;
      }
      tokenizer = t;
      resolve(t);
    });
  });
  return loading;
}

const POS_KO = {
  名詞: '명사', 動詞: '동사', 形容詞: 'い형용사', 副詞: '부사', 助詞: '조사', 助動詞: '조동사',
  連体詞: '연체사', 接続詞: '접속사', 感動詞: '감동사', 記号: '기호', 接頭詞: '접두사', フィラー: '필러',
};
const DETAIL_KO = { 形容動詞語幹: 'な형용사', 固有名詞: '고유명사', 代名詞: '대명사', 数: '수사', サ変接続: 'する동사 어간' };

export function posLabel(t) {
  const detail = DETAIL_KO[t.posDetail];
  const base = POS_KO[t.pos] || t.pos || '';
  return detail ? `${base} · ${detail}` : base;
}

/**
 * 글을 문단 → 토큰으로 나눕니다.
 * 문장 번호(sentence)는 TTS가 읽는 문장을 강조할 때 씁니다.
 */
export function analyze(text) {
  if (!tokenizer) throw new Error('분석기가 아직 준비되지 않았습니다.');
  const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n+/).filter((p) => p.trim());
  let sentence = 0;
  let index = 0;
  const sentences = [];
  const result = paragraphs.map((para) => {
    const tokens = tokenizer.tokenize(para).map((t) => {
      const tok = {
        i: index++,
        surface: t.surface_form,
        base: t.basic_form && t.basic_form !== '*' ? t.basic_form : t.surface_form,
        reading: t.reading && t.reading !== '*' ? toHiragana(t.reading) : '',
        pos: t.pos,
        posDetail: t.pos_detail_1,
        conj: t.conjugated_form !== '*' ? t.conjugated_form : '',
        sentence,
      };
      sentences[sentence] = (sentences[sentence] || '') + tok.surface;
      if (/[。！？!?]/.test(t.surface_form)) sentence++;
      return tok;
    });
    // 문단이 끝나면 문장도 끊습니다.
    if (sentences[sentence]) sentence++;
    return tokens;
  });
  return { paragraphs: result, sentences };
}

// 기본형의 읽기 (단어장 저장용): 기본형만 따로 분석해 읽기를 얻습니다.
export function readingOf(word) {
  if (!tokenizer || !word) return '';
  return tokenizer
    .tokenize(word)
    .map((t) => (t.reading && t.reading !== '*' ? toHiragana(t.reading) : t.surface_form))
    .join('');
}
