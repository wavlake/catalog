import prisma from "../prisma/client";
import log from "../library/winston";
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
        // Delete processed MP3 files from S3
        const processedS3Keys = trackIds.map(
          (id) => `${AWS_S3_TRACK_PREFIX}/${id}.mp3`
        );

        // Delete raw files from S3
        const rawS3Keys = tracksToDelete.map(
          (track) => `${AWS_S3_RAW_PREFIX}/${track.id}.mp3`
        );

        // Combine all keys that need to be deleted
        const allS3Keys = [...processedS3Keys, ...rawS3Keys];

        // Delete objects in batches of 1000 (S3 limit for deleteObjects)
        for (let i = 0; i < allS3Keys.length; i += 1000) {
          const batch = allS3Keys.slice(i, i + 1000);

          await s3Client.deleteFromS3({
            Bucket: process.env.S3_BUCKET_NAME,
            Delete: {
              Objects: batch.map((key) => ({ Key: key })),
              Quiet: true,
            },
          });

          log.info(`Deleted batch of ${batch.length} S3 objects`);
        }

        // Invalidate CloudFront cache for each processed track
        for (const key of processedS3Keys) {
          try {
            await cloudFrontClient.invalidateCdn(key);
          } catch (error) {
            log.error(`Failed to invalidate cache for ${key}: ${error}`);
          }
        }

        log.info(
          `Created CloudFront invalidations for ${processedS3Keys.length} paths`
        );
      } catch (error) {
        log.error(`Error cleaning up S3 or CloudFront: ${error}`);
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

const get_artists_by_user_id = asyncHandler(async (req, res, next) => {
  try {
    log.info("Getting artists by user ID");
    const userId = req["uid"];

    if (!userId) {
      return res.status(401).json({
        message: "Authentication failed",
      });
    }

    const artist = await prisma.artist.findMany({
      where: { userId },
    });

    res.json({ success: true, data: artist });
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
