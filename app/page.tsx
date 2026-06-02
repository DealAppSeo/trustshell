import { Hero } from '@/components/hero';
import { CompatibilityInfo } from '@/components/compatibility-info';
import { GlassBox } from '@/components/glass-box';
import { EarnedTrust } from '@/components/earned-trust';
import { DefenseGrid } from '@/components/defense-grid';
import { LiveTrustScores } from '@/components/live-trust-scores';
import { LiveOnChain } from '@/components/live-on-chain';
import { HowItWorks } from '@/components/how-it-works';
import { RoadmapV15 } from '@/components/roadmap-v15';
import { RepidGovernance } from '@/components/repid-governance';
import { PrivacyPosture } from '@/components/privacy-posture';
import { Ecosystem } from '@/components/ecosystem';
import { BuilderWaitlist } from '@/components/builder-waitlist';
import { Footer } from '@/components/footer';

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      {/* Section 1: Hero */}
      <Hero />

      {/* Section 1.5: Compatibility & Signals Info */}
      <CompatibilityInfo />
      
      {/* Section 2: Black Box, Meet Glass Box */}
      <GlassBox />
      
      {/* Section 3: Earned Trust, Autonomous Payment */}
      <EarnedTrust />
      
      {/* Section 4: What It Defends Against */}
      <DefenseGrid />
      
      {/* Section 5: Live Trust Scores */}
      <LiveTrustScores />
      
      {/* Section 6: Live On Base Sepolia */}
      <LiveOnChain />
      
      {/* Section 7: How It Works */}
      <HowItWorks />
      
      {/* Section 8: V1.5 Roadmap */}
      <RoadmapV15 />
      
      {/* Section 9: RepID Governance */}
      <RepidGovernance />
      
      {/* Section 10: Privacy Posture */}
      <PrivacyPosture />
      
      {/* Section 11: Ecosystem */}
      <Ecosystem />
      
      {/* Section 12: Builder Waitlist */}
      <BuilderWaitlist />
      
      {/* Section 13: Footer */}
      <Footer />
    </main>
  );
}
