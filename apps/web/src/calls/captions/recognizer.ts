/**
 * The browser speech recognizer (P5-C task 1): each participant captions their own speech
 * with the Web Speech API (Chrome) and the caller forwards the segments with `sender.ts`.
 * Continuous with interim results; the engine's pauses restart it mid-call, while a
 * denial or an explicit stop never restarts. Speech text is never logged.
 */

export type CaptionListener = (text: string, final: boolean) => void;

export interface CaptionRecognizer {
  readonly supported: boolean;
  start(): void;
  stop(): void;
}

export interface RecognizerOptions {
  lang?: string;
  onError?: (code: string) => void;
}

/** The slice of the Web Speech API this module uses (it has no TS DOM types). */
interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly 0: { transcript: string };
}

interface SpeechEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechResult>;
}

interface WebSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = new () => WebSpeechRecognition;

function constructorOf(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return constructorOf() !== null;
}

export function createCaptionRecognizer(
  onSegment: CaptionListener,
  options: RecognizerOptions = {},
): CaptionRecognizer {
  const Ctor = constructorOf();
  if (!Ctor) {
    return { supported: false, start: () => undefined, stop: () => undefined };
  }
  const lang = options.lang ?? "en-US";
  let mic: WebSpeechRecognition | null = null;
  let stopped = false;

  function attach(recognizer: WebSpeechRecognition): void {
    recognizer.lang = lang;
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.onresult = (event: SpeechEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.length > 0) onSegment(result[0].transcript, result.isFinal);
      }
    };
    recognizer.onerror = (event: { error: string }) => {
      options.onError?.(event.error);
      // A denied microphone must not restart into a loop; the caller (P5-B) shows the
      // listen-only notice while captions stay off.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stopped = true;
      }
    };
    recognizer.onend = () => {
      if (stopped) return;
      try {
        recognizer.start();
      } catch {
        // The engine is momentarily busy; the next start() recovers it.
      }
    };
  }

  return {
    supported: true,
    start: () => {
      stopped = false;
      if (!mic) {
        mic = new Ctor();
        attach(mic);
      }
      try {
        mic.start();
      } catch {
        // Already started; the engine keeps running.
      }
    },
    stop: () => {
      stopped = true;
      try {
        mic?.stop();
      } catch {
        // Already stopped; nothing to do.
      }
    },
  };
}
