import db from "../../library/db";
const seeds = require("./accountingSeeds");

export const setup = async () => {
  const trx = await db.knex.transaction();
  // order matters because of foreign key constraints
  await trx("user").insert([seeds.testerOneRecord, seeds.testerTwoRecord]);
  await trx("artist").insert(seeds.testerOneArtistRecord);
  await trx("album").insert(seeds.testerOneAlbumRecord);
  await trx("track").insert(seeds.testerOneTrackRecord);
  return trx.commit();
};

export const teardown = async () => {
  const trx = await db.knex.transaction();
  // order matters because of foreign key constraints
  await trx("track").del().whereIn("album_id", [seeds.testerOneAlbumId]);
  await trx("album").del().whereIn("artist_id", [seeds.testerOneArtistId]);
  await trx("artist")
    .del()
    .whereIn("user_id", [seeds.testerOneId, seeds.testerTwoId]);
  await trx("user").del().whereIn("id", [seeds.testerOneId, seeds.testerTwoId]);
  return trx.commit();
};
