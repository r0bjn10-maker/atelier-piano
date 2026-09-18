export const FIRST_MIDI = 21;
export const LAST_MIDI = 108;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTES = Array.from({ length: 88 }, (_, i) => {
  const midi = FIRST_MIDI + i;
  const name = NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return Object.freeze({ midi, name, octave, label: `${name}${octave}`, black: name.includes('#'), frequency: 440 * 2 ** ((midi - 69) / 12) });
});
export const WHITE_NOTES = NOTES.filter(note => !note.black);
export const BLACK_NOTES = NOTES.filter(note => note.black);
if (NOTES.length !== 88 || WHITE_NOTES.length !== 52 || BLACK_NOTES.length !== 36 || NOTES[0].midi !== 21 || NOTES.at(-1).midi !== 108) {
  throw new Error('Invalid piano layout: expected 88 notes (52 white, 36 black), A0–C8.');
}
export const noteForMidi = midi => NOTES[midi - FIRST_MIDI];
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function midiFromFilename(filename) {
  const match = filename.match(/^([A-G])(s|#|b)?(-?\d)\.(mp3|wav|ogg|m4a)$/i);
  if (!match) return null;
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()];
  const midi = (Number(match[3]) + 1) * 12 + semitone + (match[2] === 'b' ? -1 : match[2] ? 1 : 0);
  return midi >= FIRST_MIDI && midi <= LAST_MIDI ? midi : null;
}
