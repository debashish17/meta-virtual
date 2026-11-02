// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ProposedChange } from "@office/shared";
import TranscriptPanel from "./TranscriptPanel.js";
import { NO_SPEECH_NOTICE } from "./assembly.js";
import { useCaptions } from "./store.js";

afterEach(cleanup);

beforeEach(() => {
  useCaptions.getState().clearCaptions();
});

const CHANGE: ProposedChange = {
  id: "ac0e0020-0020-4020-8020-000000000020",
  type: "task_create",
  status: "pending",
  targetId: null,
  before: null,
  after: { title: "Notify Acme of new date" },
  needsReview: false,
  sourceMeetingId: "ac0e0030-0030-4030-8030-000000000030",
};

function deps(processMeeting = vi.fn(async () => ({ meetingId: CHANGE.sourceMeetingId, proposedChanges: [CHANGE] }))) {
  return { api: { processMeeting }, refetch: vi.fn(async () => undefined) };
}

describe("TranscriptPanel", () => {
  it("shows the live captions with their speakers", () => {
    useCaptions.getState().pushCaption({ name: "Maya", text: "moving go-", final: false, ts: 1 });
    useCaptions.getState().pushCaption({ name: "Arjun", text: "i will take it", final: true, ts: 2 });
    render(<TranscriptPanel zoneId="acme_room" zoneName="Acme room" deps={deps()} />);

    expect(screen.getByLabelText("Live captions").textContent).toContain("Maya: moving go-");
    expect(screen.getByLabelText("Live captions").textContent).toContain("Arjun: i will take it");
  });

  it("ends the meeting from the final segments and clears them", async () => {
    useCaptions.getState().pushCaption({ name: "Maya", text: "go-live moves", final: true, ts: 1 });
    const d = deps();
    const onMeeting = vi.fn();
    render(<TranscriptPanel zoneId="acme_room" deps={d} onMeeting={onMeeting} />);

    fireEvent.click(screen.getByRole("button", { name: "End meeting" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("1 proposed change"),
    );
    expect(d.api.processMeeting).toHaveBeenCalledWith({
      zoneId: "acme_room",
      transcript: "Maya: go-live moves",
    });
    expect(onMeeting).toHaveBeenCalledWith(CHANGE.sourceMeetingId);
    expect(useCaptions.getState().captions).toEqual([]);
  });

  it("reports no speech when the buffer is empty instead of posting", async () => {
    const d = deps();
    render(<TranscriptPanel zoneId="acme_room" deps={d} />);

    fireEvent.click(screen.getByRole("button", { name: "End meeting" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(NO_SPEECH_NOTICE));
    expect(d.api.processMeeting).not.toHaveBeenCalled();
  });

  it("creates a meeting from pasted text, the no-microphone route", async () => {
    const d = deps();
    render(<TranscriptPanel zoneId="acme_room" deps={d} />);

    fireEvent.change(screen.getByLabelText("Paste a transcript"), {
      target: { value: "Maya: go-live moves to 22 Nov" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create meeting from transcript" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("1 proposed change"),
    );
    expect(d.api.processMeeting).toHaveBeenCalledWith({
      zoneId: "acme_room",
      transcript: "Maya: go-live moves to 22 Nov",
    });
  });

  it("shows the server's error instead of failing silently", async () => {
    const d = deps(vi.fn(async () => {
      throw new Error("could not reach the server");
    }));
    useCaptions.getState().pushCaption({ name: "Maya", text: "hi", final: true, ts: 1 });
    render(<TranscriptPanel zoneId="acme_room" deps={d} />);

    fireEvent.click(screen.getByRole("button", { name: "End meeting" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("could not reach the server"),
    );
  });
});
