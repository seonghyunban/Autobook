import { describe, expect, test } from "vitest";
import { resolveHostedUiRedirectUrl } from "./auth";

describe("hosted auth redirect compatibility", () => {
  test("accepts the legacy login_url response shape for login", () => {
    const url = resolveHostedUiRedirectUrl("login", {
      login_url: "https://autobook-dev.auth.ca-central-1.amazoncognito.com/login?client_id=abc",
    });

    expect(url).toBe("https://autobook-dev.auth.ca-central-1.amazoncognito.com/login?client_id=abc");
  });
});
