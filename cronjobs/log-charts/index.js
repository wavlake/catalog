require("dotenv").config();
const log = require("loglevel");
log.setLevel(process.env.LOGLEVEL);
const db = require("./db");
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE);

const getTopHundred = async () => {
  return db
    .knex("track_info")
    .orderBy("msat_total_7_days", "desc")
    .where("msat_total_7_days", ">", 0)
    .limit(CHUNK_SIZE)
    .catch((e) => {
      log.debug(`ERROR: ${e}`);
    });
};

const run = async () => {
  const topHundred = await getTopHundred();

  const topHundredWithRank = topHundred.map((row, index) => {
    const ranking = index + 1;
    return { track_id: row.id, rank: ranking };
  });

  db.knex.batchInsert("ranking_forty", topHundredWithRank).then(() => {
    log.debug("Done");
    process.exit();
  });
};

run();
