import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { site } from '../src/i18n/ui';
import release from '../src/data/release.json';
import faq from '../src/data/faq.json';

// sitemap lastmod 精确化(SEO 极致批次):爬虫按 lastmod 决定重访优先级,
// 缺 lastmod = 全站同等刷新频率;数据管线日期就是真实更新信号——
// 主页/台账/下载 = release.date(发版驱动),FAQ = faq.json updatedAt(内容管线驱动)。
// 消费 dist/client 产物 —— 先跑 npm run build。

const xml = (() => {
  try {
    return readFileSync(new URL('../dist/client/sitemap-0.xml', import.meta.url), 'utf8');
  } catch {
    throw new Error('dist/client/sitemap-0.xml 不存在——先跑 npm run build 再跑本测试');
  }
})();
const dom = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
const entry = (pathname: string) => {
  const loc = `${site}${pathname}`;
  const url = [...dom.querySelectorAll('url')].find(
    (u) => u.querySelector('loc')?.textContent === loc,
  );
  if (!url) throw new Error(`sitemap 缺 ${loc}`);
  return url.querySelector('lastmod')?.textContent ?? null;
};

const reviewDay = '2026-11-16';

describe('sitemap reflects release dates and genuine content reviews', () => {
  for (const base of ['/', '/download/', '/faq/', '/guides/', '/guides/wakeup-migration/', '/guides/backup-restore/', '/privacy/']) {
    for (const path of [base, '/en' + base]) {
      it(`${path} includes the current editorial review date`, () => {
        expect(entry(path)).toMatch(new RegExp(`^${reviewDay}`));
      });
    }
  }
  for (const path of ['/schools/', '/en/schools/', '/releases/', '/en/releases/']) {
    it(`${path} uses the release pipeline timestamp`, () => {
      expect(entry(path)).toBe(new Date(release.date).toISOString());
    });
  }
  for (const path of ['/licenses/', '/en/licenses/']) {
    it(`${path} does not borrow an unrelated release timestamp`, () => {
      expect(entry(path)).toBeNull();
    });
  }
  it('preserves the older feature FAQ review baseline separately', () => {
    expect(faq.updatedAt).toBe('2026-11-10');
    expect(faq.reviewedVersion).toBe('v1.0.64');
  });
});
