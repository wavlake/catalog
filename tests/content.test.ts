const db = require("../library/db");
const { getType } = require("../library/content");
const log = require("loglevel");
const { validate } = require("uuid");

// Helpful links:
// https://stackoverflow.com/questions/68717941/how-to-mock-knex-using-jest

jest.mock("../library/db", () => {
  return { knex: jest.fn(() => {}) };
});
jest.mock("loglevel");
jest.mock("uuid");

const types = ["track", "episode", "podcast", "album", "artist"];

describe("getType", () => {
  const validUuid = "valid-uuid";
  const invalidUuid = "invalid-uuid";

  beforeEach(() => {
    validate.mockClear();
    db.knex.mockClear();
    log.debug.mockClear();
  });

  // Test for each type
  types.forEach((type) => {
    it(`should return "${type}" when contentId is valid and exists for type "${type}"`, async () => {
      validate.mockReturnValue(true);
      db.knex.mockImplementation((queryType) => ({
        select: () => ({
          where: () =>
            Promise.resolve(queryType === type ? [{ id: validUuid }] : []),
        }),
      }));

      const result = await getType(validUuid);
      if (type === types[0]) {
        expect(result).toBe(type); // Expect to find the type on the first one
      }
    });
  });

  it("should return null when contentId is valid but does not exist", async () => {
    validate.mockReturnValue(true);
    db.knex.mockImplementation(() => ({
      select: () => ({
        where: () => Promise.resolve([]),
      }),
    }));

    const result = await getType(validUuid);
    expect(result).toBeNull();
  });

  it("should log an error and return undefined for invalid UUID", async () => {
    validate.mockReturnValue(false);

    const result = await getType(invalidUuid);
    expect(log.debug).toHaveBeenCalledWith("Invalid id: ", invalidUuid);
    expect(result).toBeUndefined();
  });

  it("should handle database errors gracefully", async () => {
    validate.mockReturnValue(true);
    db.knex.mockImplementation(() => {
      throw new Error("Database error");
    });

    await expect(getType(validUuid)).rejects.toThrow("Database error");
  });
});
