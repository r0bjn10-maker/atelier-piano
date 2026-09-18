import { NOTES, midiFromFilename, clamp } from './notes.js';

export const SAMPLE_MANIFEST_URL = new URL('../assets/audio/piano/samples.json', import.meta.url);
export const SAMPLE_CACHE = 'atelier-piano-samples-v2';

export function validateLibrary(config) {
  if (config?.version !== 1 || !Array.isArray(config.layers) || !config.layers.length) throw new Error('Invalid piano sample configuration.');
  const maxTranspose = config.maxTransposeSemitones ?? 2;
  if (!Number.isInteger(maxTranspose) || maxTranspose < 0 || maxTranspose > 3) throw new Error('Piano sample transposition must stay within three semitones.');
  const ids = new Set();
  const layers = config.layers.map(layer => {
    if (!layer.id || ids.has(layer.id) || !Number.isFinite(layer.minVelocity) || !Number.isFinite(layer.maxVelocity) || layer.minVelocity < 0 || layer.maxVelocity > 1 || layer.minVelocity >= layer.maxVelocity) throw new Error('Invalid piano velocity layer.');
    ids.add(layer.id);
    const gain = layer.gain ?? 1;
    if (!Number.isFinite(gain) || gain <= 0 || gain > 4) throw new Error('Invalid sample layer gain.');
    const entries = Object.entries(layer.samples || {}).map(([note, file]) => {
      const midi = midiFromFilename(`${note}.wav`);
      if (midi === null || typeof file !== 'string' || !/^[A-Za-z0-9_/-]+\.(wav|mp3|m4a|ogg|flac)$/.test(file) || file.includes('..') || file.startsWith('/')) throw new Error(`Invalid sample mapping: ${note}.`);
      return { midi, file, gain, layer: layer.id };
    }).sort((a, b) => a.midi - b.midi);
    if (!entries.length || new Set(entries.map(entry => entry.midi)).size !== entries.length) throw new Error('A velocity layer needs distinct source notes.');
    for (const note of NOTES) if (!entries.some(entry => Math.abs(entry.midi - note.midi) <= maxTranspose)) throw new Error(`Missing sample coverage for ${note.label} in ${layer.id}.`);
    return { ...layer, entries };
  }).sort((a, b) => a.minVelocity - b.minVelocity);
  if (layers[0].minVelocity !== 0 || layers.at(-1).maxVelocity !== 1 || layers.some((layer, i) => i > 0 && layer.minVelocity !== layers[i - 1].maxVelocity)) throw new Error('Velocity layers must cover 0–1 without gaps or overlaps.');
  return { ...config, maxTranspose, layers };
}

export function selectSample(library, midi, velocity = .75) {
  const value = clamp(velocity, 0, 1);
  const layer = library.layers.find(layer => value >= layer.minVelocity && value <= layer.maxVelocity);
  if (!layer) return null;
  let nearest = null;
  for (const entry of layer.entries) if (!nearest || Math.abs(entry.midi - midi) < Math.abs(nearest.midi - midi)) nearest = entry;
  return nearest && Math.abs(nearest.midi - midi) <= library.maxTranspose ? nearest : null;
}
