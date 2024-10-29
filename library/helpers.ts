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

// Durstenfeld Shuffle, via: https://stackoverflow.com/a/12646864
export const shuffle = (trackList) => {
  const array = trackList as any[];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};
