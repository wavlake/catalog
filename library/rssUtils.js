const { getParentContentTypeAndId } = require("./content");
const { v5 } = require("uuid");

const podcastNamespace = "ead4c236-bf58-58c6-a2c6-a6b28d128cb6";
const receivingPublicKey = `${process.env.RECEIVING_PUBLIC_KEY}`;
const BASE_URL = "wavlake.com/feed";

const feedPath = (contentType, id) => {
  if (contentType === "podcast") {
    return `${BASE_URL}/show/${id}`;
  } else if (contentType === "album") {
    return `${BASE_URL}/music/${id}`;
  } else if (contentType === "artist") {
    return `${BASE_URL}/artist/${id}`;
  }
};

const remoteRecipient = async (recipient_content_id) => {
  const { contentType, parentId } = await getParentContentTypeAndId(
    recipient_content_id
  );
  return {
    "podcast:remoteItem": {
      _attr: {
        feedGuid: v5(feedPath(contentType, parentId), podcastNamespace),
        feedUrl: `https://${feedPath(contentType, parentId)}`,
        itemGuid: recipient_content_id,
        medium: contentType === "podcast" ? "podcast" : "music",
      },
    },
  };
};

const valueRecipient = async (contentId, title, split = 100) => {
  return {
    "podcast:valueRecipient": {
      _attr: {
        name: `${title} via Wavlake`,
        type: "node",
        address: receivingPublicKey,
        customKey: 16180339,
        customValue: contentId,
        split: split,
      },
    },
  };
};

const valueTimeSplit = async ({
  recipient_content_id,
  start_seconds,
  end_seconds,
  numerator,
  denominator,
}) => {
  const split = (numerator / denominator) * 100;
  // const remainderSplit = 100 - split;
  // console.log({ split });
  // log.debug(await remoteRecipient(recipient_content_id));
  return {
    "podcast:valueTimeSplit": [
      {
        _attr: {
          startTime: start_seconds,
          duration: end_seconds - start_seconds,
          remotePercentage: split,
        },
      },
      // timesplit recipient
      await remoteRecipient(recipient_content_id),
    ],
  };
};

module.exports = {
  feedPath,
  podcastNamespace,
  receivingPublicKey,
  valueRecipient,
  valueTimeSplit,
};
