import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AudiencePage } from '@/components/audience-page';
import { AUDIENCES, audienceBySlug } from '@/lib/audiences';

/**
 * /for/openclaw, /for/vibe-coders, /for/erc: one static page per audience (lib/audiences.ts). A page per
 * audience is how "which hook works" is measured without a script: where a link was posted, and the page
 * view count for the path. Only these three slugs exist; anything else is a 404.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return AUDIENCES.map((a) => ({ audience: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ audience: string }> }): Promise<Metadata> {
  const { audience } = await params;
  const a = audienceBySlug(audience);
  if (!a) return {};
  return {
    title: a.metaTitle,
    description: a.metaDescription,
    alternates: { canonical: `/for/${a.slug}` },
    openGraph: { title: a.metaTitle, description: a.metaDescription, type: 'website', url: `/for/${a.slug}` },
    twitter: { card: 'summary_large_image', title: a.metaTitle, description: a.metaDescription },
  };
}

export default async function ForAudiencePage({ params }: { params: Promise<{ audience: string }> }) {
  const { audience } = await params;
  const a = audienceBySlug(audience);
  if (!a) notFound();
  return <AudiencePage a={a} />;
}
