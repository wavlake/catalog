exports.up = function (knex) {
  return knex.schema
    .createTable("podcast", function (table) {
      table.uuid("id").primary().unique();
      table.string("user_id").notNullable().index("idx_podcast_user_id");
      table.foreign("user_id").references("user.id");
      table.string("name").notNullable();
      table.string("artwork_url");
      table
        .string("podcast_url")
        .notNullable()
        .unique()
        .index("idx_podcast_url");
      table.string("description", 1000);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.timestamp("published_at").defaultTo(knex.fn.now());
      table.boolean("deleted").defaultTo(false);
      table.boolean("is_draft").defaultTo(true);
      table.string("twitter");
      table.string("instagram");
      table.string("youtube");
      table.string("website");
      table.string("npub");
    })
    .createTable("episode", function (table) {
      table.uuid("id").primary().unique();
      table.string("title").notNullable();
      table.string("description", 1000);
      table.uuid("podcast_id").notNullable().index("idx_episode_podcast_id");
      table.foreign("podcast_id").references("podcast.id");
      table.integer("order").unsigned().notNullable();
      table.integer("play_count").unsigned().defaultTo(0);
      table.bigInteger("msat_total").unsigned().defaultTo(0);
      table.string("live_url").notNullable();
      table.string("raw_url", 128);
      table.integer("size").unsigned();
      table.integer("duration").unsigned();
      table.boolean("deleted").defaultTo(false);
      table.boolean("is_draft").defaultTo(true);
      table.boolean("is_processing").defaultTo(false);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.timestamp("published_at").defaultTo(knex.fn.now());
    })
    .alterTable("album", function (table) {
      table.boolean("is_draft").defaultTo(false);
      table.timestamp("published_at").defaultTo(knex.fn.now());
    })
    .createView("episode_info", function (view) {
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
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropView("episode_info")
    .dropTableIfExists("episode")
    .dropTableIfExists("podcast")
    .alterTable("album", function (table) {
      table.dropColumn("is_draft");
      table.dropColumn("published_at");
    });
};
