import prisma from "../prisma/client";
import asyncHandler from "express-async-handler";
import { getUserIds } from "../library/userHelper";

interface ActivityItem {
  artwork?: string;
  shareUrl?: string;
  contentTitle?: string;
  contentId: string;
  parentContentTitle?: string;
  parentContentId?: string;
  contentType: string;
  timestamp: string;
}
const getActivity = async (userIds: string[]) => {
  const userPlaylists = await prisma.playlist.findMany({
    where: {
      userId: {
        in: userIds,
      },
    },
    select: {
      id: true,
    },
  });
  // Fetch recent playlist track activities
  const playlistTrackActivity = await prisma.playlistTrack.findMany({
    where: {
      playlistId: {
        in: userPlaylists.map((playlist) => playlist.id),
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 10,
  });

  const trackActivity = await prisma.track.findMany({
    where: {
      album: {
        artist: {
          userId: {
            in: userIds,
          },
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 10,
  });

  const albumActivity = await prisma.album.findMany({
    where: {
      artist: {
        userId: {
          in: userIds,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 10,
  });

  const commentActivity = await prisma.comment.findMany({
    where: {
      userId: {
        in: userIds,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  const episodeActivity = await prisma.episode.findMany({
    where: {
      podcast: {
        userId: {
          in: userIds,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 10,
  });

  const libraryActivity = await prisma.library.findMany({
    where: {
      user_id: {
        in: userIds,
      },
    },
    orderBy: {
      created_at: "desc",
    },
    take: 20,
  });

  const sortedAndNormalizedActivity: ActivityItem[] = [
    ...playlistTrackActivity.map((activity) => ({
      contentId: activity.trackId,
      parentContentId: activity.playlistId,
      contentType: "track",
      timestamp: activity.updatedAt.toISOString(),
    })),
    ...trackActivity.map((activity) => ({
      contentId: activity.id,
      contentTitle: activity.title,
      parentContentId: activity.albumId,
      contentType: "track",
      timestamp: activity.updatedAt.toISOString(),
    })),
    ...albumActivity.map((activity) => ({
      contentId: activity.id,
      contentTitle: activity.title,
      parentContentId: activity.artistId,
      contentType: "album",
      timestamp: activity.updatedAt.toISOString(),
    })),
    ...commentActivity.map((activity) => ({
      contentId: activity.parentId.toString(),
      parentContentId: activity.userId,
      contentType: "comment",
      timestamp: activity.createdAt.toISOString(),
    })),
    ...episodeActivity.map((activity) => ({
      contentId: activity.id,
      contentTitle: activity.title,
      parentContentId: activity.podcastId,
      contentType: "episode",
      timestamp: activity.updatedAt.toISOString(),
    })),
    ...libraryActivity.map((activity) => ({
      contentId: activity.content_id,
      contentType: "library",
      timestamp: activity.created_at.toISOString(),
    })),
  ].sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
};

const get_activity_feed = asyncHandler(async (req, res, next) => {
  const userId = req.params.id;

  if (!userId) {
    res.status(400).json({ success: false, error: "Must provde a user id" });
    return;
  }
  // TODO - get a list of the user's follows
  // either query the relay(s) here with the user's npub, or have the client pass in the list
  const userIds = [];
  const pubkeysAndFirebaseIds = await Promise.all(userIds.map(getUserIds));
  const activityItems = await getActivity(pubkeysAndFirebaseIds.flat());
  res.send({
    success: true,
    data: activityItems,
  });
});

const get_account_activity = asyncHandler(async (req, res, next) => {
  const userId = req.params.id;
  if (!userId) {
    res.status(400).json({ success: false, error: "Must provde a user id" });
    return;
  }

  const userIds = await getUserIds(userId);
  const activityItems = await getActivity(userIds);
  res.send({
    success: true,
    data: activityItems,
  });
});

export default {
  get_activity_feed,
  get_account_activity,
};
