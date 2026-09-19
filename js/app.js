import { SheetViewer } from './sheet-viewer.js';
import { PracticeLayout } from './practice-layout.js';
import { AudioEngine } from './audio-engine.js';
import { Piano } from './piano.js';
import { NoteController, TouchController } from './touch-controller.js';
import { Recorder } from './recorder.js';
import { clamp } from './notes.js';

const $ = id => document.getElementById(id);
const audio = new AudioEngine();
let ready = false, latchedSustain = false, spaceSustain = false, playbackSustain = false;
let toastTimer, metroTimer, beatTimer, metroBeat = 0, nextBeat = 0;
let offlineShellReady = false;
let settings = { labels: false, volume: 72, reverb: 14, tempo: 80 };
try {
  const saved = JSON.parse(localStorage.getItem('atelier-settings-v1'));
  if (saved) settings = {
    labels: saved.labels === true,
    volume: Number.isFinite(saved.volume) ? clamp(saved.volume, 0, 100) : 72,
    reverb: Number.isFinite(saved.reverb) ? clamp(saved.reverb, 0, 60) : 14,
    tempo: Number.isFinite(saved.tempo) ? clamp(saved.tempo, 30, 240) : 80,
  };
} catch {}
const saveSettings = () => { try { localStorage.setItem('atelier-settings-v1', JSON.stringify(settings)); } catch {} };
function toast(message) {
  $('toast').textContent = message; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4200);
}

const piano = new Piano($('keyboard'));
const notes = new NoteController({
  onPress(midi, velocity) { audio.noteOn(midi, velocity); piano.setPressed(midi, true); recorder.capture({ type: 'on', midi, velocity }); },
  onRelease(midi) { audio.noteOff(midi); piano.setPressed(midi, false); recorder.capture({ type: 'off', midi }); },
});
const touch = new TouchController($('keyboard'), notes, { enabled: () => ready && !$('settings').open, hitTest: (x, y) => piano.hit(x, y) });
let storage;
try { storage = window.localStorage; } catch { storage = { getItem() {}, setItem() {}, removeItem() {} }; }
const recorder = new Recorder({ storage, emit(event) {
  if (event.type === 'on') notes.press(`playback:${event.midi}`, event.midi, event.velocity);
  if (event.type === 'off') notes.release(`playback:${event.midi}`);
  if (event.type === 'sustain') { playbackSustain = event.enabled; updateSustain(); }
  if (event.type === 'reset') {
    for (const owner of [...notes.owners.keys()]) if (owner.startsWith('playback:')) notes.release(owner);
    playbackSustain = false; updateSustain();
  }
}, onChange: updateRecorder });

function updateSustain() {
  const value = latchedSustain || spaceSustain || playbackSustain;
  if (audio.sustain !== value) recorder.capture({ type: 'sustain', enabled: value });
  audio.setSustain(value);
  $('sustain').setAttribute('aria-pressed', String(value));
}
function updateRecorder() {
  $('record').classList.toggle('recording', recorder.recording);
  $('record-label').textContent = recorder.recording ? 'Stop' : 'Record';
  $('record').setAttribute('aria-label', recorder.recording ? 'Stop recording' : 'Start recording');
  $('playback').disabled = recorder.recording || !recorder.events.length;
  $('playback').setAttribute('aria-label', recorder.playing ? 'Stop playback' : 'Play recording');
  $('playback').querySelector('use').setAttribute('href', recorder.playing ? '#i-stop' : '#i-play');
  $('clear-recording').disabled = recorder.recording || !recorder.events.length;
  $('recording-caption').textContent = recorder.recording ? 'Listening. Make it yours.' : recorder.playing ? 'A moment, played back.' : recorder.events.length ? 'Your last take is ready.' : 'Let your ideas take shape.';
  updateTime();
}
function updateTime() {
  const seconds = Math.floor(recorder.elapsed / 1000);
  $('recording-time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
setInterval(() => { if (recorder.recording || recorder.playing) updateTime(); }, 100);
updateRecorder();

// Keep the 88-note instrument intact; only its visible playing window changes.
let keyboardMode = matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 1 ? '2' : 'full';
let keyboardStart = 48;
try {
  const saved = JSON.parse(localStorage.getItem('atelier-keyboard-view-v1'));
  if (saved && ['2', '3', 'full', 'two-rows'].includes(saved.mode)) { keyboardMode = saved.mode; keyboardStart = saved.start; }
} catch {}
function updateKeyboardControls() {
  const view = piano.view;
  $('keyboard-mode').value = view.mode;
  $('keyboard-lower').disabled = !view.canLower;
  $('keyboard-higher').disabled = !view.canHigher;
  $('keyboard-range').textContent = view.mode === 'two-rows' ? 'A0–B3 / C4–C8' : `${view.first.label} – ${view.last.label}`;
  document.querySelector('.studio').dataset.keyboardMode = view.mode;
  $('sheet-size-toggle').hidden = view.mode !== 'two-rows';
  $('keyboard-first').textContent = view.first.label;
  $('keyboard-last').textContent = view.last.label;
  $('keyboard-caption').textContent = view.mode === 'full' ? 'ATELIER · 88 KEYS' : `ATELIER · ${view.geometry.length} VISIBLE KEYS`;
}
function changeKeyboard(mode, direction = 0) {
  touch.cancelAll();
  // Release live fingers/typing, but preserve playback and the recording timeline.
  for (const owner of [...notes.owners.keys()]) if (!owner.startsWith('playback:')) notes.release(owner);
  if (direction) piano.shift(direction);
  else piano.setView(mode, piano.view.start);
  updateKeyboardControls();
  try { localStorage.setItem('atelier-keyboard-view-v1', JSON.stringify({ mode:piano.view.mode, start:piano.view.start })); } catch {}
}
piano.setView(keyboardMode, keyboardStart);
updateKeyboardControls();
$('keyboard-mode').addEventListener('change', event => changeKeyboard(event.target.value));
$('keyboard-lower').addEventListener('click', () => changeKeyboard(piano.view.mode, -1));
$('keyboard-higher').addEventListener('click', () => changeKeyboard(piano.view.mode, 1));

const practice = new PracticeLayout(piano);
new SheetViewer({ toast });
// These guards are scoped to our custom pointer surfaces, never the document.
// Sheet pinching/panning still uses its independent Pointer Events controller.
for (const element of [$('keyboard'), $('sheet-viewport'), $('practice-divider')]) {
  for (const eventName of ['gesturestart', 'gesturechange', 'gestureend', 'touchmove']) {
    element.addEventListener(eventName, event => { if (event.cancelable) event.preventDefault(); }, { passive:false });
  }
  element.addEventListener('contextmenu', event => event.preventDefault());
}
function layout() { practice.resize(); }
window.addEventListener('resize', layout);

async function activate() {
  try {
    await audio.activate();
    ready = true;
    $('welcome').close();
    $('audio-status').textContent = 'Ready when you are';
    $('sound-type').textContent = 'Sampled acoustic grand';
    updateOfflineStatus();
    audio.context.onstatechange = () => {
      if (audio.context.state !== 'running' && ready) {
        interrupt(); ready = false;
        $('start-hint').textContent = 'Tap to bring the sound back.';
        $('settings').close();
        if (!$('welcome').open) $('welcome').showModal();
        $('audio-status').textContent = 'Sound paused';
      }
    };
  } catch (error) {
    $('start-hint').textContent = error.message || 'Sound could not start. Please tap again.';
  }
}
$('welcome').addEventListener('cancel', event => event.preventDefault());
$('welcome').showModal();
async function loadInstrument() {
  $('start-piano').disabled = true;
  $('start-piano').textContent = 'Loading Concert Grand…';
  $('start-hint').textContent = 'Preparing the acoustic piano recordings.';
  $('audio-status').textContent = 'Loading Concert Grand';
  try {
    await audio.load(({ loaded, total, percent }) => {
      $('sample-progress').value = percent;
      $('loading-percent').textContent = `${percent}%`;
      $('loading-count').textContent = `${loaded} of ${total} recordings ready`;
    });
    $('start-piano').textContent = 'Tap to Start Piano →';
    $('start-hint').textContent = 'Your concert grand is ready. Sound on.';
    $('audio-status').textContent = 'Concert Grand ready';
    $('sound-type').textContent = 'Sampled acoustic grand';
  } catch (error) {
    $('start-piano').textContent = 'Retry loading recordings';
    $('start-hint').textContent = error.message;
    $('audio-status').textContent = 'Sample loading paused';
  } finally { $('start-piano').disabled = false; updateOfflineStatus(); }
}
$('start-piano').addEventListener('click', () => audio.ready ? activate() : loadInstrument());
loadInstrument();
$('sustain').addEventListener('click', () => { latchedSustain = !latchedSustain; updateSustain(); });
$('volume').value = settings.volume;
$('settings-volume').value = settings.volume;
audio.setVolume(settings.volume / 100);
for (const id of ['volume', 'settings-volume']) $(id).addEventListener('input', event => {
  settings.volume = Number(event.target.value); audio.setVolume(settings.volume / 100);
  $('volume').value = settings.volume; $('settings-volume').value = settings.volume; saveSettings();
});
$('note-labels').checked = settings.labels;
$('keyboard').classList.toggle('show-labels', settings.labels);
$('note-labels').addEventListener('change', event => { settings.labels = event.target.checked; $('keyboard').classList.toggle('show-labels', settings.labels); saveSettings(); });
$('reverb').value = settings.reverb; audio.setAmbience(settings.reverb / 100);
$('reverb').addEventListener('input', event => { settings.reverb = Number(event.target.value); audio.setAmbience(settings.reverb / 100); saveSettings(); });
$('settings-toggle').addEventListener('click', () => { touch.cancelAll(); notes.releaseAll(); $('settings').showModal(); });
$('settings-close').addEventListener('click', () => $('settings').close());
$('settings').addEventListener('click', event => {
  if (event.target !== $('settings')) return;
  const rect = $('settings').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('settings').close();
});
$('panic').addEventListener('click', () => { interrupt(); toast('All notes released. A fresh start.'); });
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else toast('For a full-screen piano, use Safari → Share → Add to Home Screen.');
  } catch { toast('Use Safari → Share → Add to Home Screen for a full-screen piano.'); }
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
  layout();
});

$('record').addEventListener('click', () => {
  if (!ready) return;
  if (recorder.recording) { recorder.stop(); toast('Your take is saved on this device.'); }
  else {
    recorder.stopPlayback();
    recorder.start(audio.sustain);
    for (const midi of notes.pitches.keys()) recorder.capture({ type: 'on', midi, velocity: .75 });
  }
});
$('playback').addEventListener('click', () => { if (ready) recorder.playing ? recorder.stopPlayback() : recorder.play(); });
$('clear-recording').addEventListener('click', () => { recorder.clear(); toast('Recording cleared. Room for something new.'); });

function stopMetronome() {
  clearInterval(metroTimer); clearTimeout(beatTimer); metroTimer = null;
  $('metronome').setAttribute('aria-pressed', 'false'); $('beat-light').classList.remove('beat');
}
function scheduleBeats() {
  if (!audio.context || audio.context.state !== 'running') return;
  const now = audio.context.currentTime;
  if (nextBeat < now - .1) nextBeat = now;
  while (nextBeat < now + .1) {
    audio.click(nextBeat, metroBeat % 4 === 0);
    const delay = Math.max(0, (nextBeat - now) * 1000);
    beatTimer = setTimeout(() => {
      if (!metroTimer) return;
      $('beat-light').classList.add('beat');
      beatTimer = setTimeout(() => $('beat-light').classList.remove('beat'), 70);
    }, delay);
    nextBeat += 60 / settings.tempo; metroBeat++;
  }
}
$('metronome').addEventListener('click', () => {
  if (!ready) return;
  if (metroTimer) stopMetronome();
  else { nextBeat = audio.context.currentTime; metroBeat = 0; metroTimer = setInterval(scheduleBeats, 25); $('metronome').setAttribute('aria-pressed', 'true'); scheduleBeats(); }
});
$('tempo').value = settings.tempo;
$('tempo').addEventListener('change', event => { settings.tempo = clamp(Number(event.target.value) || 80, 30, 240); event.target.value = settings.tempo; saveSettings(); });

const COMPUTER_KEYS = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon'];
window.addEventListener('keydown', event => {
  if (!ready || $('settings').open || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest('input, select, textarea')) return;
  if (['Space', 'Enter'].includes(event.code) && event.target.closest('button') && !event.target.closest('.piano-key')) return;
  if (event.code === 'Space') { event.preventDefault(); spaceSustain = true; updateSustain(); return; }
  if (event.repeat) return;
  if ((event.code === 'Enter') && event.target.matches('.piano-key')) {
    event.preventDefault(); notes.press('accessible', Number(event.target.dataset.midi)); return;
  }
  const index = COMPUTER_KEYS.indexOf(event.code);
  if (index >= 0) {
    const midi = piano.computerBase + index;
    if (midi <= 108) { event.preventDefault(); notes.press(`computer:${event.code}`, midi); }
  }
});
window.addEventListener('keyup', event => {
  if (event.code === 'Space') { spaceSustain = false; updateSustain(); }
  if (event.code === 'Enter') notes.release('accessible');
  notes.release(`computer:${event.code}`);
});
function interrupt() {
  touch.cancelAll(); notes.releaseAll(); recorder.stopPlayback();
  latchedSustain = false; spaceSustain = false; playbackSustain = false; updateSustain();
  recorder.stop(); audio.panic(); stopMetronome();
}
window.addEventListener('blur', interrupt);
window.addEventListener('pagehide', interrupt);
document.addEventListener('visibilitychange', () => { if (document.hidden) interrupt(); });

function updateOfflineStatus() {
  $('offline-status').textContent = offlineShellReady && audio.ready && audio.offlineReady
    ? 'Piano and sheet music viewer are ready offline on this device. In Safari, tap Share → Add to Home Screen.'
    : !isSecureContext
      ? 'Playing works here. Use the HTTPS GitHub Pages address to install and save the piano for offline use.'
      : audio.ready && !audio.offlineReady
        ? 'The piano is ready online. Device storage could not save all recordings for offline use.'
        : 'Keep this page open online while the piano and sheet music viewer are saved. Then use Safari → Share → Add to Home Screen.';
}
async function registerOfflineApp() {
  if (!('serviceWorker' in navigator) || !isSecureContext) { updateOfflineStatus(); return; }
  try {
    const root = new URL('../', import.meta.url);
    const registration = await navigator.serviceWorker.register(new URL('service-worker.js', root), { scope:root.href, updateViaCache:'none' });
    const observe = worker => {
      if (!worker) return;
      const changed = () => {
        if (worker.state === 'activated') { offlineShellReady = true; updateOfflineStatus(); }
      };
      worker.addEventListener('statechange', changed); changed();
    };
    observe(registration.installing || registration.waiting || registration.active);
    registration.addEventListener('updatefound', () => observe(registration.installing));
  } catch { $('offline-status').textContent = 'Online studio. Offline setup could not finish; reconnect and reload to try again.'; }
}
if (document.readyState === 'complete') registerOfflineApp();
else window.addEventListener('load', registerOfflineApp, { once:true });
