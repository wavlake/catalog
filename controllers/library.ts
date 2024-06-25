import asyncHandler from "express-async-handler";
import { Event } from "nostr-tools";
import prisma from "../prisma/client";
import { formatError } from "../library/errors";
import db from "../library/db";

const get_user_library = ({
  artists = false,
  albums = false,
  tracks = false,
  playlists = false,
}: {
  artists?: boolean;
  albums?: boolean;
  tracks?: boolean;
  playlists?: boolean;
}) =>
  asyncHandler(async (req, res, next) => {
    try {
      const { pubkey } = res.locals.authEvent as Event;

      if (!pubkey) {
        const error = formatError(400, "No pubkey found");
        next(error);
        return;
      }

      const libraryArtists = artists
        ? await db
            .knex("library")
            .join("artist", "library.content_id", "artist.id")
            .select(
              "artist.id as id",
              "artist.name as name",
              "artist.artwork_url as artworkUrl",
              "artist.artist_url as artistUrl",
              "artist.updated_at as updatedAt",
              "artist.bio as bio",
              "artist.twitter as twitter",
              "artist.youtube as youtube",
              "artist.website as website",
              "artist.deleted as deleted",
              "artist.verified as verified",
              "artist.npub as npub"
            )
            .orderBy("library.created_at", "desc")
            .where("library.user_id", "=", pubkey)
        : [];

      const libraryAlbums = albums
        ? await db
            .knex("library")
            .join("album", "library.content_id", "album.id")
            .join("artist", "artist.id", "album.artist_id")
            .select(
              "album.id as id",
              "album.created_at as createdAt",
              "album.artist_id as artistId",
              "artist.name as artist",
              "album.title as title",
              "album.artwork_url as artworkUrl",
              "album.updated_at as updatedAt",
              "album.description as description",
              "album.deleted as deleted",
              "album.genre_id as genreId",
              "album.subgenre_id as subgenreId",
              "album.published_at as publishedAt"
            )
            .orderBy("library.created_at", "desc")
            .where("library.user_id", "=", pubkey)
        : [];

      const libraryTracks = tracks
        ? await db
            .knex("library")
            .join("track_info", "library.content_id", "track_info.id")
            .select(
              "track_info.id as id",
              "track_info.created_at as createdAt",
              "track_info.title as title",
              "track_info.artist as artist",
              "track_info.artist_url as artistUrl",
              "track_info.avatar_url as avatarUrl",
              "track_info.artwork_url as artworkUrl",
              "track_info.msat_total_30_days as msatTotal30Days",
              "track_info.msat_total_7_days as msatTotal7Days",
              "track_info.msat_total_1_days as msatTotal1Days",
              "track_info.album_title as albumTitle",
              "track_info.live_url as liveUrl",
              "track_info.duration as duration",
              "track_info.album_id as albumId",
              "track_info.artist_id as artistId",
              "track_info.order as order",
              "track_info.msat_total as msatTotal"
            )
            .orderBy("library.created_at", "desc")
            .where({
              "library.user_id": pubkey,
            })
        : [];

      const PLAYLIST_TRACKS = db
        .knex("playlist_track")
        .join("track_info", "track_info.id", "=", "playlist_track.track_id")
        .select(
          "playlist_id",
          "track_info.id",
          "track_info.title",
          "track_info.duration",
          "track_info.artist",
          "track_info.artwork_url",
          "playlist_track.order_int as order"
        )
        .as("playlist_tracks_info");

      const libraryPlaylists = playlists
        ? await db
            .knex("library")
            .join("playlist", "library.content_id", "playlist.id")
            .join(
              PLAYLIST_TRACKS,
              "playlist.id",
              "=",
              "playlist_tracks_info.playlist_id"
            )
            .leftOuterJoin("npub", "playlist.user_id", "npub.public_hex")
            .select(
              "playlist.id as id",
              "playlist.created_at as createdAt",
              "playlist.title as title",
              "playlist.updated_at as updatedAt",
              db.knex.raw("npub.metadata::jsonb -> 'picture' as picture"),
              db.knex.raw("npub.metadata::jsonb -> 'name' as name"),
              db.knex.raw("MIN(playlist.user_id) as user_id"),
              db.knex.raw(`
              json_agg(
                json_build_object(
                  'id', playlist_tracks_info.id,
                  'title', playlist_tracks_info.title,
                  'duration', playlist_tracks_info.duration,
                  'artist', playlist_tracks_info.artist,
                  'artworkUrl', playlist_tracks_info.artwork_url,
                  'order', playlist_tracks_info.order
                ) ORDER BY playlist_tracks_info.order
              ) as tracks
            `)
            )
            .groupBy(
              "playlist.id",
              "playlist.created_at",
              "playlist.title",
              "playlist.updated_at",
              "npub.metadata",
              "library.created_at"
            )
            .orderBy("library.created_at", "desc")
            .where("library.user_id", "=", pubkey)
            .whereRaw("LENGTH(playlist.user_id) = 64")
        : [];

      res.json({
        success: true,
        data: {
          ...(artists ? { artists: libraryArtists } : {}),
          ...(albums ? { albums: libraryAlbums } : {}),
          ...(tracks ? { tracks: libraryTracks } : {}),
          ...(playlists ? { playlists: libraryPlaylists } : {}),
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

    const { contentId } = req.body;

    if (!contentId) {
      const error = formatError(400, "contentID missing from request body");
      next(error);
      return;
    }

    // check if content id exist in the database already
    const existingContent = await prisma.library.findFirst({
      where: {
        content_id: contentId,
        user_id: pubkey,
      },
    });

    if (existingContent) {
      const error = formatError(400, "This content is already in your library");
      next(error);
      return;
    }

    await prisma.library.create({
      data: {
        user_id: pubkey,
        content_id: contentId,
      },
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

    const { id } = req.params;

    if (!id) {
      const error = formatError(
        400,
        "Request must include a content id as a param (e.g. /library/abc-123)"
      );
      next(error);
      return;
    }

    await prisma.library.deleteMany({
      where: {
        user_id: pubkey,
        content_id: {
          in: [id],
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
