exports.up = function (knex) {
  return knex.schema.createViewOrReplace("track_info", function (view) {
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
      "compressor_error",
      "artist_npub",
      "has_promo",
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
                    album.subgenre_id as subgenre_id,
                    track.compressor_error as compressor_error,
                    artist.npub as artist_npub,
                    promo.is_active as has_promo
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
                    full outer join
                    (select content_id, 
                            is_active 
                            from public.promo
                            where content_type = 'track' 
                            and is_active = true) as promo
                    on promo.content_id = track.id
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
        "compressor_error",
        "artist_npub",
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
                      album.subgenre_id as subgenre_id,
                      track.compressor_error as compressor_error,
                      artist.npub as artist_npub
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
    });
};
