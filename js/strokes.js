// KanjiVG 획순 데이터를 불러와 한 획씩 그려 보여 줍니다.
// 데이터: https://kanjivg.tagaini.net/ (CC BY-SA 3.0) — GitHub raw에서 필요한 한자만 받아옵니다.
const SOURCE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/';
const cache = new Map();

const codeOf = (ch) => ch.codePointAt(0).toString(16).padStart(5, '0');

export async function fetchStrokes(ch) {
  if (cache.has(ch)) return cache.get(ch);
  const promise = fetch(`${SOURCE}${codeOf(ch)}.svg`)
    .then((r) => {
      if (!r.ok) throw new Error(`획순 데이터 없음 (${r.status})`);
      return r.text();
    })
    .then((svgText) => {
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      const paths = [...doc.querySelectorAll('path')].map((p) => p.getAttribute('d')).filter(Boolean);
      const numbers = [...doc.querySelectorAll('text')].map((t) => ({
        n: t.textContent,
        transform: t.getAttribute('transform'),
      }));
      if (!paths.length) throw new Error('획순 데이터가 비어 있습니다.');
      return { paths, numbers };
    });
  cache.set(ch, promise);
  promise.catch(() => cache.delete(ch));
  return promise;
}

const NS = 'http://www.w3.org/2000/svg';

/**
 * 획순 SVG를 그리고 컨트롤러를 돌려줍니다.
 * @returns {{play:()=>void, step:()=>void, reset:()=>void, showAll:()=>void, total:number, toggleNumbers:()=>void}}
 */
export function renderStrokes(container, data) {
  container.querySelector('svg')?.remove();
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 109 109');
  svg.setAttribute('role', 'img');
  const ghost = document.createElementNS(NS, 'g');
  const ink = document.createElementNS(NS, 'g');
  const nums = document.createElementNS(NS, 'g');
  nums.style.display = 'none';
  svg.append(ghost, ink, nums);

  const strokes = data.paths.map((d) => {
    const g = document.createElementNS(NS, 'path');
    g.setAttribute('d', d);
    g.setAttribute('class', 'stroke ghost');
    ghost.appendChild(g);
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', 'stroke');
    ink.appendChild(p);
    return p;
  });
  data.numbers.forEach(({ n, transform }) => {
    const t = document.createElementNS(NS, 'text');
    t.textContent = n;
    if (transform) t.setAttribute('transform', transform);
    nums.appendChild(t);
  });
  container.appendChild(svg);
  container.querySelector('.fallback')?.setAttribute('hidden', '');

  const lengths = strokes.map((p) => p.getTotalLength());
  let shown = 0;
  let timer = null;

  const setVisible = (i, visible, animate = false) => {
    const p = strokes[i];
    const len = lengths[i];
    p.style.transition = 'none';
    p.style.strokeDasharray = `${len} ${len}`;
    p.style.strokeDashoffset = visible && !animate ? '0' : `${len}`;
    if (visible && animate) {
      p.getBoundingClientRect(); // 리플로우 후 애니메이션 시작
      p.style.transition = `stroke-dashoffset ${Math.max(0.25, len / 120)}s ease-in-out`;
      p.style.strokeDashoffset = '0';
    }
  };

  const clearTimer = () => {
    clearTimeout(timer);
    timer = null;
  };
  const reset = () => {
    clearTimer();
    strokes.forEach((_, i) => setVisible(i, false));
    shown = 0;
  };
  const showAll = () => {
    clearTimer();
    strokes.forEach((_, i) => setVisible(i, true));
    shown = strokes.length;
  };
  const step = () => {
    clearTimer();
    if (shown >= strokes.length) reset();
    setVisible(shown, true, true);
    shown++;
  };
  const play = () => {
    reset();
    const tick = () => {
      if (shown >= strokes.length) return;
      setVisible(shown, true, true);
      const dur = Math.max(0.25, lengths[shown] / 120) * 1000;
      shown++;
      timer = setTimeout(tick, dur + 120);
    };
    tick();
  };
  const toggleNumbers = () => {
    nums.style.display = nums.style.display === 'none' ? '' : 'none';
  };

  showAll();
  return { play, step, reset, showAll, toggleNumbers, total: strokes.length, stop: clearTimer };
}
