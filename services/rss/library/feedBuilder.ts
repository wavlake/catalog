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
  OP3_PREFIX,
} = require("@library/rssUtils");

const buildAlbumFeed = async (data) => {
  const [
    {
      albumId,
      artist,
      artistId,
      artwork,
      albumTitle,
      artistUrl,
      genre,
      subgenre,
      isExplicit,
      description,
    },
  ] = data;

  if (
    !albumId ||
    !artist ||
    !artistId ||
    !artwork ||
    !albumTitle ||
    !artistUrl
  ) {
    throw new Error("Missing required data to build music feed");
  }

  const feed = new Podcast({
    generator: "Wavlake",
    title: albumTitle,
    description: `${description ? description : ""}`,
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
    itunesImage: `${artwork}`,
    customElements: [
      { "podcast:medium": "music" },
      {
        "podcast:remoteItem": [
          { _attr: { medium: "publisher" } },
          { _attr: { feedGuid: artistId } },
          { _attr: { feedUrl: `https://${feedPath("artist", artistId)}` } },
        ],
      },
      {
        "podcast:category": [
          { _attr: { text: genre } },
          { "podcast:category": { _attr: { text: subgenre } } },
        ],
      },
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
      enclosure: {
        url: `${OP3_PREFIX},pg=${v5(
          feedPath("album", albumId),
          podcastNamespace
        )}/${track.liveUrl}`,
        size: track.size,
        type: "audio/mpeg",
      },
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
};

const buildArtistFeed = async (data) => {
  const [
    { artistId, artistUrl, artist, bio, albumId, albumTitle, artworkUrl },
  ] = data;

  if (
    !artistId ||
    !albumId ||
    !artistUrl ||
    !artist ||
    !albumTitle ||
    !artworkUrl
  ) {
    throw new Error("Missing required data to build artist feed");
  }

  const albums = data.map((album) => {
    return {
      "podcast:remoteItem": {
        _attr: {
          medium: "music",
          feedGuid: album.albumId,
          feedUrl: `https://${feedPath("album", album.albumId)}`,
        },
      },
    };
  });

  const feed = new Podcast({
    generator: "Wavlake",
    title: artist,
    description: bio,
    imageUrl: artworkUrl,
    siteUrl: `https://wavlake.com/${artistUrl}`,
    // docs: 'http://example.com/rss/docs.html',
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
    customElements: [
      { "podcast:medium": "publisher" },
      {
        "podcast:guid": `${artistId}`,
      },
      ...albums,
    ],
  });

  // data.forEach((album) => {
  //   feed.addItem({
  //     customElements: [
  //       {
  //         "podcast:remoteItem": {
  //           _attr: {
  //             medium: "music",
  //             feedGuid: album.albumId,
  //             feedUrl: `https://${feedPath("album", album.albumId)}`,
  //           },
  //         },
  //       },
  //     ],
  //   });
  // });

  return feed.buildXml("\t");
};

const buildPodcastFeed = async (data) => {
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
            log.error(`Error querying time_split table: ${err}`);
            return [];
          });

        // log.info(timeSplits);

        // Generate individual time split blocks
        const timeSplitBlocks = await Promise.all(
          timeSplits.map(async (timeSplit) => {
            return valueTimeSplit(timeSplit);
          })
        );

        // log.info(JSON.stringify(block[0]));
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
          enclosure: {
            url: `${OP3_PREFIX},pg=${v5(
              feedPath("podcast", podcastId),
              podcastNamespace
            )}/${liveUrl}`,
            size: size,
            type: "audio/mpeg",
          },
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
};

module.exports = {
  buildAlbumFeed,
  buildArtistFeed,
  buildPodcastFeed,
};
