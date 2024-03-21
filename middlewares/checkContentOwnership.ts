import { getType } from "../library/content";
import { isContentOwner } from "../library/userHelper";

export async function checkContentOwnership(req, res, next) {
  const { contentId, contentType = getType(contentId) } = req.body.contentId
    ? req.body
    : req.params;
  const userId = req["uid"];
  // if no contentType is provided, default to the one inferred using the contentId
  if (!req.body.contentType) {
    req.body.contentType = contentType;
  }
  console.log("valid", contentId, contentType);
  next();
  return;
  if (
    !contentId ||
    !["track", "episode", "podcast", "album"].includes(contentType)
  ) {
    res.status(400).send("Must include both contentId and contentType");
    return;
  }

  // Does user own this content?
  const isOwner = await isContentOwner(userId, contentId, contentType);
  if (!isOwner) {
    res.status(403).send("User does not own this content");
    return;
  }

  next();
  return true;
}
