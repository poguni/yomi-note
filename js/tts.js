// 일본어 읽어 주기 (Web Speech API, 브라우저·OS에 설치된 음성 사용)
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let voices = [];
let session = 0;

export const ttsSupported = () => !!synth;

export function loadVoices() {
  return new Promise((resolve) => {
    if (!synth) return resolve([]);
    const pick = () => {
      voices = synth.getVoices().filter((v) => /^ja(-|_|$)/i.test(v.lang));
      return voices;
    };
    if (pick().length) return resolve(voices);
    // 크롬은 음성 목록을 비동기로 채웁니다.
    synth.addEventListener('voiceschanged', () => resolve(pick()), { once: true });
    setTimeout(() => resolve(pick()), 1500);
  });
}

export const japaneseVoices = () => voices;

function makeUtterance(text, { rate = 1, voice = '' } = {}) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = rate;
  const v = voices.find((x) => x.voiceURI === voice) || voices[0];
  if (v) u.voice = v;
  return u;
}

export function stop() {
  session++;
  if (synth) synth.cancel();
}

/**
 * 여러 문장을 차례로 읽습니다. 긴 글을 한 번에 넘기면 크롬에서 중간에 끊기는 문제가 있어
 * 문장 단위로 나눠 읽습니다.
 * @param {string[]} chunks
 * @param {{rate:number, voice:string, onStart?:(i:number)=>void, onEnd?:()=>void}} opts
 */
export function speakAll(chunks, opts = {}) {
  if (!synth) return;
  stop();
  const my = session;
  let i = 0;
  const next = () => {
    if (my !== session) return;
    while (i < chunks.length && !(chunks[i] || '').trim()) i++;
    if (i >= chunks.length) {
      opts.onEnd?.();
      return;
    }
    const idx = i++;
    const u = makeUtterance(chunks[idx], opts);
    u.onstart = () => my === session && opts.onStart?.(idx);
    u.onend = next;
    u.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      next();
    };
    synth.speak(u);
  };
  // cancel 직후 바로 speak 하면 무시되는 브라우저가 있어 한 틱 늦춥니다.
  setTimeout(next, 50);
}

export function speak(text, opts = {}) {
  speakAll([text], opts);
}
