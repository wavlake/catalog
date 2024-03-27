import db from "../../library/db";
const setup = require("./accountingSetup");
const seeds = require("./accountingSeeds");
const amp = require("../../library/amp");

describe("Accounting integration tests", () => {
  beforeAll(() => {
    return setup.setup();
  });

  afterAll(() => {
    return setup.teardown();
  });

  // NOTE: Since db setup happens only once for all tests, the order of tests matters

  it("adjusts all balances correctly for a basic amp", async () => {
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

  it("adjusts all balances correctly for an artist amp", async () => {
    await amp.processSplits({
      contentId: seeds.testerOneArtistId,
      contentType: "artist",
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

    const artistBalance = await db
      .knex("artist")
      .where({ id: seeds.testerOneArtistId })
      .select("msat_total")
      .first()
      .then((artist) => artist.msat_total);

    expect(testerOneBalance).toBe("11800");
    expect(testerTwoBalance).toBe("8000");
    expect(artistBalance).toBe("1000");
  });
});
