// localStorage 저장소 (로그인·DB 없이 이 브라우저에만 저장)
const PREFIX = 'yominote.';
const KEYS = ['vocab', 'speed', 'settings', 'lastText'];

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export const DEFAULT_SETTINGS = {
  furigana: true,
  furiganaLevel: 0,
  highlight: true,
  fontSize: 22,
  rate: 1,
  voice: '',
  theme: 'light',
};

export const store = {
  vocab: read('vocab', { words: [], kanji: [] }),
  speed: read('speed', []),
  settings: { ...DEFAULT_SETTINGS, ...read('settings', {}) },
  lastText: read('lastText', ''),

  save(key) {
    const ok = write(key, this[key]);
    if (!ok && key !== 'lastText') {
      alert('저장 공간이 부족해 저장하지 못했습니다. 데이터 탭에서 백업 후 정리해 주세요.');
    }
    return ok;
  },

  exportAll() {
    return {
      app: 'YomiNote',
      version: 1,
      exportedAt: new Date().toISOString(),
      vocab: this.vocab,
      speed: this.speed,
      settings: this.settings,
    };
  },

  importAll(data) {
    if (!data || data.app !== 'YomiNote' || !data.vocab) throw new Error('요미노트 백업 파일이 아닙니다.');
    this.vocab = { words: data.vocab.words || [], kanji: data.vocab.kanji || [] };
    this.speed = data.speed || [];
    this.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    ['vocab', 'speed', 'settings'].forEach((k) => this.save(k));
  },

  reset() {
    KEYS.forEach((k) => localStorage.removeItem(PREFIX + k));
    this.vocab = { words: [], kanji: [] };
    this.speed = [];
    this.settings = { ...DEFAULT_SETTINGS };
    this.lastText = '';
  },

  usageBytes() {
    let total = 0;
    for (const k of KEYS) total += (localStorage.getItem(PREFIX + k) || '').length * 2;
    return total;
  },
};
