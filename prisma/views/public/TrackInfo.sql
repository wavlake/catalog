SELECT
  track.id,
  track.title,
  artist.name AS artist,
  artist.artist_url,
  artist.artwork_url AS avatar_url,
  artist.user_id,
  album.artwork_url,
  thirty.msat_total_30_days,
  seven.msat_total_7_days,
  one.msat_total_1_days,
  album.title AS album_title,
  track.live_url,
  track.duration,
  track.created_at,
  track.album_id,
  track.artist_id,
  track."order",
  track.is_processing,
  track.msat_total,
  track.published_at,
  track.is_draft,
  track.is_explicit,
  album.genre_id,
  album.subgenre_id,
  track.compressor_error,
  artist.npub AS artist_npub,
  promo.is_active AS has_promo,
  album.color_info
FROM
  (
    (
      (
        (
          (
            (
              track FULL
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
              ) thirty ON ((thirty.track_id = track.id))
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
            ) seven ON ((seven.track_id = track.id))
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
          ) one ON ((one.track_id = track.id))
        )
        JOIN album ON ((album.id = track.album_id))
      )
      JOIN artist ON ((artist.id = track.artist_id))
    ) FULL
    JOIN (
      SELECT
        promo_1.content_id,
        promo_1.is_active
      FROM
        promo promo_1
      WHERE
        (
          ((promo_1.content_type) :: text = 'track' :: text)
          AND (promo_1.is_active = TRUE)
        )
    ) promo ON ((promo.content_id = track.id))
  )
WHERE
  (track.deleted = false);