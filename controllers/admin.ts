import prisma from "../prisma/client";
import log from "../library/logger";
import s3Client from "../library/s3Client";
import cloudFrontClient from "../library/cloudFrontClient";
import { AWS_S3_TRACK_PREFIX, AWS_S3_RAW_PREFIX } from "../library/constants";
const asyncHandler = require("express-async-handler");

const takedownContent = asyncHandler(async (req, res) => {
  try {
    const { artistIds } = req.body;

    if (Array.isArray(artistIds) && artistIds.length === 0) {
      return res.status(400).json({
        message: "No artist IDs provided",
      });
    }

    log.info(`Received takedown request for artists`);
    log.info(artistIds);
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

    // First, get all track IDs that need to be deleted to clean up S3 later
    const tracksToDelete = await prisma.track.findMany({
      where: {
        artistId: {
          in: artistIds,
        },
      },
      select: {
        id: true,
      },
    });

    const trackIds = tracksToDelete.map((track) => track.id);
    log.info(`Tracks to delete: ${trackIds.length}`);
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
          trackIds: trackIds, // Return track IDs for S3 deletion
        };
      },
      {
        timeout: 10000,
        isolationLevel: "Serializable",
      }
    );
    log.info(`Takedown request completed: ${JSON.stringify(takedownRequest)}`);

    // if successful, clean up S3 and invalidate the cache
    if (takedownRequest.deletedTracks > 0 && trackIds.length > 0) {
      try {
        // Generate S3 keys for processed and raw MP3 files
        const processedS3Keys = trackIds.map(
          (id) => `${AWS_S3_TRACK_PREFIX}/${id}.mp3`
        );

        const rawS3Keys = trackIds.map(
          (id) => `${AWS_S3_RAW_PREFIX}/${id}.mp3`
        );

        // Combine all keys that need to be deleted
        const allS3Keys = [...processedS3Keys, ...rawS3Keys];

        // Use batch deletion instead of one-by-one, automatically handles large batches
        const s3DeleteResult = await s3Client.batchDeleteFromS3(allS3Keys);

        log.info(
          `S3 cleanup summary: ${s3DeleteResult.Deleted.length} objects deleted successfully`
        );

        // Use type assertion for s3DeleteResult to handle the TypeScript error
        const typedS3Result = s3DeleteResult as {
          Deleted: { Key: string }[];
          Errors?: { Key: string; Code: string; Message: string }[];
        };

        // Check if there were any errors during batch deletion
        if (typedS3Result.Errors && typedS3Result.Errors.length > 0) {
          log.warn(`S3 deletion had ${typedS3Result.Errors.length} failures`);
        }

        // Batch invalidate CloudFront cache for processed tracks, automatically handles large batches
        const cloudFrontResult = await cloudFrontClient.batchInvalidateCdn(
          processedS3Keys
        );

        log.info(
          `CloudFront cache invalidation initiated: ${JSON.stringify(
            cloudFrontResult
          )}`
        );
      } catch (error) {
        log.error(
          `Error in batch S3 deletion or CloudFront invalidation: ${error}`
        );
        // Continue with the response even if cleanup fails
      }
    }

    res.status(200).json({
      ...takedownRequest,
      s3Cleanup: takedownRequest.deletedTracks > 0 ? "completed" : "skipped",
      cacheInvalidation:
        takedownRequest.deletedTracks > 0 ? "initiated" : "skipped",
    });
  } catch (err) {
    log.error(`takedownContent error: ${err}`);
    res.status(500).json({
      message: "Failed to takedown",
    });
  }
});

// Rest of the code remains the same
const get_artists_by_user_id = asyncHandler(async (req, res, next) => {
  try {
    log.info("Getting artists by user ID");
    const userId = req.params.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication failed",
      });
    }

    const artists = await prisma.artist.findMany({
      where: { userId },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    res.json({ success: true, data: { artists, user } });
  } catch (err) {
    log.error(`get_artists_by_user_id error: ${err}`);
    res.status(500).json({
      message: "Failed to get artists by user ID",
    });
  }
});

export default {
  takedownContent,
  get_artists_by_user_id,
};
