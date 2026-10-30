import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const publicDir = fileURLToPath(new URL('../../public', import.meta.url));
const webDir = fileURLToPath(new URL('../..', import.meta.url));

interface Manifest {
  name?: string;
  short_name?: string;
  start_url?: string;
  display?: string;
  theme_color?: string;
  background_color?: string;
  icons?: { src: string; sizes: string; type: string; purpose?: string }[];
}

const manifest = JSON.parse(
  readFileSync(`${publicDir}/manifest.webmanifest`, 'utf8'),
) as Manifest;

/** Dimensões de um PNG (cabeçalho IHDR) sem decodificar a imagem. */
function pngSize(path: string): { width: number; height: number } {
  const buffer = readFileSync(path);
  expect(buffer.readUInt32BE(0), 'magic PNG').toBe(0x89504e47);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('PWA', () => {
  it('o manifest tem o que o navegador exige para instalar', () => {
    expect(manifest.name).toBe('3DXChat Web');
    expect(manifest.short_name?.length).toBeLessThanOrEqual(12);
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('os ícones existem e têm o tamanho declarado (inclusive o maskable)', () => {
    expect(manifest.icons?.length).toBeGreaterThanOrEqual(3);
    for (const icon of manifest.icons ?? []) {
      const path = `${publicDir}${icon.src}`;
      expect(existsSync(path), icon.src).toBe(true);
      const [width, height] = icon.sizes.split('x').map(Number);
      expect(pngSize(path), icon.src).toEqual({ width, height });
    }
    expect(manifest.icons?.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('o index.html aponta para o manifest e para o ícone do iOS', () => {
    const html = readFileSync(`${webDir}/index.html`, 'utf8');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('viewport-fit=cover');
  });

  it('o service worker não cacheia API nem realtime e versiona o cache', () => {
    const sw = readFileSync(`${publicDir}/sw.js`, 'utf8');
    expect(sw).toMatch(/const VERSION = '[^']+';/);
    expect(sw).toContain("url.pathname.startsWith('/api')");
    expect(sw).toContain("url.pathname.startsWith('/realtime')");
    // Navegação com reserva offline do shell.
    expect(sw).toContain("request.mode === 'navigate'");
    expect(sw).toContain("caches.match('/index.html')");
  });
});
