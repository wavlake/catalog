import db from "../../library/db";
const database = require("./database");
const seeds = require("./seeds");
const amp = require("../../library/amp");

describe("Accounting integration tests", () => {
  beforeAll(() => {
    return database.setup();
  });

  afterAll(() => {
    return database.teardown();
  });

  it("amps should adjust all balances accurately", async () => {
    await amp.processSplits({
      contentId: seeds.testerOneTrackId,
      contentType: "track",
      msatAmount: 1000,
      paymentType: 1,
      userId: seeds.testerTwoId,
    });

    const testerOneBalance = await db
      .knex("user")
      .where({ id: seeds.testerOneId })
      .select("msat_balance")
      .first()
      .then((user) => user.msat_balance);

    const testerTwoBalance = await db
      .knex("user")
      .where({ id: seeds.testerTwoId })
      .select("msat_balance")
      .first()
      .then((user) => user.msat_balance);

    const trackBalance = await db
      .knex("track")
      .where({ id: seeds.testerOneTrackId })
      .select("msat_total")
      .first()
      .then((track) => track.msat_total);

    expect(testerOneBalance).toBe("10900");
    expect(testerTwoBalance).toBe("9000");
    expect(trackBalance).toBe("1000");
  });
});
