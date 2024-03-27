import db from "../../library/db";
const seeds = require("./splitAccountingSeeds");

export const setup = async () => {
  const trx = await db.knex.transaction();
  // order matters because of foreign key constraints
  await trx("user").insert([
    seeds.testerOneRecord,
    seeds.testerTwoRecord,
    seeds.testerThreeRecord,
  ]);
  await trx("artist").insert(seeds.testerOneArtistRecord);
  await trx("album").insert(seeds.testerOneAlbumRecord);
  await trx("track").insert(seeds.testerOneTrackRecord);
  trx.commit();

  // Add splits
  const splitId = await db
    .knex("split")
    .insert([seeds.splitRecord], "id")
    .then((data) => data[0].id);

  await db.knex("split_recipient").insert([
    {
      split_id: splitId,
      user_id: seeds.testerOneId,
      share: 900,
    },
    {
      split_id: splitId,
      user_id: seeds.testerThreeId,
      share: 100,
    },
  ]);
};

export const teardown = async () => {
  const trx = await db.knex.transaction();
  // order matters because of foreign key constraints
  await trx("split_recipient")
    .del()
    .whereIn("user_id", [seeds.testerOneId, seeds.testerThreeId]);
  await trx("split").del().whereIn("content_id", [seeds.testerOneTrackId]);
  await trx("track").del().whereIn("album_id", [seeds.testerOneAlbumId]);
  await trx("album").del().whereIn("artist_id", [seeds.testerOneArtistId]);
  await trx("artist")
    .del()
    .whereIn("user_id", [seeds.testerOneId, seeds.testerTwoId]);
  await trx("user")
    .del()
    .whereIn("id", [seeds.testerOneId, seeds.testerTwoId, seeds.testerThreeId]);
  return trx.commit();
};
