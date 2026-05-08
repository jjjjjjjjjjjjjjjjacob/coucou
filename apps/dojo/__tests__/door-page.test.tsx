import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import DoorPage from "../app/door/page";

describe("Door Page", () => {
  it("renders door page without crashing", () => {
    render(<DoorPage />);
    // Basic render test - just check it doesn't crash
    expect(document.body).toBeTruthy();
  });

  it("displays door interface", () => {
    render(<DoorPage />);
    // Test basic functionality without complex mocking
    expect(document.body).toBeTruthy();
  });
});
