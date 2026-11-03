// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { leaveOnPageHide, rejoinOnPageShow, stopNet } from "./connection.js";
import { useNet } from "./store.js";

afterEach(() => {
  stopNet();
});

describe("page lifecycle", () => {
  it("leaves the room when the page is hidden for good (refresh, closed tab)", () => {
    useNet.setState({ status: "online" });
    leaveOnPageHide();
    expect(useNet.getState().status).toBe("offline");
  });

  it("does nothing when there is no connection", () => {
    useNet.setState({ status: "offline" });
    leaveOnPageHide();
    rejoinOnPageShow({ persisted: true });
    expect(useNet.getState().status).toBe("offline");
  });

  it("joins again only when the page comes back from the back-forward cache", () => {
    useNet.setState({ status: "online" });
    leaveOnPageHide();
    rejoinOnPageShow({ persisted: false });
    expect(useNet.getState().status).toBe("offline");
    rejoinOnPageShow({ persisted: true });
    expect(useNet.getState().status).toBe("connecting");
  });

  it("registers the listeners on the window", () => {
    useNet.setState({ status: "online" });
    window.dispatchEvent(new Event("pagehide"));
    expect(useNet.getState().status).toBe("offline");
  });
});
