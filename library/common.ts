export enum PaymentType {
  Boost = 1,
  BoostWithComment = 2, // Deprecated, could be used for something else
  Reply = 3, // Deprecated, could be used for something else
  CommentBoost = 4, // Deprecated, could be used for something else
  Keysend = 5,
  Invoice = 6,
  Zap = 7,
  PartyMode = 8,
  BoostWithExternalTimeSplit = 9,
}

// Payment Types:
// 1: Standard boost
// 2: Boost with comment
// 3: Reply
// 4: Comment boost
// 5: Keysend boost
// 6: Invoice boost
// 7: Zap
// 8: Party mode boost
// 9: Internal boost via external time split