// 단어장 내보내기: 엑셀(.xlsx) · 워드(.docx) · PDF(인쇄 → PDF로 저장) · CSV
import { escapeHtml, formatDate } from './text.js';

const STATUS_KO = { learning: '외우는 중', known: '외웠어요' };
const jlptLabel = (n) => (n ? `N${n}` : '급외');

export const WORD_COLUMNS = [
  ['표기', (w) => w.word],
  ['읽기', (w) => w.reading],
  ['한국어 뜻', (w) => w.ko],
  ['영어 뜻', (w) => w.en],
  ['품사', (w) => w.pos],
  ['JLPT', (w) => jlptLabel(w.jlpt)],
  ['상태', (w) => STATUS_KO[w.status] || ''],
  ['예문', (w) => w.context],
  ['추가일', (w) => formatDate(w.addedAt)],
];

export const KANJI_COLUMNS = [
  ['한자', (k) => k.word],
  ['음독', (k) => k.on],
  ['훈독', (k) => k.kun],
  ['한국어 뜻', (k) => k.ko],
  ['영어 뜻', (k) => k.en],
  ['획수', (k) => k.strokes || ''],
  ['JLPT', (k) => jlptLabel(k.jlpt)],
  ['상태', (k) => STATUS_KO[k.status] || ''],
  ['추가일', (k) => formatDate(k.addedAt)],
];

const rows = (list, cols) => list.map((item) => cols.map(([, get]) => get(item) ?? ''));
const stamp = () => new Date().toISOString().slice(0, 10);

const loaded = {};
function loadScript(src) {
  loaded[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => {
      delete loaded[src];
      reject(new Error(`${src} 를 불러오지 못했습니다.`));
    };
    document.head.appendChild(s);
  });
  return loaded[src];
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- 엑셀 ----------
export async function exportXlsx({ words, kanji }) {
  await loadScript('vendor/xlsx.full.min.js');
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const addSheet = (name, list, cols, widths) => {
    const ws = XLSX.utils.aoa_to_sheet([cols.map(([h]) => h), ...rows(list, cols)]);
    ws['!cols'] = widths.map((wch) => ({ wch }));
    ws['!autofilter'] = { ref: ws['!ref'] };
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  if (words.length || !kanji.length) addSheet('단어', words, WORD_COLUMNS, [14, 16, 22, 30, 12, 6, 10, 40, 11]);
  if (kanji.length) addSheet('한자', kanji, KANJI_COLUMNS, [6, 18, 22, 18, 26, 6, 6, 10, 11]);
  XLSX.writeFile(wb, `yominote-vocab-${stamp()}.xlsx`);
}

// ---------- 워드 ----------
export async function exportDocx({ words, kanji }) {
  await loadScript('vendor/docx.iife.js');
  const D = window.docx;
  const FONT = { ascii: 'Meiryo', eastAsia: 'Meiryo', hAnsi: 'Malgun Gothic', cs: 'Malgun Gothic' };
  const cell = (text, opts = {}) =>
    new D.TableCell({
      shading: opts.header ? { fill: 'F1E6E2' } : undefined,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: [
        new D.Paragraph({
          children: [new D.TextRun({ text: String(text ?? ''), bold: !!opts.header, size: opts.size || 20, font: FONT })],
        }),
      ],
    });
  const table = (list, cols) =>
    new D.Table({
      width: { size: 100, type: D.WidthType.PERCENTAGE },
      rows: [
        new D.TableRow({ tableHeader: true, children: cols.map(([h]) => cell(h, { header: true })) }),
        ...rows(list, cols).map(
          (r) => new D.TableRow({ children: r.map((v, i) => cell(v, { size: i === 0 ? 26 : 20 })) })
        ),
      ],
    });
  // 워드 표는 가로 폭이 좁으니 핵심 열만 넣습니다.
  const wordCols = WORD_COLUMNS.filter(([h]) => ['표기', '읽기', '한국어 뜻', '영어 뜻', 'JLPT', '예문'].includes(h));
  const kanjiCols = KANJI_COLUMNS.filter(([h]) => ['한자', '음독', '훈독', '한국어 뜻', '영어 뜻', 'JLPT'].includes(h));
  const heading = (text) => new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 }, children: [new D.TextRun({ text, font: FONT })] });
  const children = [
    new D.Paragraph({ heading: D.HeadingLevel.TITLE, children: [new D.TextRun({ text: '요미노트 일본어 단어장', font: FONT })] }),
    new D.Paragraph({ children: [new D.TextRun({ text: `${stamp()} · 단어 ${words.length}개 · 한자 ${kanji.length}자`, color: '777777', font: FONT })] }),
  ];
  if (words.length) children.push(heading('단어'), table(words, wordCols));
  if (kanji.length) children.push(heading('한자'), table(kanji, kanjiCols));
  const doc = new D.Document({
    creator: 'YomiNote',
    title: '요미노트 일본어 단어장',
    sections: [{
      properties: { page: { size: { orientation: D.PageOrientation.LANDSCAPE }, margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
      children,
    }],
  });
  downloadBlob(await D.Packer.toBlob(doc), `yominote-vocab-${stamp()}.docx`);
}

// ---------- PDF (브라우저 인쇄 기능으로 저장: 한글·일본어 글꼴이 깨지지 않습니다) ----------
export function printHtml(title, bodyHtml, extraCss = '') {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: "Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif; color:#222; font-size: 11pt; }
  .ja { font-family: "Yu Gothic","Hiragino Sans","Meiryo","Noto Sans JP",sans-serif; }
  h1 { font-size: 18pt; margin: 0 0 4px; } h2 { font-size: 13pt; margin: 18px 0 8px; border-bottom: 2px solid #b4483c; padding-bottom: 4px; }
  .sub { color:#777; font-size: 9pt; margin-bottom: 12px; }
  table { width:100%; border-collapse: collapse; }
  th, td { border:1px solid #ccc; padding:5px 7px; text-align:left; vertical-align: top; font-size: 9.5pt; }
  th { background:#f3ebe8; } tr { break-inside: avoid; }
  td.big { font-size: 14pt; white-space: nowrap; } td.rd { color:#b4483c; }
  ${extraCss}
</style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  const run = () => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => iframe.remove(), 1000);
  };
  // 글꼴 적용을 기다린 뒤 인쇄 창을 엽니다.
  setTimeout(run, 300);
}

export function exportPdf({ words, kanji }) {
  const table = (list, cols, jaCols) =>
    `<table><thead><tr>${cols.map(([h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows(list, cols)
      .map(
        (r) =>
          `<tr>${r
            .map((v, i) => {
              const cls = [i === 0 ? 'big' : '', i === 1 ? 'rd' : '', jaCols.includes(i) ? 'ja' : ''].join(' ').trim();
              return `<td class="${cls}">${escapeHtml(v)}</td>`;
            })
            .join('')}</tr>`
      )
      .join('')}</tbody></table>`;
  const wordCols = WORD_COLUMNS.filter(([h]) => ['표기', '읽기', '한국어 뜻', '영어 뜻', 'JLPT', '예문'].includes(h));
  const kanjiCols = KANJI_COLUMNS.filter(([h]) => ['한자', '음독', '훈독', '한국어 뜻', '영어 뜻', '획수', 'JLPT'].includes(h));
  let html = `<h1>요미노트 일본어 단어장</h1><div class="sub">${stamp()} · 단어 ${words.length}개 · 한자 ${kanji.length}자</div>`;
  if (words.length) html += `<h2>단어</h2>${table(words, wordCols, [0, 1, 5])}`;
  if (kanji.length) html += `<h2>한자</h2>${table(kanji, kanjiCols, [0, 1, 2])}`;
  printHtml(`yominote-vocab-${stamp()}`, html);
}

// ---------- CSV ----------
export function exportCsv({ words, kanji }) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const toCsv = (list, cols) => [cols.map(([h]) => h), ...rows(list, cols)].map((r) => r.map(esc).join(',')).join('\r\n');
  let out = '';
  if (words.length || !kanji.length) out += toCsv(words, WORD_COLUMNS);
  if (kanji.length) out += (out ? '\r\n\r\n' : '') + toCsv(kanji, KANJI_COLUMNS);
  // 엑셀에서 한글이 깨지지 않도록 BOM을 붙입니다.
  downloadBlob(new Blob(['\ufeff' + out], { type: 'text/csv;charset=utf-8' }), `yominote-vocab-${stamp()}.csv`);
}
