import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { guides, guideIndexPath, guidePath, type GuideLang } from '../src/data/guides';
import { site } from '../src/i18n/ui';

// Exercise generated documents with scripting disabled, as a text crawler reads them.
const doc = (path: string) => new JSDOM(readFileSync(new URL(`../dist/client${path}index.html`, import.meta.url), 'utf8')).window.document;
const locales: GuideLang[] = ['zh', 'en'];

describe('static, bilingual user guides', () => {
  for (const lang of locales) {
    it(`${lang}: guide index links to every guide`, () => {
      const index = doc(guideIndexPath(lang));
      expect(index.querySelectorAll('main h1')).toHaveLength(1);
      for (const guide of guides) {
        expect(index.querySelector(`main a[href="${guidePath(guide.slug, lang)}"]`)?.textContent).toBe(guide.copy[lang].title);
      }
    });
    for (const guide of guides) {
      it(`${lang}: ${guide.slug} has readable instructions, working anchors and language pairs`, () => {
        const path = guidePath(guide.slug, lang);
        const page = doc(path);
        const main = page.querySelector('main')!;
        expect(page.querySelectorAll('main h1')).toHaveLength(1);
        expect(page.querySelector('main h1')?.textContent).toBe(guide.copy[lang].title);
        expect(page.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(guide.copy[lang].description);
        expect(page.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(site + path);
        expect(page.querySelector('link[hreflang="zh-CN"]')?.getAttribute('href')).toBe(site + guidePath(guide.slug, 'zh'));
        expect(page.querySelector('link[hreflang="en"]')?.getAttribute('href')).toBe(site + guidePath(guide.slug, 'en'));
        expect(main.querySelector('ol')?.children.length).toBeGreaterThanOrEqual(4);
        expect(main.textContent).toContain(guide.sourceVersion);
        expect(main.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-16');
        for (const anchor of main.querySelectorAll('nav a[href^="#"]')) {
          expect(page.getElementById(anchor.getAttribute('href')!.slice(1))).not.toBeNull();
        }
        for (const source of guide.sources) {
          expect(source.href).toMatch(/^https:\/\/github.com\/lingion\/sleepy\/blob\/3a7cbed352f4f8e1144e2e532840b9bea93b25d3\//);
          expect(main.querySelector(`a[href="${source.href}"]`)).not.toBeNull();
        }
        const structured = [...page.querySelectorAll('script[type="application/ld+json"]')].map((node) => JSON.parse(node.textContent!));
        const article = structured.find((entry) => entry['@type'] === 'Article');
        expect(article).toMatchObject({ headline: guide.copy[lang].title, dateModified: guide.reviewDate, mainEntityOfPage: site + path });
        expect(article.citation).toEqual(guide.sources.map((source) => source.href));
        expect(JSON.stringify(structured)).not.toContain('"HowTo"');
      });
    }
  }
  it('explains backup limitations and online code dependencies in visible text', () => {
    const backup = doc('/en/guides/backup-restore/').querySelector('main')!.textContent!;
    expect(backup).toContain('.sleepybackup');
    expect(backup).toContain('Matching preference keys');
    expect(backup).toContain('not automatic real-time sync');
    expect(backup).toContain('HTTPS');
    expect(backup).toContain('backup file itself is not encrypted');
    expect(backup).toContain('ship independently');
    const migration = doc('/en/guides/wakeup-migration/').querySelector('main')!.textContent!;
    expect(migration).toContain('third-party sharing service');
    expect(migration).toContain('expired code');
    expect(migration).toContain('semester start date');
  });
});
