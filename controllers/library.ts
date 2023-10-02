import asyncHandler from "express-async-handler";
import { Event } from "nostr-tools";
import prisma from "../prisma/client";
import { formatError } from "../library/errors";
import db from "../library/db";

const get_user_library = ({
  artists = false,
  albums = false,
  tracks = false,
}: {
  artists?: boolean;
  albums?: boolean;
  tracks?: boolean;
}) =>
  asyncHandler(async (req, res, next) => {
    try {
      const { pubkey = "123" } = res.locals.authEvent as Event;

      const libraryArtists = artists
        ? await db
            .knex("library")
            .join("artists", "library.content_id", "artists.id")
            .where({
              user_id: pubkey,
            })
        : [];

      const libraryAlbums = albums
        ? await db
            .knex("library")
            .join("albums", "library.content_id", "albums.id")
            .where({
              user_id: pubkey,
            })
        : [];

      const libraryTracks = tracks
        ? await db
            .knex("library")
            .join("tracks", "library.content_id", "tracks.id")
            .where({
              user_id: pubkey,
            })
        : [];

      res.json({
        success: true,
        data: {
          ...(artists ? { artists: libraryArtists } : {}),
          ...(albums ? { albums: libraryAlbums } : {}),
          ...(tracks ? { tracks: libraryTracks } : {}),
        },
      });
    } catch (err) {
      const error = formatError(500, err);
      next(error);
    }
  });

const add_to_library = asyncHandler(async (req, res, next) => {
  try {
    const { pubkey } = res.locals.authEvent as Event;

    if (!pubkey) {
      const error = formatError(400, "No pubkey found");
      next(error);
      return;
    }

    const { contentIds = [] } = req.body;

    if (!contentIds.length) {
      const error = formatError(
        400,
        "Request must include a list of content ids"
      );
      next(error);
      return;
    }

    await prisma.library.createMany({
      data: contentIds.map((contentId) => ({
        user_id: pubkey,
        content_id: contentId,
      })),
    });

    res.json({ success: true });
  } catch (err) {
    const error = formatError(500, err);
    next(error);
  }
});

const remove_from_library = asyncHandler(async (req, res, next) => {
  try {
    const { pubkey } = res.locals.authEvent as Event;

    if (!pubkey) {
      const error = formatError(400, "No pubkey found");
      next(error);
      return;
    }
    const { contentIds = [] } = req.body;

    if (!contentIds.length) {
      const error = formatError(
        400,
        "Request must include a list of content ids"
      );
      next(error);
      return;
    }

    await prisma.library.deleteMany({
      where: {
        user_id: pubkey,
        content_id: {
          in: contentIds,
        },
      },
    });

    res.json({ success: true });
  } catch (err) {
    const error = formatError(500, err);
    next(error);
  }
});

export default {
  get_user_library,
  add_to_library,
  remove_from_library,
};
