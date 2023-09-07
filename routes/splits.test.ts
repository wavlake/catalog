import request from "supertest";
import app from "../index";
import { MockContext, Context, createMockContext } from "../test/prismaContext";

let mockCtx: MockContext;
let ctx: Context;

beforeEach(() => {
  mockCtx = createMockContext();
  ctx = mockCtx as unknown as Context;
});

// mock the isAuthorized middleware
const mockSplitReceipients = [
  {
    name: "Satoshi",
    share: 60,
  },
  {
    name: "Nakamoto",
    share: 40,
  },
];

jest.mock("../middlewares/auth", () => {
  return {
    isAuthorized: jest.fn((req, res, next) => {
      req["uid"] = "FAKE-USER-ID";
      req.params.uid = "FAKE-USER-ID";
      next();
    }),
  };
});

jest.mock("../library/userHelper", () => {
  return {
    isContentOwner: jest.fn((userId, contentId, contentType) => {
      return true;
    }),
  };
});

const splitroute = "/v1/splits";
describe("Split route", () => {
  it("POST to /", async () => {
    const response = await request(app)
      .post(splitroute + "/")
      .send({
        contentId: "123",
        contentType: "podcast",
        splitRecipients: mockSplitReceipients,
      });
    expect(response.statusCode).toBe(200);
  });
});
