exports.up = function (knex) {
  return knex.schema
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
          episode.is_processing as isProcessing
          from public.episode
          full outer join 
          (select track_id, 
                  sum(msat_amount) as msat_total_30_days 
                  from public.amp 
                  where created_at > NOW() - INTERVAL '30 days'
                  and created_at < date_trunc('day', NOW()) 
                  group by track_id) thirty 
          on thirty.track_id = episode.id
          full outer join 
          (select track_id, 
                  sum(msat_amount) as msat_total_7_days 
                  from public.amp 
                  where created_at > NOW() - INTERVAL '7 days' 
                  and created_at < date_trunc('day', NOW())
                  group by track_id) seven 
          on seven.track_id = episode.id
          full outer join 
          (select track_id, 
                  sum(msat_amount) as msat_total_1_days 
                  from public.amp 
                  where created_at > NOW() - INTERVAL '1 days'
                  and created_at < date_trunc('day', NOW())
                  group by track_id) one 
          on one.track_id = episode.id
          join public.podcast on podcast.id = episode.podcast_id
          where episode.deleted = false`
        )
      );
    })
    .alterTable("split_recipient", function (table) {
      table.foreign("user_id").references("user.id");
    });
};

exports.down = function (knex) {
  return knex.schema
    .createViewOrReplace("episode_info", function (view) {
      view.columns([
        "id",
        "title",
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
      ]);
      view.as(
        knex.raw(
          `select
            episode.id as id,
            episode.title as title,
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
            episode.is_processing as isProcessing
            from public.episode
            full outer join
            (select track_id,
                    sum(msat_amount) as msat_total_30_days
                    from public.amp
                    where created_at > NOW() - INTERVAL '30 days'
                    and created_at < date_trunc('day', NOW())
                    group by track_id) thirty
            on thirty.track_id = episode.id
            full outer join
            (select track_id,
                    sum(msat_amount) as msat_total_7_days
                    from public.amp
                    where created_at > NOW() - INTERVAL '7 days'
                    and created_at < date_trunc('day', NOW())
                    group by track_id) seven
            on seven.track_id = episode.id
            full outer join
            (select track_id,
                    sum(msat_amount) as msat_total_1_days
                    from public.amp
                    where created_at > NOW() - INTERVAL '1 days'
                    and created_at < date_trunc('day', NOW())
                    group by track_id) one
            on one.track_id = episode.id
            join public.podcast on podcast.id = episode.podcast_id
            where episode.deleted = false`
        )
      );
    })
    .alterTable("split_recipient", function (table) {
      table.dropForeign("user_id");
    });
};
