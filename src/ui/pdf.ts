import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';

const A4_W_PX = 794; // 210 mm at 96 dpi

/**
 * Renders the (normally print-only) sheet element to an A4 PDF and saves it:
 * in the browser via a download link, inside Tauri via the native save dialog.
 */
export async function exportPdf(sheet: HTMLElement, filename: string): Promise<void> {
  // make the sheet renderable off-screen with its print styling
  sheet.classList.add('pdf-render');
  let canvas: HTMLCanvasElement;
  try {
    await new Promise((r) => setTimeout(r, 30));
    // the clone must not inherit the off-screen positioning, otherwise it is drawn outside the canvas
    canvas = await toCanvas(sheet, { pixelRatio: 2.5, backgroundColor: '#ffffff', width: A4_W_PX, style: { position: 'static', left: '0', top: '0', display: 'block', width: `${A4_W_PX}px` } });
  } finally {
    sheet.classList.remove('pdf-render');
  }
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const margin = 8;
  const pageW = 210 - 2 * margin;
  const pageH = 297 - 2 * margin;
  const imgH = (canvas.height / canvas.width) * pageW;
  const data = canvas.toDataURL('image/jpeg', 0.92);
  if (imgH <= pageH) {
    pdf.addImage(data, 'JPEG', margin, margin, pageW, imgH);
  } else {
    // very long content: split over pages
    const pxPerMm = canvas.width / pageW;
    const sliceH = Math.floor(pageH * pxPerMm);
    for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
      const part = document.createElement('canvas');
      part.width = canvas.width; part.height = Math.min(sliceH, canvas.height - y);
      part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
      if (page > 0) pdf.addPage();
      pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, pageW, part.height / pxPerMm);
    }
  }
  const blob = pdf.output('blob');
  await saveBlob(blob, filename);
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

async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (isMobileTauri()) {
    // iOS / Android: hand the PDF to the system share sheet (AirDrop, Files, Mail, …)
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
    }
    // fallback: drop it into the app's Documents folder
    const { writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await writeFile(filename, new Uint8Array(await blob.arrayBuffer()), { baseDir: BaseDirectory.Document });
    await showMessage(`PDF: Documents/${filename}`);
    return;
  }
  if ('__TAURI_INTERNALS__' in window) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: filename, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!path) return;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
