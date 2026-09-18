import test from 'node:test';
import assert from 'node:assert/strict';
import { keyboardView, hitTestPiano } from '../js/piano.js';

test('wide views show 25 / 37 keys with full white endpoints and true pitches', () => {
  for (const [mode,total,whites] of [['2',25,15],['3',37,22],['full',88,52]]) {
    const view = keyboardView(mode,48);
    assert.equal(view.geometry.length,total); assert.equal(view.whites.length,whites);
    assert.equal(view.first.black,false); assert.equal(view.last.black,false);
    assert.equal(view.first.label,mode==='full'?'A0':'C3');
    for (const width of [810,996,1166,1338]) for (const key of view.geometry) {
      assert.equal(hitTestPiano((key.left+key.width/2)/whites*width,key.black?70:270,width,320,view),key.midi);
    }
  }
});

test('every window stays inside the real 88-note instrument and remains hittable at both ends', () => {
  for (const mode of ['2','3']) for(const start of [-100,21,24,36,48,60,72,84,96,108,999,NaN]) {
    const view=keyboardView(mode,start);
    assert.ok(view.first.midi>=21 && view.last.midi<=108);
    assert.equal(view.first.black,false); assert.equal(view.last.black,false);
    assert.equal(hitTestPiano(0,290,1000,320,view),view.first.midi);
    assert.equal(hitTestPiano(999.99,290,1000,320,view),view.last.midi);
    for(const key of view.geometry) assert.ok(key.left>=0 && key.left+key.width<=view.whites.length);
  }
  assert.equal(keyboardView('2',21).canLower,false);
  assert.equal(keyboardView('2',84).canHigher,false);
  assert.equal(keyboardView('3',72).canHigher,false);
  assert.equal(keyboardView('full').canHigher,false);
});
