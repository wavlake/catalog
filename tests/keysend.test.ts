const keysend = require("../library/keysend");

// Helpful links:
// https://stackoverflow.com/questions/68717941/how-to-mock-knex-using-jest

describe("isValidKeysendRequest", () => {
  it("should return true for one valid keysend", async () => {
    const keysendRequest = {
      msatTotal: 10000,
      keysends: [
        {
          msatAmount: 10000,
          pubkey: "abc123",
        },
      ],
    };

    const result = await keysend.isValidExternalKeysendRequest(keysendRequest);

    expect(result).toEqual(true);
  });
  it("should return true for more than one valid keysend", async () => {
    const keysendRequest = {
      msatTotal: 10000,
      keysends: [
        {
          msatAmount: 1000,
          pubkey: "abc123",
        },
        {
          msatAmount: 9000,
          pubkey: "de456",
        },
      ],
    };

    const result = await keysend.isValidExternalKeysendRequest(keysendRequest);

    expect(result).toEqual(true);
  });
  it("should return false if sum of keysends exceeds total", async () => {
    const keysendRequest = {
      msatTotal: 10000,
      keysends: [
        {
          msatAmount: 6000,
          pubkey: "abc123",
        },
        {
          msatAmount: 5000,
          pubkey: "de456",
        },
      ],
    };

    const result = await keysend.isValidExternalKeysendRequest(keysendRequest);

    expect(result).toEqual(false);
  });
  it("should return false for invalid request", async () => {
    const keysendRequest = {
      keysends: [
        {
          pubkey: "abc123",
        },
      ],
    };

    const result = await keysend.isValidExternalKeysendRequest(keysendRequest);

    expect(result).toEqual(false);
  });
  it("should return false for an empty request", async () => {
    const keysendRequest = null;

    const result = await keysend.isValidExternalKeysendRequest(keysendRequest);

    expect(result).toEqual(false);
  });
});
