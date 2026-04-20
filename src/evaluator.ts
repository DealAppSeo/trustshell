  const COMMA = 531441 / 524288;
  
  export function evaluateLocally(
    certainty: number,
    profile: 'conservative' | 'balanced' | 'pro' = 'balanced'
  ): { approved: boolean; dissonance: number } {
    const harm = 1 - certainty;
    const epistemic = certainty < 0.5 ? 0.8 : 0.2;
    const dissonance = 
      (0.4*harm + 0.3*epistemic + 0.2*0.5 + 0.1*0.3)
      * COMMA;
    const thresholds = {
      conservative: 0.015,
      balanced: 0.0195,
      pro: 0.025
    };
    return { 
      approved: dissonance <= thresholds[profile], 
      dissonance 
    };
  }
