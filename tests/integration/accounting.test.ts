// NOTHING

import { server } from "../../index";
describe("ACcouting test", () => {
  afterAll(() => {
    server.close();
  });

  it("Passing test", () => {
    expect(true).toBe(true);
  });
});
