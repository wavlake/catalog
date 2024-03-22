exports.up = function (knex) {
  return knex.schema
    .createViewOrReplace("track_info", function (view) {
      view.columns([
        "id",
        "title",
        "artist",
        "artist_url",
        "avatar_url",
        "user_id",
        "artwork_url",
        "msat_total_30_days",
        "msat_total_7_days",
        "msat_total_1_days",
        "album_title",
        "live_url",
        "duration",
        "created_at",
        "album_id",
        "artist_id",
        "order",
        "is_processing",
        "msat_total",
        "published_at",
        "is_draft",
        "is_explicit",
        "genre_id",
        "subgenre_id",
      ]);
      view.as(
        knex.raw(
          `select 
              track.id as id, 
              track.title as title,
              artist.name as artist,
              artist.artist_url as artist_url,
              artist.artwork_url as avatar_url,
              artist.user_id as user_id,
              album.artwork_url as artwork_url,
              thirty.msat_total_30_days as msat_total_30_days, 
              seven.msat_total_7_days as msat_total_7_days,
              one.msat_total_1_days as msat_total_1_days, 
              album.title as album_title,
              track.live_url as live_url,
              track.duration as duration,
              track.created_at as created_at,
              track.album_id as album_id,
              track.artist_id as artist_id,
              track.order as order,
              track.is_processing as is_processing,
              track.msat_total as msat_total,
              track.published_at as published_at,
              track.is_draft as is_draft,
              track.is_explicit as is_explicit,
              album.genre_id as genre_id,
              album.subgenre_id as subgenre_id
              from public.track
              full outer join 
              (select track_id, 
                      sum(msat_amount) as msat_total_30_days 
                      from public.amp 
                      where created_at > date_trunc('day', NOW() - INTERVAL '30 days')
                      and created_at < date_trunc('day', NOW()) 
                      group by track_id) thirty 
              on thirty.track_id = track.id
              full outer join 
              (select track_id, 
                      sum(msat_amount) as msat_total_7_days 
                      from public.amp 
                      where created_at > date_trunc('day', NOW() - INTERVAL '7 days') 
                      and created_at < date_trunc('day', NOW())
                      group by track_id) seven 
              on seven.track_id = track.id
              full outer join 
              (select track_id, 
                      sum(msat_amount) as msat_total_1_days 
                      from public.amp 
                      where created_at > date_trunc('day', NOW() - INTERVAL '1 days')
                      and created_at < date_trunc('day', NOW())
                      group by track_id) one
              on one.track_id = track.id
              join public.album on album.id = track.album_id
              join public.artist on artist.id = track.artist_id
              where track.deleted = false`
        )
      );
    })
    .createViewOrReplace("episode_info", function (view) {
      view.columns([
        "id",
        "title",
        "description",
        "podcast",
        "podcastUrl",
        "artworkUrl",
        "msatTotal30Days",
        "msatTotal7Days",
        "msatTotal1Days",
        "liveUrl",
        "duration",
        "createdAt",
        "podcastId",
        "order",
        "isProcessing",
        "publishedAt",
        "isDraft",
        "userId",
        "isExplicit",
      ]);
      view.as(
        knex.raw(
          `select 
            episode.id as id, 
            episode.title as title,
            episode.description as description,
            podcast.name as podcast,
            podcast.podcast_url as podcastUrl,
            podcast.artwork_url as artworkUrl,
            thirty.msat_total_30_days as msatTotal30Days, 
            seven.msat_total_7_days as msatTotal7Days,
            one.msat_total_1_days as msatTotal1Days, 
            episode.live_url as liveUrl,
            episode.duration as duration,
            episode.created_at as createdAt,
            episode.podcast_id as podcastId,
            episode.order as order,
            episode.is_processing as isProcessing,
            episode.published_at as publishedAt,
            episode.is_draft as isDraft,
            podcast.user_id as userId,
            episode.is_explicit as isExplicit
            from public.episode
            full outer join 
            (select track_id, 
                    sum(msat_amount) as msat_total_30_days 
                    from public.amp 
                    where created_at > date_trunc('day', NOW() - INTERVAL '30 days')
                    and created_at < date_trunc('day', NOW()) 
                    group by track_id) thirty 
            on thirty.track_id = episode.id
            full outer join 
            (select track_id, 
                    sum(msat_amount) as msat_total_7_days 
                    from public.amp 
                    where created_at > date_trunc('day', NOW() - INTERVAL '7 days')
                    and created_at < date_trunc('day', NOW())
                    group by track_id) seven 
            on seven.track_id = episode.id
            full outer join 
            (select track_id, 
                    sum(msat_amount) as msat_total_1_days 
                    from public.amp 
                    where created_at > date_trunc('day', NOW() - INTERVAL '1 days')
                    and created_at < date_trunc('day', NOW())
                    group by track_id) one 
            on one.track_id = episode.id
            join public.podcast on podcast.id = episode.podcast_id
            where episode.deleted = false`
        )
      );
    });
};

exports.down = function (knex) {
  return knex.schema
    .createViewOrReplace("track_info", function (view) {
      view.columns([
        "id",
        "title",
        "artist",
        "artist_url",
        "avatar_url",
        "user_id",
        "artwork_url",
        "msat_total_30_days",
        "msat_total_7_days",
        "msat_total_1_days",
        "album_title",
        "live_url",
        "duration",
        "created_at",
        "album_id",
        "artist_id",
        "order",
        "is_processing",
        "msat_total",
        "published_at",
        "is_draft",
        "is_explicit",
        "genre_id",
        "subgenre_id",
      ]);
      view.as(
        knex.raw(
          `select 
                track.id as id, 
                track.title as title,
                artist.name as artist,
                artist.artist_url as artist_url,
                artist.artwork_url as avatar_url,
                artist.user_id as user_id,
                album.artwork_url as artwork_url,
                thirty.msat_total_30_days as msat_total_30_days, 
                seven.msat_total_7_days as msat_total_7_days,
                one.msat_total_1_days as msat_total_1_days, 
                album.title as album_title,
                track.live_url as live_url,
                track.duration as duration,
                track.created_at as created_at,
                track.album_id as album_id,
                track.artist_id as artist_id,
                track.order as order,
                track.is_processing as is_processing,
                track.msat_total as msat_total,
                track.published_at as published_at,
                album.is_draft as is_draft,
                track.is_explicit as is_explicit,
                album.genre_id as genre_id,
                album.subgenre_id as subgenre_id
                from public.track
                full outer join 
                (select track_id, 
                        sum(msat_amount) as msat_total_30_days 
                        from public.amp 
                        where created_at > date_trunc('day', NOW() - INTERVAL '30 days')
                        and created_at < date_trunc('day', NOW()) 
                        group by track_id) thirty 
                on thirty.track_id = track.id
                full outer join 
                (select track_id, 
                        sum(msat_amount) as msat_total_7_days 
                        from public.amp 
                        where created_at > date_trunc('day', NOW() - INTERVAL '7 days') 
                        and created_at < date_trunc('day', NOW())
                        group by track_id) seven 
                on seven.track_id = track.id
                full outer join 
                (select track_id, 
                        sum(msat_amount) as msat_total_1_days 
                        from public.amp 
                        where created_at > date_trunc('day', NOW() - INTERVAL '1 days')
                        and created_at < date_trunc('day', NOW())
                        group by track_id) one
                on one.track_id = track.id
                join public.album on album.id = track.album_id
                join public.artist on artist.id = track.artist_id
                where track.deleted = false`
        )
      );
    })
    .createViewOrReplace("episode_info", function (view) {
      view.columns([
        "id",
        "title",
        "description",
        "podcast",
        "podcastUrl",
        "artworkUrl",
        "msatTotal30Days",
        "msatTotal7Days",
        "msatTotal1Days",
        "liveUrl",
        "duration",
        "createdAt",
        "podcastId",
        "order",
        "isProcessing",
        "publishedAt",
        "isDraft",
        "userId",
        "isExplicit",
      ]);
      view.as(
        knex.raw(
          `select 
              episode.id as id, 
              episode.title as title,
              episode.description as description,
              podcast.name as podcast,
              podcast.podcast_url as podcastUrl,
              podcast.artwork_url as artworkUrl,
              thirty.msat_total_30_days as msatTotal30Days, 
              seven.msat_total_7_days as msatTotal7Days,
              one.msat_total_1_days as msatTotal1Days, 
              episode.live_url as liveUrl,
              episode.duration as duration,
              episode.created_at as createdAt,
              episode.podcast_id as podcastId,
              episode.order as order,
              episode.is_processing as isProcessing,
              episode.published_at as publishedAt,
              podcast.is_draft as isDraft,
              podcast.user_id as userId,
              episode.is_explicit as isExplicit
              from public.episode
              full outer join 
              (select track_id, 
                      sum(msat_amount) as msat_total_30_days 
                      from public.amp 
                      where created_at > date_trunc('day', NOW() - INTERVAL '30 days')
                      and created_at < date_trunc('day', NOW()) 
                      group by track_id) thirty 
              on thirty.track_id = episode.id
              full outer join 
              (select track_id, 
                      sum(msat_amount) as msat_total_7_days 
                      from public.amp 
                      where created_at > date_trunc('day', NOW() - INTERVAL '7 days')
                      and created_at < date_trunc('day', NOW())
                      group by track_id) seven 
              on seven.track_id = episode.id
              full outer join 
              (select track_id, 
                      sum(msat_amount) as msat_total_1_days 
                      from public.amp 
                      where created_at > date_trunc('day', NOW() - INTERVAL '1 days')
                      and created_at < date_trunc('day', NOW())
                      group by track_id) one 
              on one.track_id = episode.id
              join public.podcast on podcast.id = episode.podcast_id
              where episode.deleted = false`
        )
      );
    });
};
