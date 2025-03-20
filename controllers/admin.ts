import prisma from "../prisma/client";
import log from "../library/winston";
const asyncHandler = require("express-async-handler");

const takedownContent = asyncHandler(async (req, res) => {
  const { artistIds } = req.body;

  if (Array.isArray(artistIds) && artistIds.length === 0) {
    return res.status(400).json({
      message: "No artist IDs provided",
    });
  }

  try {
    const artistsWithUsers = await prisma.artist.findMany({
      where: {
        id: {
          in: artistIds,
        },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    const userIds = artistsWithUsers
      .map((artist) => artist.userId)
      .filter(Boolean);

    // Use Prisma's interactive transactions for more control
    const takedownRequest = await prisma.$transaction(
      async (tx) => {
        // Lock the user records first to prevent concurrent modifications
        if (userIds.length > 0) {
          await tx.user.updateMany({
            where: {
              id: {
                in: userIds,
              },
            },
            data: {
              isLocked: true,
            },
          });
        }

        // Delete tracks associated with these artists
        const deletedTracks = await tx.track.deleteMany({
          where: {
            artistId: {
              in: artistIds,
            },
          },
        });

        // Delete albums associated with these artists
        const deletedAlbums = await tx.album.deleteMany({
          where: {
            artistId: {
              in: artistIds,
            },
          },
        });

        // Finally delete the artists themselves
        const deletedArtists = await tx.artist.deleteMany({
          where: {
            id: {
              in: artistIds,
            },
          },
        });

        return {
          deletedTracks: deletedTracks.count,
          deletedAlbums: deletedAlbums.count,
          deletedArtists: deletedArtists.count,
          affectedUsers: userIds,
        };
      },
      {
        timeout: 10000,
        isolationLevel: "Serializable",
      }
    );

    res.status(200).json(takedownRequest);
  } catch (err) {
    log.error(`takedownContent error: ${err}`);
    res.status(500).json({
      message: "Failed to takedown",
    });
  }
});

const get_artists_by_user_id = asyncHandler(async (req, res, next) => {
  const request = {
    userId: req.params.userId,
  };

  const artist = await prisma.artist.findMany({
    where: { userId: request.userId },
  });

  res.json({ success: true, data: artist });
});

export default {
  takedownContent,
  get_artists_by_user_id,
};
