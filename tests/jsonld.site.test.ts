import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { site, repoUrl, iosRepoUrl, iosAppStoreUrl } from '../src/i18n/ui';

// SEO 极致批次 S3a:站级实体图(WebSite + Organization)铺全部可收录页,
// 给品牌搜索/知识面板一个稳定锚点;404(noindex)豁免。
// 消费 dist/client 产物 —— 先跑 npm run build。

const doc = (p: string) =>
  new JSDOM(readFileSync(new URL(`../dist/client/${p}`, import.meta.url), 'utf8')).window.document;

const siteGraph = (p: string) => {
  const scripts = [...doc(p).querySelectorAll('head script[type="application/ld+json"]')];
  const g = scripts.map((s) => JSON.parse(s.textContent!)).find((x) => x['@graph']);
  if (!g) throw new Error(`${p} 缺站级 @graph WebSite/Organization`);
  return g;
};

describe('站级 JSON-LD 图(WebSite + Organization)', () => {
  for (const p of ['index.html', 'en/index.html', 'schools/index.html', 'en/schools/index.html',
    'download/index.html', 'en/download/index.html', 'faq/index.html', 'en/faq/index.html']) {
    it(`${p}:@graph 含 WebSite(url=site)+ Organization(sameAs 双仓数组, logo)`, () => {
      const g = siteGraph(p);
      expect(g['@context']).toBe('https://schema.org');
      const ws = g['@graph'].find((x: any) => x['@type'] === 'WebSite');
      const org = g['@graph'].find((x: any) => x['@type'] === 'Organization');
      expect(ws.url).toBe(site);
      expect(ws.inLanguage).toEqual(expect.arrayContaining(['zh-CN', 'en']));
      // GEO 批次 2026-10-27:sameAs 标量升双仓数组(Android+iOS)+ alternateName 中文品牌。
      expect(org.sameAs).toEqual(expect.arrayContaining([repoUrl, 'https://github.com/lingion/sleepy-ios']));
      expect(org.alternateName).toContain('轻课表');
      expect(org.logo.url).toMatch(/apple-touch-icon\.png/);
      expect(org.logo.width).toBe(180);
    });
  }
  for (const [p, lang] of [['index.html', 'zh'], ['en/index.html', 'en']] as const) {
    it(`${p}: iOS is a separate app with its own channel and no inherited Android release`, () => {
      const graph = siteGraph(p)['@graph'];
      const ios = graph.find((node: any) => node['@id'] === `${site}/#ios-app`);
      const website = graph.find((node: any) => node['@id'] === `${site}/#website`);
      expect(ios['@type']).toBe('SoftwareApplication');
      expect(ios.operatingSystem).toBe('iOS');
      expect(ios.url).toBe(iosAppStoreUrl);
      expect(ios.downloadUrl).toBe(iosAppStoreUrl);
      expect(ios.sameAs).toEqual(expect.arrayContaining([iosRepoUrl, iosAppStoreUrl]));
      expect(ios.softwareVersion).toBeUndefined();
      expect(ios.softwareRequirements).toBeUndefined();
      expect(ios.aggregateRating).toBeUndefined();
      expect(ios.review).toBeUndefined();
      expect(website.description).toContain(lang === 'zh' ? '轻课表官方网站' : 'official website');
      expect(website.description).toContain('Android');
      expect(website.description).toContain('iOS');
      expect(ios.description).toContain(lang === 'zh' ? '独立发布' : 'independently');
    });
  }
  it('404(noindex)零 ld+json(免收录页不发实体)', () => {
    expect(doc('404.html').querySelectorAll('script[type="application/ld+json"]').length).toBe(0);
  });
});
