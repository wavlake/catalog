import db from "../../library/db";
const setup = require("./lnAddressSetup");
const seeds = require("./lnAddressSeeds");
const amp = require("../../library/amp");

const AMP_FEE = 0.1;

describe("Accounting integration tests", () => {
  beforeAll(() => {
    return setup.setup();
  });

  afterAll(() => {
    return setup.teardown();
  });

  // NOTE: Since db setup happens only once for all tests, the order of tests matters

  it("adjusts all balances correctly for a split with lightning address user", async () => {
    const ampAmount = 10000;
    await amp.processSplits({
      contentId: seeds.testerOneTrackId,
      contentType: "track",
      msatAmount: ampAmount,
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

    const forwardRecord = await db
      .knex("forward")
      .where({ user_id: seeds.testerThreeId })
      .first();

    expect(parseInt(testerOneBalance)).toBe(
      seeds.testerOneMsatBalance + ampAmount * 0.9 * (1 - AMP_FEE)
    );
    expect(parseInt(testerTwoBalance)).toBe(1000);
    expect(parseInt(testerThreeBalance)).toBe(10000); // unchanged
    expect(parseInt(trackBalance)).toBe(ampAmount);
    expect(forwardRecord.lightning_address).toBe(
      seeds.testerThreeLightningAddress
    );
    expect(parseInt(forwardRecord.msat_amount)).toBe(
      ampAmount * 0.1 * (1 - AMP_FEE)
    );
  });
});
