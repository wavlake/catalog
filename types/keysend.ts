export interface ExternalKeysend {
  name?: string;
  msatAmount: number;
  pubkey?: string;
  customKey?: number;
  customValue?: string;
  itemGuid?: string;
  feedGuid?: string;
}

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
