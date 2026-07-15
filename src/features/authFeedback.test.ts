import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../api/musicApi";
import { authFailureMessage } from "./authFeedback";

describe("authentication feedback", () => {
  it("explains that a successfully-created login is already occupied", () => {
    expect(authFailureMessage(new ApiRequestError(409, "Login already exists"), "register"))
      .toContain("уже занят");
  });

  it("turns backend validation details into actionable field guidance", () => {
    const error = new ApiRequestError(422, [
      { loc: ["body", "login"], msg: "String should have at least 3 characters" },
      { loc: ["body", "password"], msg: "String should have at least 6 characters" },
    ]);
    const message = authFailureMessage(error, "register");
    expect(message).toContain("Логин:");
    expect(message).toContain("Пароль:");
  });

  it("distinguishes invalid credentials from registration failures", () => {
    expect(authFailureMessage(new ApiRequestError(401), "login"))
      .toContain("Неверный логин или пароль");
  });
});
