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

enum Status {
  draft = "draft",
  published = "published",
  scheduled = "scheduled",
}

export const getStatus = (isDraft: boolean, isPublished: Date): Status => {
  if (isDraft) {
    return Status.draft;
  }

  const publishedTime = new Date(isPublished);
  return publishedTime > new Date() ? Status.scheduled : Status.published;
};
