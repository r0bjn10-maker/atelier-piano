"""Convert the licensed upstream FLAC layer into lossless 24-bit WAV files.

Developer-only: pip install soundfile numpy; download original v8 files into
test-results/source-samples, then python scripts/prepare-samples.py.
The application has no Python dependencies.
"""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'test-results/audio-tools'))
import soundfile as sf
import numpy as np

source_dir = ROOT / 'test-results/source-samples'
output_dir = ROOT / 'assets/audio/piano/medium'
output_dir.mkdir(parents=True, exist_ok=True)
files = sorted(source_dir.glob('*v8.flac'))
assert len(files) == 30, f'Expected 30 source notes, got {len(files)}'
provenance = []
for source in files:
    data, rate = sf.read(source, dtype='int32', always_2d=True)
    name = source.stem.replace('v8', '').replace('#', 's') + '.wav'
    output = output_dir / name
    sf.write(output, data, rate, subtype='PCM_24')
    decoded, check_rate = sf.read(output, dtype='int32', always_2d=True)
    assert check_rate == rate and np.array_equal(data, decoded), f'Lossless conversion failed: {name}'
    provenance.append({
        'file': 'medium/' + name, 'source': source.name, 'sampleRate': rate,
        'channels': data.shape[1], 'duration': len(data) / rate, 'bytes': output.stat().st_size,
        'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    })
(output_dir.parent / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
print(f'Converted {len(files)} recordings, {sum(f["bytes"] for f in provenance) / 1e6:.1f} MB. PCM data verified bit-for-bit.')
