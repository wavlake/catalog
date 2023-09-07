import { server } from "../index";
describe("POC test", () => {
  afterAll(() => {
    server.close();
  });

  it("Passing test", () => {
    expect(true).toBe(true);
  });

  it("Failing test", () => {
    expect(false).toBe(true);
  });
});
