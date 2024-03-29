import { getType } from "../library/content";
import { isContentOwner } from "../library/userHelper";
import { validate } from "uuid";

export async function checkContentOwnership(req, res, next) {
  const { contentId, contentType = await getType(contentId) } = req.body
    .contentId
    ? req.body
    : req.params;
  const userId = req["uid"];
  // if no contentType is provided, default to the one inferred using the contentId
  // this is useful for routes that don't have a contentType in the request body
  if (!req.body.contentType) {
    req.body.contentType = contentType;
  }

  // Validate contentId
  if (!validate(contentId)) {
    res.status(400).json("Invalid contentId");
    return;
  }

  if (
    !contentId ||
    !["track", "episode", "podcast", "album"].includes(contentType)
  ) {
    res.status(400).json("Must include both contentId and contentType");
    return;
  }

  // Does user own this content?
  const isOwner = await isContentOwner(userId, contentId, contentType);
  if (!isOwner) {
    res.status(403).json("User does not own this content");
    return;
  }

  next();
  return;
}
