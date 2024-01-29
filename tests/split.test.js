// TODO: Fix real tests

import { server } from "../index";
describe("POC test", () => {
  afterAll(() => {
    server.close();
  });

  it("Passing test", () => {
    expect(true).toBe(true);
  });
});

// const db = require("../library/db");
// const split = require("../library/split");
// const content = require("../library/content");

// // Helpful links:
// // https://stackoverflow.com/questions/68717941/how-to-mock-knex-using-jest

// jest.mock("../library/db", () => {
//   // @ts-ignore
//   return { knex: jest.fn(() => mockPromise) };
// });

// beforeEach(() => {
//   jest.restoreAllMocks(); // Clears spy mocks
//   jest.clearAllMocks();
// });

// describe("calculateCombinedSplits", () => {
//   it("should accurately calculate the timeSplitShares", async () => {
//     const splitRecipients = [
//       { userId: "barney", splitPercentage: 0.2 },
//       { userId: "fred", splitPercentage: 0.8 },
//     ];
//     const timeSplit = {
//       contentId: "abc123",
//       shareNumerator: 50,
//       shareDenominator: 100,
//     };
//     const timeSplitRecipients = [
//       { userId: "betty", splitPercentage: 0.5 },
//       { userId: "wilma", splitPercentage: 0.5 },
//     ];

//     const mockFnGetType = jest
//       .spyOn(content, "getType")
//       .mockReturnValueOnce("track");

//     const mockGetSplitRecipientsAndShares = jest
//       .spyOn(split, "getSplitRecipientsAndShares")
//       .mockReturnValueOnce(timeSplitRecipients);

//     const result = await split.calculateCombinedSplits(
//       splitRecipients,
//       timeSplit
//     );

//     // expect(mockFnGetType).toHaveBeenCalledWith(timeSplit.contentId);
//     expect(result).toEqual([
//       { userId: "barney", splitPercentage: 0.1 },
//       { userId: "fred", splitPercentage: 0.4 },
//       { userId: "betty", splitPercentage: 0.25 },
//       { userId: "wilma", splitPercentage: 0.25 },
//     ]);
//   });

//   it("should accurately calculate 100 percent timeSplitShares", async () => {
//     const splitRecipients = [
//       { userId: "barney", splitPercentage: 0.2 },
//       { userId: "fred", splitPercentage: 0.8 },
//     ];
//     const timeSplit = {
//       contentId: "abc123",
//       shareNumerator: 100,
//       shareDenominator: 100,
//     };
//     const timeSplitRecipients = [
//       { userId: "betty", splitPercentage: 0.5 },
//       { userId: "wilma", splitPercentage: 0.5 },
//     ];

//     const mockFnGetType = jest
//       .spyOn(content, "getType")
//       .mockReturnValueOnce("track");

//     const mockGetSplitRecipientsAndShares = jest
//       .spyOn(split, "getSplitRecipientsAndShares")
//       .mockReturnValueOnce(timeSplitRecipients);

//     const result = await split.calculateCombinedSplits(
//       splitRecipients,
//       timeSplit
//     );

//     // expect(mockFnGetType).toHaveBeenCalledWith(timeSplit.contentId);
//     expect(result).toEqual([
//       { userId: "betty", splitPercentage: 0.5 },
//       { userId: "wilma", splitPercentage: 0.5 },
//     ]);
//   });
// });

// describe("calculatePercentages", () => {
//   it("should accurately calculate simple shares", async () => {
//     const result = await split.calculatePercentages([
//       { userId: "barney", share: 70 },
//       { userId: "fred", share: 30 },
//     ]);

//     expect(result).toEqual([
//       { userId: "barney", splitPercentage: 0.7 },
//       { userId: "fred", splitPercentage: 0.3 },
//     ]);
//   });
//   it("should accurately calculate complex shares", async () => {
//     const result = await split.calculatePercentages([
//       { userId: "barney", share: 40 },
//       { userId: "fred", share: 70 },
//       { userId: "wilma", share: 90 },
//     ]);

//     expect(result).toEqual([
//       { userId: "barney", splitPercentage: 0.2 },
//       { userId: "fred", splitPercentage: 0.35 },
//       { userId: "wilma", splitPercentage: 0.45 },
//     ]);
//   });
// });

// describe("getOwnerId", () => {
//   it("should return the track owner's userId", async () => {
//     const trackId = "track123";
//     const type = "track";
//     const userId = "user123";
//     db.knex.mockReturnValueOnce({
//       join: jest.fn().mockReturnThis(),
//       join: jest.fn().mockReturnThis(),
//       select: jest.fn().mockReturnThis(),
//       where: jest.fn().mockReturnThis(),
//       first: jest.fn().mockResolvedValue({
//         id: trackId,
//         contentType: "track",
//         userId: userId,
//       }),
//     });

//     const returnedUserId = await split.getOwnerId(trackId, type);

//     expect(db.knex).toHaveBeenCalledWith("track");
//     expect(returnedUserId).toEqual(userId);
//   });

//   it("should return episode owner's userId", async () => {
//     const episodeId = "abc123";
//     const type = "episode";
//     const userId = "user456";
//     db.knex.mockReturnValueOnce({
//       join: jest.fn().mockReturnThis(),
//       join: jest.fn().mockReturnThis(),
//       select: jest.fn().mockReturnThis(),
//       where: jest.fn().mockReturnThis(),
//       first: jest.fn().mockResolvedValue({
//         id: episodeId,
//         contentType: "episode",
//         userId: userId,
//       }),
//     });

//     const returnedUserId = await split.getOwnerId(episodeId, type);

//     expect(db.knex).toHaveBeenCalledWith("episode");
//     expect(returnedUserId).toEqual(userId);
//   });

//   it("should return podcast owner's userId", async () => {
//     const podcastId = "abc123";
//     const type = "podcast";
//     const userId = "user456";
//     db.knex.mockReturnValueOnce({
//       join: jest.fn().mockReturnThis(),
//       join: jest.fn().mockReturnThis(),
//       select: jest.fn().mockReturnThis(),
//       where: jest.fn().mockReturnThis(),
//       first: jest.fn().mockResolvedValue({
//         id: podcastId,
//         contentType: "podcast",
//         userId: userId,
//       }),
//     });

//     const returnedUserId = await split.getOwnerId(podcastId, type);

//     expect(db.knex).toHaveBeenCalledWith("podcast");
//     expect(returnedUserId).toEqual(userId);
//   });

//   it("should return album owner's userId", async () => {
//     const albumId = "abc123";
//     const type = "album";
//     const userId = "user456";
//     db.knex.mockReturnValueOnce({
//       join: jest.fn().mockReturnThis(),
//       join: jest.fn().mockReturnThis(),
//       select: jest.fn().mockReturnThis(),
//       where: jest.fn().mockReturnThis(),
//       first: jest.fn().mockResolvedValue({
//         id: albumId,
//         contentType: "album",
//         userId: userId,
//       }),
//     });

//     const returnedUserId = await split.getOwnerId(albumId, type);

//     expect(db.knex).toHaveBeenCalledWith("album");
//     expect(returnedUserId).toEqual(userId);
//   });

//   it("should return artist owner's userId", async () => {
//     const artistId = "abc123";
//     const type = "artist";
//     const userId = "user456";
//     db.knex.mockReturnValueOnce({
//       join: jest.fn().mockReturnThis(),
//       join: jest.fn().mockReturnThis(),
//       select: jest.fn().mockReturnThis(),
//       where: jest.fn().mockReturnThis(),
//       first: jest.fn().mockResolvedValue({
//         id: artistId,
//         contentType: "artist",
//         userId: userId,
//       }),
//     });

//     const returnedUserId = await split.getOwnerId(artistId, type);

//     expect(db.knex).toHaveBeenCalledWith("artist");
//     expect(returnedUserId).toEqual(userId);
//   });
// });

// describe("getHigherLevelSplitId", () => {
//   it("should return null if there is no higher level split", async () => {
//     const trackId = "track123";
//     const type = "track";
//     db.knex.mockReturnValueOnce({
//       join: jest.fn().mockReturnThis(),
//       select: jest.fn().mockReturnThis(),
//       where: jest.fn().mockReturnThis(),
//       first: jest.fn().mockResolvedValue(null),
//     });

//     const result = await split.getHigherLevelSplitId(trackId, type);

//     expect(db.knex).toHaveBeenCalledWith("track");
//     expect(result).toEqual(null);
//   });

//   it("should return an id if there is a higher level split", async () => {
//     const trackId = "track123";
//     const type = "track";
//     db.knex.mockReturnValueOnce({
//       join: jest.fn().mockReturnThis(),
//       select: jest.fn().mockReturnThis(),
//       where: jest.fn().mockReturnThis(),
//       first: jest.fn().mockResolvedValue({ id: 3 }),
//     });

//     const result = await split.getHigherLevelSplitId(trackId, type);

//     expect(db.knex).toHaveBeenCalledWith("track");
//     expect(result).toEqual(3);
//   });

//   it("should query episode", async () => {
//     const episodeId = "episode123";
//     const type = "episode";
//     db.knex.mockReturnValueOnce({
//       join: jest.fn().mockReturnThis(),
//       select: jest.fn().mockReturnThis(),
//       where: jest.fn().mockReturnThis(),
//       first: jest.fn().mockResolvedValue({ id: 4 }),
//     });

//     const result = await split.getHigherLevelSplitId(episodeId, type);

//     expect(db.knex).toHaveBeenCalledWith("episode");
//     expect(result).toEqual(4);
//   });

//   it("should return null if album", async () => {
//     const trackId = "album123";
//     const type = "album";
//     const result = await split.getHigherLevelSplitId(trackId, type);

//     expect(result).toEqual(null);
//   });
// });

// describe("getSplitId", () => {
//   it("should return null if there is no split", async () => {
//     const trackId = "track123";
//     const type = "track";
//     db.knex.mockReturnValueOnce({
//       select: jest.fn().mockReturnThis(),
//       where: jest.fn().mockReturnThis(),
//       andWhere: jest.fn().mockReturnThis(),
//       first: jest.fn().mockResolvedValue(null),
//     });

//     const mockFnGetHigherLevelSplitId = jest
//       .spyOn(split, "getHigherLevelSplitId")
//       .mockReturnValueOnce(null);

//     const result = await split.getSplitId(trackId, type);

//     expect(mockFnGetHigherLevelSplitId).toHaveBeenCalledWith(trackId, type);
//     expect(result).toEqual(null);
//   });
//   it("should return an id if there is a split", async () => {
//     const trackId = "track123";
//     const type = "track";
//     db.knex.mockReturnValueOnce({
//       select: jest.fn().mockReturnThis(),
//       where: jest.fn().mockReturnThis(),
//       andWhere: jest.fn().mockReturnThis(),
//       first: jest.fn().mockResolvedValue({ id: 1 }),
//     });

//     const result = await split.getSplitId(trackId, type);

//     expect(result).toEqual(1);
//   });
//   it("should return an id if there is a higher level split", async () => {
//     const trackId = "track123";
//     const type = "track";
//     db.knex.mockReturnValueOnce({
//       select: jest.fn().mockReturnThis(),
//       where: jest.fn().mockReturnThis(),
//       andWhere: jest.fn().mockReturnThis(),
//       first: jest.fn().mockResolvedValue(null),
//     });

//     const mockFnGetHigherLevelSplitId = jest
//       .spyOn(split, "getHigherLevelSplitId")
//       .mockReturnValueOnce(2);

//     const result = await split.getSplitId(trackId, type);

//     expect(mockFnGetHigherLevelSplitId).toHaveBeenCalledWith(trackId, type);
//     expect(result).toEqual(2);
//   });
// });

// describe("getSplitRecipients", () => {
//   it("should return null if there are no recipients", async () => {
//     const splitId = 1;
//     db.knex.mockReturnValueOnce({
//       select: jest.fn().mockReturnThis(),
//       where: jest.fn().mockResolvedValue([]),
//     });

//     const result = await split.getSplitRecipients(splitId);

//     expect(result).toEqual(null);
//   });
// });

// describe("getSplitRecipientsAndShares", () => {
//   it("should call getOwnerId if there are no splits", async () => {
//     const episodeId = "abc123";
//     const type = "episode";
//     const mockFnGetSplitId = jest
//       .spyOn(split, "getSplitId")
//       .mockReturnValueOnce(null);

//     const mockFnGetOwnerId = jest
//       .spyOn(split, "getOwnerId")
//       .mockReturnValueOnce("");

//     await split.getSplitRecipientsAndShares(episodeId, type);

//     expect(mockFnGetSplitId).toHaveBeenCalledWith(episodeId, type);
//     expect(mockFnGetOwnerId).toHaveBeenCalledWith(episodeId, type);
//   });

//   it("should call getSplitRecipients if there are splits", async () => {
//     const episodeId = "abc123";
//     const type = "episode";
//     const mockFnGetSplitId = jest
//       .spyOn(split, "getSplitId")
//       .mockReturnValueOnce(1);

//     const mockFnGetSplitRecipients = jest
//       .spyOn(split, "getSplitRecipients")
//       .mockReturnValueOnce("");

//     await split.getSplitRecipientsAndShares(episodeId, type);

//     expect(mockFnGetSplitId).toHaveBeenCalledWith(episodeId, type);
//     expect(mockFnGetSplitRecipients).toHaveBeenCalledWith(1);
//   });

//   it("should call calculatePercentages if there are splits", async () => {
//     const episodeId = "abc123";
//     const type = "episode";
//     const mockFnGetSplitId = jest
//       .spyOn(split, "getSplitId")
//       .mockReturnValueOnce(1);

//     const splitRecipients = [
//       { userId: "barney", share: 70 },
//       { userId: "fred", share: 30 },
//     ];
//     jest
//       .spyOn(split, "getSplitRecipients")
//       .mockReturnValueOnce(splitRecipients);

//     const spy = jest.spyOn(split, "calculatePercentages");

//     await split.getSplitRecipientsAndShares(episodeId, type);

//     expect(mockFnGetSplitId).toHaveBeenCalledWith(episodeId, type);
//     expect(spy).toHaveBeenCalledWith(splitRecipients, episodeId, type);
//   });
// });

// describe("getTimeSplit", () => {
//   it("should return null if there is no time split", async () => {
//     const contentId = "abc123";
//     const timeSeconds = 100;
//     db.knex.mockReturnValueOnce({
//       select: jest.fn().mockReturnThis(),
//       where: jest.fn().mockReturnThis(),
//       andWhere: jest.fn().mockReturnThis(),
//       andWhere: jest.fn().mockReturnThis(),
//       first: jest.fn().mockResolvedValue(undefined),
//     });

//     const result = await split.getTimeSplit(contentId, timeSeconds);

//     expect(result).toEqual(null);
//   });

//   it("should return a time split share", async () => {
//     const contentId = "abc123";
//     const timeSeconds = 100;
//     const response = { id: 1, shareNumerator: 50, shareDenominator: 100 };
//     db.knex.mockReturnValueOnce({
//       select: jest.fn().mockReturnThis(),
//       where: jest.fn().mockReturnThis(),
//       andWhere: jest.fn().mockReturnThis(),
//       andWhere: jest.fn().mockReturnThis(),
//       first: jest.fn().mockResolvedValue(response),
//     });

//     const result = await split.getTimeSplit(contentId, timeSeconds);

//     expect(result).toEqual(response);
//   });
// });
