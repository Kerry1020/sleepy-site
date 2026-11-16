// Keep the structured FAQ identical to the reviewed answers visible on the page.
// FAQPage markup does not promise a Google rich result or an AI citation.
// Flatten links, code and lists to readable text for acceptedAnswer.text.
import faq from '../data/faq.json';

type Inline = { t: string; v?: string; inline?: Inline[] };
type Block = { type: string; inline?: Inline[]; items?: Inline[][]; text?: string };

function inlineText(inls: Inline[]): string {
  return inls
    .map((i) => (i.t === 'link' ? inlineText(i.inline ?? []) : (i.v ?? '')))
    .join('');
}

function blockText(b: Block): string {
  if (b.type === 'paragraph') return inlineText(b.inline ?? []);
  if (b.type === 'list') return (b.items ?? []).map((li) => inlineText(li)).join('\n');
  if (b.type === 'pre') return b.text ?? '';
  return '';
}

export function faqJsonLd(lang: 'zh' | 'en') {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage' as const,
    mainEntity: faq.sections.flatMap((s) =>
      s.items.map((it) => ({
        '@type': 'Question' as const,
        name: it.q[lang],
        acceptedAnswer: {
          '@type': 'Answer' as const,
          text: it.a[lang].map(blockText).join('\n\n'),
        },
      })),
    ),
  };
}
