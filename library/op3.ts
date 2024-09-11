import { OP3_PREFIX, podcastNamespace, feedPath } from "./rssUtils";
const { v5 } = require("uuid");

interface IParams {
  url: string;
  albumId?: string;
  podcastId?: string;
}

export const addOP3URLPrefix = ({ url, albumId, podcastId }: IParams) => {
  if (albumId) {
    return `${OP3_PREFIX},pg=${v5(
      feedPath("album", albumId),
      podcastNamespace
    )}/${url}`;
  }
  if (podcastId) {
    return `${OP3_PREFIX},pg=${v5(
      feedPath("podcast", podcastId),
      podcastNamespace
    )}/${url}`;
  }
};
