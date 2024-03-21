const calculatedPublishedAt = (isDraft: boolean) => {
  const unEditedTrack = { isDraft: true, publishedAt: new Date() };
  // now in server UTC time
  const now = new Date();
  // TODO - consume the date from the request when scheduling is implemented
  const scheduledDate = new Date();

  // if the track is being published (isDraft being changed from true to false) set the publishedAt field to the current time
  if (unEditedTrack.isDraft === true && isDraft === false) {
    return now;
  }

  // if the track is being unpublished (isDraft being changed from false to true) set the publishedAt field to undefined
  if (unEditedTrack.isDraft === false && isDraft === true) {
    return undefined;
  }
};
