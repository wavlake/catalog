exports.up = function (knex) {
  return knex.schema
    .dropViewIfExists("track_info")
    .createViewOrReplace("track_info", function (view) {
      view.columns([
        "id",
        "title",
        "artist",
        "artist_url",
        "avatar_url",
        "artwork_url",
        "msat_total_30_days",
        "msat_total_14_days",
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
      ]);
      view.as(
        knex.raw(
          `select 
              track.id as id, 
              track.title as title,
              artist.name as artist,
              artist.artist_url as artist_url,
              artist.artwork_url as avatar_url,
              album.artwork_url as artwork_url,
              thirty.msat_total_30_days as msat_total_30_days,
              fornight.msat_total_14_days as msat_total_14_days,
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
              track.published_at as published_at
              from public.track
              full outer join 
              (select track_id, 
                      sum(msat_amount) as msat_total_30_days 
                      from public.amp 
                      where created_at > NOW() - INTERVAL '30 days'
                      and created_at < date_trunc('day', NOW()) 
                      group by track_id) thirty 
              on thirty.track_id = track.id
              full outer join
              (select track_id, 
                sum(msat_amount) as msat_total_14_days 
                from public.amp 
                where created_at > NOW() - INTERVAL '14 days'
                and created_at < date_trunc('day', NOW()) 
                group by track_id) fornight 
              on fornight.track_id = track.id
              full outer join 
              (select track_id, 
                      sum(msat_amount) as msat_total_7_days 
                      from public.amp 
                      where created_at > NOW() - INTERVAL '7 days' 
                      and created_at < date_trunc('day', NOW())
                      group by track_id) seven 
              on seven.track_id = track.id
              full outer join 
              (select track_id, 
                      sum(msat_amount) as msat_total_1_days 
                      from public.amp 
                      where created_at > NOW() - INTERVAL '1 days'
                      and created_at < date_trunc('day', NOW())
                      group by track_id) one
              on one.track_id = track.id
              join public.album on album.id = track.album_id
              join public.artist on artist.id = track.artist_id
              where track.deleted = false`
        )
      );
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropViewIfExists("track_info")
    .createViewOrReplace("track_info", function (view) {
      view.columns([
        "id",
        "title",
        "artist",
        "artist_url",
        "avatar_url",
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
      ]);
      view.as(
        knex.raw(
          `select 
              track.id as id, 
              track.title as title,
              artist.name as artist,
              artist.artist_url as artist_url,
              artist.artwork_url as avatar_url,
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
              track.published_at as published_at
              from public.track
              full outer join 
              (select track_id, 
                      sum(msat_amount) as msat_total_30_days 
                      from public.amp 
                      where created_at > NOW() - INTERVAL '30 days'
                      and created_at < date_trunc('day', NOW()) 
                      group by track_id) thirty 
              on thirty.track_id = track.id
              full outer join 
              (select track_id, 
                      sum(msat_amount) as msat_total_7_days 
                      from public.amp 
                      where created_at > NOW() - INTERVAL '7 days' 
                      and created_at < date_trunc('day', NOW())
                      group by track_id) seven 
              on seven.track_id = track.id
              full outer join 
              (select track_id, 
                      sum(msat_amount) as msat_total_1_days 
                      from public.amp 
                      where created_at > NOW() - INTERVAL '1 days'
                      and created_at < date_trunc('day', NOW())
                      group by track_id) one
              on one.track_id = track.id
              join public.album on album.id = track.album_id
              join public.artist on artist.id = track.artist_id
              where track.deleted = false`
        )
      );
    });
};
