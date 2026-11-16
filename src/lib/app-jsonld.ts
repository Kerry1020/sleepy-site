// The Android application's release fields share one immutable release snapshot.
// iOS has a separate identity and release channel in the site graph.
import { site, repoUrl } from '../i18n/ui';
import release from '../data/release.json';

export function softwareApplicationJsonLd(lang: 'zh' | 'en') {
  const universal = release.assets.find((a) => a.name.includes('universal'))!;
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${site}/#android-app`,
    name: 'Sleepy',
    alternateName: ['Sleepy 轻课表', 'Sleepy 课程表', 'Sleepy Android'],
    url: `${site}${lang === 'zh' ? '/download/' : '/en/download/'}`,
    description: lang === 'zh'
      ? 'Sleepy 轻课表 Android 版：免费、开源、无广告的大学生课程表，支持课程编辑、教务导入与桌面小组件，无需注册 Sleepy 账号。'
      : 'Sleepy for Android is a free, open-source, ad-free university timetable with course editing, academic import and home-screen widgets. No Sleepy account is required.',
    operatingSystem: 'Android',
    // Price and category describe the app; they do not establish rich-result eligibility.
    // Ratings and reviews are omitted because no verified rating source is maintained here.
    applicationCategory: 'EducationalApplication',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    dateModified: release.date,
    softwareVersion: release.tag,
    downloadUrl: universal.url,
    license: `${site}${lang === 'zh' ? '/licenses/' : '/en/licenses/'}`,
    sameAs: repoUrl,
    publisher: { '@id': `${site}/#organization` },
    image: `${site}/og/home-${lang}.png`,
  };
}
