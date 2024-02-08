import db from "../../library/db";
const database = require("./database");
const seeds = require("./seeds");

// const types = ["track", "episode", "podcast", "album", "artist"];

describe("accounting integration tests", () => {
  beforeAll(() => {
    return database.setup();
  });

  afterAll(() => {
    return database.teardown();
  });

  it("should return true", async () => {
    const amount = await db
      .knex("user")
      .where({ id: seeds.testerOneId })
      .select("msat_balance")
      .first();

    expect(amount.msat_balance).toBe("10000");
  });
});
