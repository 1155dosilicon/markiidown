import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Cria uma imagem RGBA com o logotipo do MarkiiDown:
 * Fundo arredondado azul-escuro (#0f172a / #1e293b), borda ciano (#38bdf8),
 * e o símbolo clássico de Markdown "M ↓" em branco e ciano vibrante.
 */
function renderMarkiiDownIcon(size: number): Buffer {
  const pixels = new Uint8Array(size * size * 4); // RGBA

  const setPixel = (x: number, y: number, r: number, g: number, b: number, a: number) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    // Alpha blending sobre o pixel existente se necessário
    const srcA = a / 255;
    const dstA = pixels[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);

    if (outA > 0) {
      pixels[idx] = Math.round((r * srcA + pixels[idx] * dstA * (1 - srcA)) / outA);
      pixels[idx + 1] = Math.round((g * srcA + pixels[idx + 1] * dstA * (1 - srcA)) / outA);
      pixels[idx + 2] = Math.round((b * srcA + pixels[idx + 2] * dstA * (1 - srcA)) / outA);
      pixels[idx + 3] = Math.round(outA * 255);
    }
  };

  const radius = Math.max(2, Math.round(size * 0.22));
  const borderThickness = Math.max(1, Math.round(size * 0.04));

  // 1. Desenha o fundo com cantos arredondados (Superellipse / Rounded Rect)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;

      if (x < radius) dx = radius - x;
      else if (x >= size - radius) dx = x - (size - 1 - radius);

      if (y < radius) dy = radius - y;
      else if (y >= size - radius) dy = y - (size - 1 - radius);

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        // Suavização de borda (antialiasing)
        const alpha = Math.min(1, Math.max(0, radius - dist + 0.5));
        
        // Gradiente sutil do topo para a base (#1e293b -> #0f172a)
        const factor = y / size;
        const r = Math.round(30 * (1 - factor) + 15 * factor);
        const g = Math.round(41 * (1 - factor) + 23 * factor);
        const b = Math.round(59 * (1 - factor) + 42 * factor);

        // Borda ciano sutil (#38bdf8)
        if (dist >= radius - borderThickness || x < borderThickness || x >= size - borderThickness || y < borderThickness || y >= size - borderThickness) {
          const br = 56, bg = 189, bb = 248; // Cyan
          setPixel(x, y, br, bg, bb, Math.round(255 * alpha));
        } else {
          setPixel(x, y, r, g, b, Math.round(255 * alpha));
        }
      }
    }
  }

  // 2. Desenha a letra 'M' e a seta '↓' estilizadas (Markdown Icon)
  // Normalizado para escala do tamanho
  const drawThickLine = (x0: number, y0: number, x1: number, y1: number, thickness: number, r: number, g: number, b: number) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const cx = x0 + (x1 - x0) * t;
      const cy = y0 + (y1 - y0) * t;
      for (let ox = -thickness; ox <= thickness; ox++) {
        for (let oy = -thickness; oy <= thickness; oy++) {
          if (ox * ox + oy * oy <= thickness * thickness) {
            setPixel(Math.round(cx + ox), Math.round(cy + oy), r, g, b, 255);
          }
        }
      }
    }
  };

  const padX = size * 0.15;
  const padY = size * 0.22;
  const contentW = size - padX * 2;
  const contentH = size - padY * 2;
  const stroke = Math.max(1, Math.round(size * 0.05));

  // 'M' no lado esquerdo
  const mW = contentW * 0.52;
  const mX0 = padX;
  const mX1 = padX + mW * 0.33;
  const mX2 = padX + mW * 0.5;
  const mX3 = padX + mW * 0.67;
  const mX4 = padX + mW;
  const mY0 = padY + contentH;
  const mY1 = padY;
  const mYMid = padY + contentH * 0.6;

  // Hastes do M (Branco #ffffff)
  drawThickLine(mX0, mY0, mX0, mY1, stroke, 255, 255, 255);
  drawThickLine(mX0, mY1, mX2, mYMid, stroke, 255, 255, 255);
  drawThickLine(mX2, mYMid, mX4, mY1, stroke, 255, 255, 255);
  drawThickLine(mX4, mY1, mX4, mY0, stroke, 255, 255, 255);

  // Seta '↓' no lado direito em ciano (#38bdf8)
  const aX = padX + contentW * 0.78;
  const aY0 = padY + contentH * 0.05;
  const aY1 = padY + contentH * 0.95;
  const arrowHead = contentW * 0.16;

  // Haste da seta
  drawThickLine(aX, aY0, aX, aY1, stroke, 56, 189, 248);
  // Pontas da seta
  drawThickLine(aX, aY1, aX - arrowHead, aY1 - arrowHead, stroke, 56, 189, 248);
  drawThickLine(aX, aY1, aX + arrowHead, aY1 - arrowHead, stroke, 56, 189, 248);

  return Buffer.from(pixels);
}

/**
 * Converte pixels RGBA para formato BMP DIB para ícone ICO
 */
function createBmpIconData(rgbaBuffer: Buffer, width: number, height: number): Buffer {
  const headerSize = 40; // BITMAPINFOHEADER
  const imageSize = width * height * 4;
  const maskRowSize = Math.ceil(width / 32) * 4;
  const maskSize = maskRowSize * height;
  const totalSize = headerSize + imageSize + maskSize;

  const buffer = Buffer.alloc(totalSize);

  // BITMAPINFOHEADER
  buffer.writeUInt32LE(headerSize, 0); // biSize
  buffer.writeInt32LE(width, 4); // biWidth
  buffer.writeInt32LE(height * 2, 8); // biHeight (dobrado para ícone: imagem + máscara AND)
  buffer.writeUInt16LE(1, 12); // biPlanes
  buffer.writeUInt16LE(32, 14); // biBitCount (32-bit RGBA)
  buffer.writeUInt32LE(0, 16); // biCompression (BI_RGB)
  buffer.writeUInt32LE(imageSize + maskSize, 20); // biSizeImage
  buffer.writeInt32LE(0, 24); // biXPelsPerMeter
  buffer.writeInt32LE(0, 28); // biYPelsPerMeter
  buffer.writeUInt32LE(0, 32); // biClrUsed
  buffer.writeUInt32LE(0, 36); // biClrImportant

  // Pixels em formato BGRA de baixo para cima
  let offset = headerSize;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const r = rgbaBuffer[srcIdx];
      const g = rgbaBuffer[srcIdx + 1];
      const b = rgbaBuffer[srcIdx + 2];
      const a = rgbaBuffer[srcIdx + 3];

      buffer[offset++] = b;
      buffer[offset++] = g;
      buffer[offset++] = r;
      buffer[offset++] = a;
    }
  }

  // Máscara AND vazia (1-bit por pixel, preenchido com 0)
  buffer.fill(0, offset, offset + maskSize);

  return buffer;
}

/**
 * Empacota múltiplos tamanhos de ícone em um único arquivo .ICO multi-resolução
 */
export function buildMultiResolutionIco(sizes: number[] = [16, 32, 48, 64, 128, 256]): Buffer {
  const images = sizes.map((size) => {
    const rgba = renderMarkiiDownIcon(size);
    const bmpData = createBmpIconData(rgba, size, size);
    return { size, data: bmpData };
  });

  const headerSize = 6;
  const dirEntrySize = 16;
  const totalHeaderSize = headerSize + images.length * dirEntrySize;

  let currentOffset = totalHeaderSize;
  const totalFileSize = totalHeaderSize + images.reduce((acc, img) => acc + img.data.length, 0);
  const icoBuffer = Buffer.alloc(totalFileSize);

  // ICONDIR
  icoBuffer.writeUInt16LE(0, 0); // Reserved
  icoBuffer.writeUInt16LE(1, 2); // Type 1 = Icon (.ICO)
  icoBuffer.writeUInt16LE(images.length, 4); // Quantidade de imagens

  // ICONDIRENTRY
  let entryOffset = headerSize;
  for (const img of images) {
    const sizeByte = img.size >= 256 ? 0 : img.size;
    icoBuffer.writeUInt8(sizeByte, entryOffset); // bWidth
    icoBuffer.writeUInt8(sizeByte, entryOffset + 1); // bHeight
    icoBuffer.writeUInt8(0, entryOffset + 2); // bColorCount (0 para >= 8bpp)
    icoBuffer.writeUInt8(0, entryOffset + 3); // bReserved
    icoBuffer.writeUInt16LE(1, entryOffset + 4); // wPlanes
    icoBuffer.writeUInt16LE(32, entryOffset + 6); // wBitCount
    icoBuffer.writeUInt32LE(img.data.length, entryOffset + 8); // dwBytesInRes
    icoBuffer.writeUInt32LE(currentOffset, entryOffset + 12); // dwImageOffset

    // Copia dados da imagem
    img.data.copy(icoBuffer, currentOffset);
    currentOffset += img.data.length;
    entryOffset += dirEntrySize;
  }

  return icoBuffer;
}

function main() {
  const assetsDir = join(import.meta.dir, "..", "assets");
  mkdirSync(assetsDir, { recursive: true });

  const icoPath = join(assetsDir, "icon.ico");
  const icoData = buildMultiResolutionIco([16, 32, 48, 64, 128, 256]);
  writeFileSync(icoPath, icoData);
  console.log(`✅ Ícone oficial gerado com sucesso: ${icoPath} (${(icoData.length / 1024).toFixed(1)} KB)`);
}

if (import.meta.main) {
  main();
}
