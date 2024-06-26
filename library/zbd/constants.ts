// aka a keysend
export enum TransactionStatus {
  Completed = "TRANSACTION_STATUS_COMPLETED",
  Error = "TRANSACTION_STATUS_ERROR",
  Expired = "TRANSACTION_STATUS_EXPIRED",
  Failed = "TRANSACTION_STATUS_FAILED",
  Pending = "TRANSACTION_STATUS_PENDING",
  Processing = "TRANSACTION_STATUS_PROCESSING",
}

// aka an invoice paid by ZBD
export enum PaymentStatus {
  Completed = "completed",
  Error = "error",
  Pending = "pending",
  Processing = "processing",
}

// aka an invoice generated by ZBD
export enum ChargeStatus {
  Completed = "completed",
  Error = "error",
  Pending = "pending",
  Processing = "processing",
  Expired = "expired",
}

export enum SendKeysendStatus {
  Paid = "paid",
}
