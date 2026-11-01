// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AskPanel from "./AskPanel.js";

afterEach(cleanup);

async function ask(question: string) {
  render(<AskPanel />);
  fireEvent.change(screen.getByLabelText("Your question"), { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  return screen.findByRole("status");
}

describe("AskPanel", () => {
  it("shows a cited answer to the status question", async () => {
    const status = await ask("What's the status of the Acme integration?");
    expect(status.textContent).toContain("go-live");
    expect(status.querySelectorAll(".pan-sources li").length).toBeGreaterThan(0);
  });

  it("shows the no-record state when the office abstains", async () => {
    const status = await ask("Who is Acme's CEO?");
    expect(status.textContent).toContain("I don't have a record of that.");
    expect(status.textContent).toContain("No record found");
    expect(status.querySelector(".pan-sources")).toBeNull();
  });

  it("never submits a blank question", () => {
    render(<AskPanel />);
    expect((screen.getByRole("button", { name: "Ask" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
