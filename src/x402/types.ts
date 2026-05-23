export interface X402Accepts {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  resource: string;
  description: string;
}

export interface X402Challenge {
  x402Version: number;
  accepts: X402Accepts[];
  error: string;
  is_simulated?: boolean;
  tip_id?: string;
}

export interface X402Payment {
  txHash: string;
  tip_id?: string;
  amount?: number | string;
  is_simulated?: boolean;
}
