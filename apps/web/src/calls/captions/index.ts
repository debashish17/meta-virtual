/**
 * Live-call captions on the web side (P5-C): the browser recognizer, the `caption_send`
 * sender, the caption store and its room binding, "End meeting" plus the
 * paste-a-transcript route, and the transcript panel P5-B mounts beside the call bar.
 */
export { NO_SPEECH_NOTICE, assembleTranscript, type CaptionSegment } from "./assembly.js";
export { sendCaption, type CaptionSenderRoom } from "./sender.js";
export {
  createCaptionRecognizer,
  isSpeechRecognitionSupported,
  type CaptionListener,
  type CaptionRecognizer,
  type RecognizerOptions,
} from "./recognizer.js";
export {
  CAPTIONS_MAX,
  FINALS_MAX,
  bindCaptionRoom,
  clearCaptions,
  finalSegments,
  useCaptions,
  type CaptionListenerRoom,
  type ReceivedCaption,
} from "./store.js";
export {
  endMeeting,
  postPastedTranscript,
  postTranscriptAsMeeting,
  type EndMeetingDeps,
  type TranscriptPostResult,
} from "./endMeeting.js";
export { default as TranscriptPanel, type TranscriptPanelProps } from "./TranscriptPanel.js";
