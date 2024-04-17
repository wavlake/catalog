import db from "@library/db";
const log = require("loglevel");
const { Podcast } = require("podcast");
const { v5, validate } = require("uuid");
const {
  feedPath,
  receivingPublicKey,
  podcastNamespace,
  valueRecipient,
  valueTimeSplit,
} = require("@library/rssUtils");

// Error handling
// Ref: https://stackoverflow.com/questions/43356705/node-js-express-error-handling-middleware-with-router
const handleErrorAsync = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

exports.getMusicFeed = handleErrorAsync(async (req, res, next) => {
  const { feedId } = req.params;

  const validUuid = validate(feedId);

  if (!validUuid) {
    res.status(400).send("Invalid id");
    return;
  }

  const tracks = await db
    .knex("track")
    .join("artist", "track.artist_id", "=", "artist.id")
    .join("album", "track.album_id", "=", "album.id")
    .leftOuterJoin("music_genre", "album.genre_id", "=", "music_genre.id")
    .leftOuterJoin(
      "music_subgenre",
      "album.subgenre_id",
      "=",
      "music_subgenre.id"
    )
    .select(
      "album.id as albumId",
      "album.title as albumTitle",
      "album.artwork_url as artwork",
      "track.id as trackId",
      "track.title as trackTitle",
      "artist.name as artist",
      "artist.artist_url as artistUrl",
      "track.live_url as liveUrl",
      "track.order as order",
      "track.size as size",
      "track.duration as duration",
      "track.created_at as createDate",
      "track.deleted as deleted",
      "track.is_draft as isDraft",
      "track.is_explicit as isExplicit",
      "music_genre.name as genre",
      "music_subgenre.name as subgenre"
    )
    .where("track.deleted", false)
    .andWhere("track.album_id", "=", feedId)
    .andWhere("track.is_draft", false)
    .catch((err) => {
      log.debug(`Error querying tracks table to generate music feed: ${err}`);
      res.status(404).send("No such feed");
      return [];
    });

  if (tracks.length > 0) {
    const feed = await buildAlbumFeed(tracks);
    res.send(feed);
  } else {
    res.status(404).send("No such feed");
  }
});

async function buildAlbumFeed(data) {
  const [
    {
      albumId,
      artist,
      artwork,
      albumTitle,
      artistUrl,
      genre,
      subgenre,
      isExplicit,
    },
  ] = data;

  if (!albumId || !artist || !artwork || !albumTitle || !artistUrl) {
    throw new Error("Missing required data to build music feed");
  }
  const feed = new Podcast({
    generator: "Wavlake",
    title: albumTitle,
    // description: 'description',
    feedUrl: `https://${feedPath("album", albumId)}`,
    siteUrl: `https://wavlake.com/${artistUrl}`,
    // imageUrl: artwork,
    // docs: 'http://example.com/rss/docs.html',
    author: artist,
    // managingEditor: '',
    // webMaster: '',
    // copyright: '',
    // language: '',
    // categories: ['Category 1','Category 2','Category 3'],
    // pubDate: 'May 20, 2012 04:00:00 GMT',
    // ttl: 1440, // 24 hours
    // itunesAuthor: '',
    // itunesSubtitle: '',
    // itunesSummary: '',
    // itunesOwner: { name: '', email: '' },
    itunesExplicit: `${isExplicit ?? false}`,
    itunesCategory: [
      {
        text: `${genre ?? ""}`,
        subcats: [
          {
            text: `${subgenre ?? ""}`,
          },
        ],
      },
    ],
    itunesImage: `${artwork}`,
    customElements: [
      { "podcast:medium": "music" },
      {
        "podcast:guid": v5(feedPath("album", albumId), podcastNamespace),
      },
      {
        "podcast:value": [
          {
            _attr: {
              type: "lightning",
              method: "keysend",
            },
          },
          {
            "podcast:valueRecipient": {
              _attr: {
                name: `${albumTitle} via Wavlake`,
                type: "node",
                address: receivingPublicKey,
                customKey: 16180339,
                customValue: albumId,
                split: "100",
              },
            },
          },
        ],
      },
    ],
  });

  data.forEach((track) => {
    feed.addItem({
      title: track.trackTitle,
      // description: 'loremipsum',
      url: `https://www.wavlake.com/album/${track.albumId}`, // link to the item
      guid: track.trackId, // optional - defaults to url
      // categories: ['Category 1','Category 2','Category 3','Category 4'], // optional - array of item categories
      // author: 'Guest Author', // optional - defaults to feed author property
      date: track.createDate, // any format that js Date can parse.
      // lat: 33.417974, //optional latitude field for GeoRSS
      // long: -111.933231, //optional longitude field for GeoRSS
      enclosure: { url: track.liveUrl, size: track.size, type: "audio/mpeg" },
      // itunesAuthor: '',
      // itunesExplicit: false,
      // itunesSubtitle: '',
      // itunesSummary: '',
      itunesDuration: track.duration,
      // itunesNewFeedUrl: 'https://newlocation.com/example.rss',
      customElements: [
        { "podcast:episode": track.order },
        { "podcast:season": 1 },
        {
          "podcast:value": [
            {
              _attr: {
                type: "lightning",
                method: "keysend",
              },
            },
            {
              "podcast:valueRecipient": {
                _attr: {
                  name: `${artist} via Wavlake`,
                  type: "node",
                  address: receivingPublicKey,
                  customKey: 16180339,
                  customValue: track.trackId,
                  split: "100",
                },
              },
            },
          ],
        },
      ],
    });
  });

  return feed.buildXml("\t");
}

exports.getPodcastFeed = handleErrorAsync(async (req, res, next) => {
  const { feedId } = req.params;

  const validUuid = validate(feedId);

  if (!validUuid) {
    res.status(400).send("Invalid id");
    return;
  }
  const episodes = await db
    .knex("podcast")
    .join("episode", "podcast.id", "=", "episode.podcast_id")
    .leftOuterJoin(
      "podcast_category",
      "podcast.primary_category_id",
      "=",
      "podcast_category.id"
    )
    .leftOuterJoin(
      "podcast_subcategory",
      "podcast.primary_subcategory_id",
      "=",
      "podcast_subcategory.id"
    )
    .leftOuterJoin(
      "podcast_category as secondary_category",
      "podcast.secondary_category_id",
      "=",
      "secondary_category.id"
    )
    .leftOuterJoin(
      "podcast_subcategory as secondary_subcategory",
      "podcast.secondary_subcategory_id",
      "=",
      "secondary_subcategory.id"
    )
    .select(
      "podcast.id as podcastId",
      "podcast.name as author",
      "podcast.name as title",
      "podcast.artwork_url as artwork",
      "podcast.podcast_url as artistUrl",
      "podcast.description as description",
      "episode.id as episodeId",
      "episode.title as episodeTitle",
      "episode.live_url as liveUrl",
      "episode.order as order",
      "episode.size as size",
      "episode.description as episodeDescription",
      "episode.duration as duration",
      "episode.created_at as createDate",
      "episode.deleted as deleted",
      "episode.is_draft as isDraft",
      "podcast_category.name as primaryCategory",
      "podcast_subcategory.name as primarySubcategory",
      "secondary_category.name as secondaryCategory",
      "secondary_subcategory.name as secondarySubcategory"
    )
    .where("episode.deleted", false)
    .andWhere("podcast.id", "=", feedId)
    .andWhere("episode.is_draft", false)
    .catch((err) => {
      log.debug(`Error querying podcast table to generate feed: ${err}`);
      res.status(404).send({ error: "No such feed" });
      return [];
    });

  if (episodes.length > 0) {
    const feed = await buildPodcastFeed(episodes);
    res.send(feed);
  } else {
    // no episodes found
    res.status(404).send("No such feed");
  }
});

async function buildPodcastFeed(data) {
  // grab the first episode to get the podcast metadata
  const [
    {
      podcastId,
      author,
      title,
      artwork,
      artistUrl,
      description,
      primaryCategory,
      primarySubcategory,
      secondaryCategory,
      secondarySubcategory,
    },
  ] = data;
  const feed = new Podcast({
    generator: "Wavlake",
    title,
    description: description,
    feedUrl: `https://${feedPath("podcast", podcastId)}`,
    siteUrl: `https://wavlake.com/podcast/${artistUrl}`,
    // imageUrl: artwork,
    // docs: 'http://example.com/rss/docs.html',
    author,
    // managingEditor: '',
    // webMaster: '',
    // copyright: '',
    language: "en-US",
    // categories: ['Category 1','Category 2','Category 3'],
    // pubDate: 'May 20, 2012 04:00:00 GMT',
    // ttl: 1440, // 24 hours
    // itunesAuthor: '',
    // itunesSubtitle: '',
    // itunesSummary: '',
    itunesOwner: { name: "Wavlake", email: "contact@wavlake.com" },
    // itunesExplicit: false,
    itunesCategory: [
      {
        text: `${primaryCategory ?? ""}`,
        subcats: [
          {
            text: `${primarySubcategory ?? ""}`,
          },
        ],
      },
      {
        text: `${secondaryCategory ?? ""}`,
        subcats: [
          {
            text: `${secondarySubcategory ?? ""}`,
          },
        ],
      },
    ],
    itunesImage: artwork,
    customElements: [
      { "podcast:medium": "podcast" },
      // https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md#guid
      {
        "podcast:guid": v5(feedPath("podcast", podcastId), podcastNamespace),
      },
      {
        "podcast:value": [
          {
            _attr: {
              type: "lightning",
              method: "keysend",
            },
          },
          {
            "podcast:valueRecipient": {
              _attr: {
                name: `${title} via Wavlake`,
                type: "node",
                address: receivingPublicKey,
                customKey: 16180339,
                customValue: podcastId,
                split: "100",
              },
            },
          },
        ],
      },
    ],
  });

  await Promise.all(
    data.map(
      async ({
        episodeId,
        episodeTitle,
        episodeDescription,
        liveUrl,
        order,
        size,
        duration,
        createDate,
      }) => {
        const timeSplits = await db
          .knex("time_split")
          .join("episode", "time_split.content_id", "=", "episode.id")
          .select(
            "time_split.share_numerator as numerator",
            "time_split.share_denominator as denominator",
            "time_split.start_seconds as start_seconds",
            "time_split.end_seconds as end_seconds",
            "time_split.recipient_content_id as recipient_content_id"
          )
          .where("time_split.content_id", "=", episodeId)
          .catch((err) => {
            log.debug(`Error querying time_split table: ${err}`);
            return [];
          });

        // log.debug(timeSplits);

        // Generate individual time split blocks
        const timeSplitBlocks = await Promise.all(
          timeSplits.map(async (timeSplit) => {
            return valueTimeSplit(timeSplit);
          })
        );

        // log.debug(JSON.stringify(block[0]));
        feed.addItem({
          title: episodeTitle,
          description: episodeDescription,
          url: `https://www.wavlake.com/episode/${episodeId}`, // link to the item
          guid: episodeId, // optional - defaults to url
          // categories: ['Category 1','Category 2','Category 3','Category 4'], // optional - array of item categories
          // author: 'Guest Author', // optional - defaults to feed author property
          date: createDate, // any format that js Date can parse.
          // lat: 33.417974, //optional latitude field for GeoRSS
          // long: -111.933231, //optional longitude field for GeoRSS
          enclosure: { url: liveUrl, size: size, type: "audio/mpeg" },
          // itunesAuthor: '',
          // itunesExplicit: false,
          // itunesSubtitle: '',
          // itunesSummary: '',
          itunesDuration: duration,
          // itunesNewFeedUrl: 'https://newlocation.com/example.rss',
          customElements: [
            { "podcast:episode": order },
            { "podcast:season": 1 },
            {
              "podcast:value": [
                {
                  _attr: {
                    type: "lightning",
                    method: "keysend",
                  },
                },
                await valueRecipient(episodeId, title),
                ...timeSplitBlocks, // destructure the array
              ],
            },
          ],
        });
        return;
      }
    )
  );

  return feed.buildXml("\t");
}
