SELECT
  episode.id,
  episode.title,
  episode.description,
  podcast.name AS podcast,
  podcast.podcast_url AS "podcastUrl",
  podcast.artwork_url AS "artworkUrl",
  thirty.msat_total_30_days AS "msatTotal30Days",
  seven.msat_total_7_days AS "msatTotal7Days",
  one.msat_total_1_days AS "msatTotal1Days",
  episode.live_url AS "liveUrl",
  episode.duration,
  episode.created_at AS "createdAt",
  episode.podcast_id AS "podcastId",
  episode."order",
  episode.is_processing AS "isProcessing",
  episode.published_at AS "publishedAt",
  episode.is_draft AS "isDraft",
  podcast.user_id AS "userId",
  episode.is_explicit AS "isExplicit"
FROM
  (
    (
      (
        (
          episode FULL
          JOIN (
            SELECT
              amp.track_id,
              sum(amp.msat_amount) AS msat_total_30_days
            FROM
              amp
            WHERE
              (
                (
                  amp.created_at > date_trunc('day' :: text, (NOW() - '30 days' :: INTERVAL))
                )
                AND (amp.created_at < date_trunc('day' :: text, NOW()))
              )
            GROUP BY
              amp.track_id
          ) thirty ON ((thirty.track_id = episode.id))
        ) FULL
        JOIN (
          SELECT
            amp.track_id,
            sum(amp.msat_amount) AS msat_total_7_days
          FROM
            amp
          WHERE
            (
              (
                amp.created_at > date_trunc('day' :: text, (NOW() - '7 days' :: INTERVAL))
              )
              AND (amp.created_at < date_trunc('day' :: text, NOW()))
            )
          GROUP BY
            amp.track_id
        ) seven ON ((seven.track_id = episode.id))
      ) FULL
      JOIN (
        SELECT
          amp.track_id,
          sum(amp.msat_amount) AS msat_total_1_days
        FROM
          amp
        WHERE
          (
            (
              amp.created_at > date_trunc('day' :: text, (NOW() - '1 day' :: INTERVAL))
            )
            AND (amp.created_at < date_trunc('day' :: text, NOW()))
          )
        GROUP BY
          amp.track_id
      ) one ON ((one.track_id = episode.id))
    )
    JOIN podcast ON ((podcast.id = episode.podcast_id))
  )
WHERE
  (episode.deleted = false);