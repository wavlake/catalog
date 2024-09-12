import db from "../../library/db";
const setup = require("./referrerSetup");
const seeds = require("./referrerSeeds");
const amp = require("../../library/amp");

describe("Referrer integration tests", () => {
  beforeAll(() => {
    return setup.setup();
  });

  afterAll(() => {
    return setup.teardown();
  });

  // NOTE: Since db setup happens only once for all tests, the order of tests matters

  it("increments the verified dev user's balance correctly", async () => {
    await amp.processSplits({
      contentId: seeds.testerOneTrackId,
      contentType: "track",
      msatAmount: 1000,
      paymentType: 1,
      userId: "randomnpub",
      referrerAppId: seeds.testerTwoAppId,
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
    expect(testerTwoBalance).toBe("10030");
    expect(trackBalance).toBe("1000");
  });

  it("adds a forward record for the lightning address dev user", async () => {
    await amp.processSplits({
      contentId: seeds.testerOneTrackId,
      contentType: "track",
      msatAmount: 1000,
      paymentType: 1,
      userId: "randomnpub",
      referrerAppId: seeds.testerThreeAppId,
    });

    const testerOneBalance = await db
      .knex("user")
      .where({ id: seeds.testerOneId })
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
      .where({ referrer_app_id: seeds.testerThreeAppId })
      .select("msat_amount", "lightning_address", "user_id")
      .first()
      .then((forward) => forward);

    expect(testerOneBalance).toBe("11800");
    expect(testerThreeBalance).toBe("0");
    expect(trackBalance).toBe("2000");
    expect(forwardRecord.msat_amount).toBe(30);
    expect(forwardRecord.lightning_address).toBe(seeds.THREE_LN_ADDRESS);
    expect(forwardRecord.user_id).toBe(seeds.testerThreeId);
  });
});
