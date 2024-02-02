export interface ExternalKeysendRequest {
  msatTotal: number;
  message?: string;
  keysends: ExternalKeysend[];
  podcast?: string;
  guid?: string;
  feedId?: number;
  episode?: string;
  episodeGuid?: string;
  ts?: number;
}

export interface ExternalKeysend {
  name?: string;
  msatAmount: number;
  pubkey?: string;
  customKey?: number;
  customValue?: string;
  itemGuid?: string;
  feedGuid?: string;
}

export interface ExternalKeysendResult {
  name?: string;
  msatAmount: number;
  feeMsat: number;
  pubkey: string;
  success: boolean;
  message?: string;
}

export interface ExternalKeysendResponse {
  success: boolean;
  error?: string;
  data?: { keysends: ExternalKeysendResult[] };
}
