// Bannerbilden sparas som base64 (Data URL) direkt i Firestore-dokumentet
// config/site, som en vanlig sträng-fält — samma mönster som används för
// banners i lokala-tjänster-plattformen. Det slipper Firebase Storage-
// uppsättning helt, men ett Firestore-dokument får max vara 1 MiB, och
// base64 gör bilden ca 33 % större än originalfilen. BANNER_BUDGET_CHARS
// lämnar gott om marginal åt dokumentets övriga fält.
export const BANNER_BUDGET_CHARS = 700_000;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Kunde inte läsa filen'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Kunde inte avkoda bilden'));
      img.onload = () => resolve(img);
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function renderToDataUrl(img: HTMLImageElement, targetW: number, targetH: number, quality: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas stöds inte i den här webbläsaren');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Skalar/komprimerar en uppladdad bild till högsta upplösning som ryms
 * inom BANNER_BUDGET_CHARS, istället för att gissa en fast storlek.
 */
export async function processBannerImage(file: File): Promise<string> {
  const img = await loadImageFromFile(file);
  const longest = Math.max(img.width, img.height);
  let scale = Math.min(1, 2400 / longest);
  let quality = 0.9;
  let out = '';

  for (let i = 0; i < 12; i++) {
    const w = Math.max(64, Math.round(img.width * scale));
    const h = Math.max(64, Math.round(img.height * scale));
    out = renderToDataUrl(img, w, h, quality);
    if (out.length <= BANNER_BUDGET_CHARS) return out;

    if (quality > 0.62) {
      quality -= 0.08;
    } else {
      scale *= 0.82;
    }
    if (Math.round(longest * scale) < 200) break;
  }
  return out;
}
