export const parseLimit = (limit?: any, defaultLimit?: number): number => {
  if (typeof limit === "number") {
    return limit;
  }
  if (typeof limit === "string") {
    return parseInt(limit);
  }

  // default to 10, or whatever is passed in
  return defaultLimit ?? 10;
};
