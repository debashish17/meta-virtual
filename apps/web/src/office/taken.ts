/** Seats (`seat:x,z`) and counter spots held in offline (single-player) mode, by you and the
 * colleagues alike. Online each server room keeps its own set instead; this one stays for the
 * office with no server. */
export const TAKEN = new Set<string>()
