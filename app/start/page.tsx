import { Hero } from '@/components/hero';
import { demoFileExists } from '@/lib/demo-file';

/**
 * /start used to open on three questions, the last of which asks for a wallet.
 * The default screen is the same one-screen win as /. The questionnaire stays
 * at /start/tailor and is not linked from this page.
 */
export default function StartPage() {
  return <Hero showDemo={demoFileExists()} />;
}
