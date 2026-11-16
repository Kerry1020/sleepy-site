import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { site, repoUrl } from '../src/i18n/ui';
import release from '../src/data/release.json';

// Built-page checks for factual app metadata and stable product identities.
// These assertions do not imply rich-result eligibility or AI citation probability.

const doc = (p: string) =>
  new JSDOM(readFileSync(new URL(`../dist/client/${p}`, import.meta.url), 'utf8')).window.document;
const pageLd = (p: string) =>
  [...doc(p).querySelectorAll('head script[type="application/ld+json"]')]
    .map((s) => JSON.parse(s.textContent!))
    .filter((x) => !x['@graph']);
const graphOf = (p: string) =>
  [...doc(p).querySelectorAll('head script[type="application/ld+json"]')]
    .map((s) => JSON.parse(s.textContent!))
    .find((x) => x['@graph'])!['@graph'];

describe('SoftwareApplication 的真实产品信息', () => {
  for (const [file, lang] of [['index.html', 'zh'], ['en/index.html', 'en']] as const) {
    it(`${lang}:applicationCategory=EducationalApplication 且 offers 免费声明`, () => {
      const ld = pageLd(file)[0];
      expect(ld.applicationCategory).toBe('EducationalApplication');
      expect(ld.offers['@type']).toBe('Offer');
      expect(ld.offers.price).toBe('0');
      expect(ld.offers.priceCurrency).toBe('USD');
      expect(ld.dateModified).toBe(release.date);
      expect(ld['@id']).toBe(`${site}/#android-app`);
      expect(ld.url).toBe(`${site}${lang === 'zh' ? '/download/' : '/en/download/'}`);
      expect(ld.operatingSystem).toBe('Android');
      expect(ld.description).toContain(lang === 'zh' ? '大学生课程表' : 'university timetable');
      expect(ld.publisher).toEqual({ '@id': `${site}/#organization` });
      expect(ld.aggregateRating).toBeUndefined();
      expect(ld.review).toBeUndefined();
    });
  }
});

describe('站级实体图去歧义', () => {
  const org = () => graphOf('index.html').find((n: { '@type': string }) => n['@type'] === 'Organization');
  it('Organization sameAs 同时含 Android 与 iOS 两仓', () => {
    const sameAs = org().sameAs;
    expect(Array.isArray(sameAs)).toBe(true);
    expect(sameAs).toContain(repoUrl);
    expect(sameAs).toContain('https://github.com/lingion/sleepy-ios');
  });
  it('Organization alternateName 含中文名「轻课表」', () => {
    expect(org().alternateName).toContain('轻课表');
  });
  it('WebSite description 描述两个独立发布的原生平台', () => {
    const ws = graphOf('index.html').find((n: { '@type': string }) => n['@type'] === 'WebSite');
    expect(ws.description).toContain('Android');
    expect(ws.description).toContain('iOS');
    expect(ws.description).toContain('独立发布');
  });
});
