import db from "../../library/db";
const setup = require("./splitAccountingSetup");
const seeds = require("./splitAccountingSeeds");
const amp = require("../../library/amp");

describe("Accounting integration tests", () => {
  beforeAll(() => {
    return setup.setup();
  });

  afterAll(() => {
    return setup.teardown();
  });

  // NOTE: Since db setup happens only once for all tests, the order of tests matters

  it("adjusts all balances correctly for a split", async () => {
    await amp.processSplits({
      contentId: seeds.testerOneTrackId,
      contentType: "track",
      msatAmount: 10000,
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

    const testerThreeBalance = await db
      .knex("user")
      .where({ id: seeds.testerThreeId })
      .select("msat_balance")
      .first()
      .then((user) => user.msat_balance);

    const trackBalance = await db
      .knex("track")
      .where({ id: seeds.testerOneTrackId })
      .select("msat_total")
      .first()
      .then((track) => track.msat_total);

    expect(testerOneBalance).toBe("18100");
    expect(testerTwoBalance).toBe("1000");
    expect(testerThreeBalance).toBe("10900");
    expect(trackBalance).toBe("10000");
  });
});
