import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';

const A4_W_PX = 794; // 210 mm at 96 dpi

/**
 * Page breaks (in CSS px from the top of the sheet) that never cut through an atomic block
 * (elements with class `pb`: table rows, cards, list rows); a section label (`pb-label`) moves
 * to the next page together with the block that follows it.
 */
export function pageBreaks(sheet: HTMLElement, pageHeightPx: number): number[] {
  const top0 = sheet.getBoundingClientRect().top;
  const groups = [...sheet.querySelectorAll('table, .ps-pack, .ps-kv')];
  const blocks = [...sheet.querySelectorAll<HTMLElement>('.pb')].map((el) => {
    const r = el.getBoundingClientRect();
    // rows of the same table / list form a group that is kept at least 3 rows together on either side of a break
    const g = el.closest('table, .ps-pack, .ps-kv');
    const inGroup = g && (el.tagName !== 'TR' || el.parentElement?.tagName === 'TBODY') && el.parentElement !== null && g !== el;
    return { top: r.top - top0, bottom: r.bottom - top0, label: el.classList.contains('pb-label'), table: inGroup ? groups.indexOf(g) : -1 };
  }).filter((x) => x.bottom > x.top);
  const total = sheet.scrollHeight;
  const breaks = [0];
  let y = 0;
  while (total - y > pageHeightPx) {
    const limit = y + pageHeightPx;
    const straddled = (t: number) => blocks.some((b) => b.top < t - 0.5 && b.bottom > t + 0.5);
    const candidates = blocks.map((b) => b.top).filter((t) => t > y + pageHeightPx * 0.25 && t <= limit && !straddled(t));
    let cut = candidates.length ? Math.max(...candidates) : limit;
    // no orphans: a table split across pages carries at least 3 rows over (when it has enough before the cut)
    const row = blocks.find((b) => b.table >= 0 && Math.abs(b.top - cut) < 0.5);
    if (row) {
      const rows = blocks.filter((b) => b.table === row.table);
      const after = rows.filter((b) => b.top >= cut - 0.5);
      const before = rows.filter((b) => b.top < cut - 0.5 && b.top > y);
      if (after.length < 3 && before.length > 3) cut = before[before.length - (3 - after.length)].top;
      // no widows either: fewer than 3 rows left at the bottom of the page move over with the rest of the group
      else if (before.length > 0 && before.length < 3 && before[0].top > y + pageHeightPx * 0.25) cut = before[0].top;
    }
    // keep a section label with what follows it
    const label = blocks.find((b) => b.label && b.bottom <= cut + 0.5 && cut - b.bottom < 24 && b.top > y + pageHeightPx * 0.25);
    if (label) cut = label.top;
    // a little air above the first block of the next page
    cut = Math.max(y + 1, Math.floor(cut - 6));
    breaks.push(cut);
    y = cut;
  }
  breaks.push(total);
  return breaks;
}

const PDF_MARGIN_MM = 8;
const PAGE_W_MM = 210 - 2 * PDF_MARGIN_MM;
const PAGE_H_MM = 297 - 2 * PDF_MARGIN_MM;

/** Renders the (normally print-only) sheet to A4 page images (JPEG data URLs) with their height in mm. */
export async function renderPages(sheet: HTMLElement): Promise<{ data: string; heightMm: number }[]> {
  const pxPerMm = A4_W_PX / PAGE_W_MM;
  // make the sheet renderable off-screen with its print styling
  sheet.classList.add('pdf-render');
  let canvas: HTMLCanvasElement;
  let breaks: number[];
  try {
    await new Promise((r) => setTimeout(r, 30));
    breaks = pageBreaks(sheet, PAGE_H_MM * pxPerMm);
    // the clone must not inherit the off-screen positioning, otherwise it is drawn outside the canvas
    canvas = await toCanvas(sheet, { pixelRatio: 2.5, backgroundColor: '#ffffff', width: A4_W_PX, style: { position: 'static', left: '0', top: '0', display: 'block', width: `${A4_W_PX}px` } });
  } finally {
    sheet.classList.remove('pdf-render');
  }
  const ratio = canvas.width / A4_W_PX; // canvas px per CSS px
  const pages: { data: string; heightMm: number }[] = [];
  for (let i = 0; i < breaks.length - 1; i++) {
    const y0 = Math.round(breaks[i] * ratio);
    const y1 = Math.min(canvas.height, Math.round(breaks[i + 1] * ratio));
    if (y1 <= y0) continue;
    const part = document.createElement('canvas');
    part.width = canvas.width; part.height = y1 - y0;
    const ctx = part.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, part.width, part.height);
    ctx.drawImage(canvas, 0, y0, canvas.width, part.height, 0, 0, canvas.width, part.height);
    pages.push({ data: part.toDataURL('image/jpeg', 0.92), heightMm: part.height / ratio / pxPerMm });
  }
  return pages;
}

/** Renders the (normally print-only) sheet element to an A4 PDF. */
export async function renderPdf(sheet: HTMLElement): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const pages = await renderPages(sheet);
  pages.forEach((p, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(p.data, 'JPEG', PDF_MARGIN_MM, PDF_MARGIN_MM, PAGE_W_MM, p.heightMm);
  });
  return pdf.output('blob');
}

/** True when the platform share sheet can take a PDF file (iOS / Android browsers, the iOS app). */
export function canShareFiles(): boolean {
  try {
    const f = new File([new Blob(['x'], { type: 'application/pdf' })], 'plan.pdf', { type: 'application/pdf' });
    return typeof navigator.share === 'function' && !!navigator.canShare && navigator.canShare({ files: [f] });
  } catch { return false; }
}

/** Hands the PDF to the system share sheet. Resolves false when cancelled or unsupported. */
export async function sharePdf(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (!canShareFiles()) return false;
  try { await navigator.share({ files: [file], title: filename }); return true; } catch { return false; }
}

export const isMobileTauri = (): boolean =>
  '__TAURI_INTERNALS__' in window && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

/** Yes/no question: native Tauri dialog inside the app (the mobile webview has no window.confirm), window.confirm on the web. */
export async function askConfirm(text: string, title = 'BTT Dive Planner'): Promise<boolean> {
  if ('__TAURI_INTERNALS__' in window) {
    try { const { confirm } = await import('@tauri-apps/plugin-dialog'); return await confirm(text, { title, kind: 'warning' }); } catch { /* fall back */ }
  }
  return window.confirm(text);
}

export async function showMessage(text: string, title = 'BTT Dive Planner'): Promise<void> {
  if ('__TAURI_INTERNALS__' in window) {
    try { const { message } = await import('@tauri-apps/plugin-dialog'); await message(text, { title }); return; } catch { /* fall back */ }
  }
  window.alert(text);
}

/**
 * Saves the PDF: inside Tauri via the native "save as" dialog (on Android the SAF document picker),
 * in the browser via a download link. Resolves false when the dialog is cancelled.
 */
export async function savePdf(blob: Blob, filename: string): Promise<boolean> {
  if ('__TAURI_INTERNALS__' in window) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: filename, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!path) return false;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}
