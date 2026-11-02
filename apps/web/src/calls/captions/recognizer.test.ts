import { afterEach, describe, expect, it, vi } from "vitest";
import { createCaptionRecognizer, isSpeechRecognitionSupported } from "./recognizer.js";

interface MockResultEvent {
  resultIndex: number;
  results: { isFinal: boolean; 0: { transcript: string }; length: number }[];
}

/** A scriptable `SpeechRecognition` the tests install as `window.SpeechRecognition`. */
class MockRecognition {
  static instances: MockRecognition[] = [];

  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: MockResultEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  starts = 0;
  stops = 0;

  constructor() {
    MockRecognition.instances.push(this);
  }

  start(): void {
    this.starts += 1;
  }

  stop(): void {
    this.stops += 1;
  }

  emit(text: string, isFinal: boolean): void {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text }, length: 1 }] });
  }

  end(): void {
    this.onend?.();
  }

  fail(error: string): void {
    this.onerror?.({ error });
  }
}

function installMock(): void {
  MockRecognition.instances = [];
  vi.stubGlobal("window", { SpeechRecognition: MockRecognition });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("caption recognizer", () => {
  it("is unsupported with no Web Speech API, and start/stop are no-ops", () => {
    expect(isSpeechRecognitionSupported()).toBe(false);
    const recognizer = createCaptionRecognizer(() => undefined);
    expect(recognizer.supported).toBe(false);
    expect(() => {
      recognizer.start();
      recognizer.stop();
    }).not.toThrow();
  });

  it("streams interim and final segments continuously in Chrome", () => {
    installMock();
    expect(isSpeechRecognitionSupported()).toBe(true);
    const segments: { text: string; final: boolean }[] = [];
    const recognizer = createCaptionRecognizer((text, final) => segments.push({ text, final }), {
      lang: "en-US",
    });
    expect(recognizer.supported).toBe(true);
    recognizer.start();

    expect(MockRecognition.instances).toHaveLength(1);
    const mic = MockRecognition.instances[0];
    expect(mic.continuous).toBe(true);
    expect(mic.interimResults).toBe(true);
    expect(mic.lang).toBe("en-US");

    mic.emit("moving go-", false);
    mic.emit("moving go-live", true);
    expect(segments).toEqual([
      { text: "moving go-", final: false },
      { text: "moving go-live", final: true },
    ]);
  });

  it("restarts when the engine ends mid-call, but not after stop or denial", () => {
    installMock();
    const errors: string[] = [];
    const recognizer = createCaptionRecognizer(() => undefined, {
      onError: (code) => errors.push(code),
    });
    recognizer.start();
    const mic = MockRecognition.instances[0];

    mic.end(); // Chrome pauses the engine on silence; the call continues.
    expect(mic.starts).toBe(2);

    mic.fail("not-allowed");
    expect(errors).toEqual(["not-allowed"]);
    mic.end(); // denied: never restart into a loop.
    expect(mic.starts).toBe(2);

    recognizer.stop();
    expect(mic.stops).toBe(1);
    mic.end();
    expect(mic.starts).toBe(2);
  });
});
