// scripts/fetch-local-models.mjs
// Ensures ONNX Runtime WASM binaries and onnx-community/whisper-base local model weights
// are bundled into public/ort/ and public/models/onnx-community/whisper-base/ for offline
// and zero-download MSIX startup.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// 1. Copy ONNX Runtime Web WASM/MJS binaries into public/ort/ and public/models/demucs/ort/
const ortDistCandidates = [
  path.join(rootDir, 'node_modules', '@huggingface', 'transformers', 'node_modules', 'onnxruntime-web', 'dist'),
  path.join(rootDir, 'node_modules', 'onnxruntime-web', 'dist'),
];

const ortSrc = ortDistCandidates.find(d => fs.existsSync(d));
if (ortSrc) {
  for (const destRel of ['public/ort', 'public/models/demucs/ort']) {
    const destDir = path.join(rootDir, destRel);
    fs.mkdirSync(destDir, { recursive: true });
    for (const f of fs.readdirSync(ortSrc)) {
      if (f.endsWith('.wasm') || (f.startsWith('ort-wasm') && f.endsWith('.mjs'))) {
        const srcFile = path.join(ortSrc, f);
        const destFile = path.join(destDir, f);
        try {
          if (!fs.existsSync(destFile) || fs.statSync(destFile).size !== fs.statSync(srcFile).size) {
            fs.copyFileSync(srcFile, destFile);
          }
        } catch { /* skip if locked */ }
      }
    }
    console.log(`[models] Verified ONNX Runtime WASM binaries -> ${destRel}`);
  }
}

// 2. Download onnx-community/whisper-base files into public/models/onnx-community/whisper-base/
const MODEL_ID = 'onnx-community/whisper-base';
const BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_fp16.onnx',
  'onnx/decoder_model_merged_q4.onnx',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];

const modelDestRoot = path.join(rootDir, 'public', 'models', MODEL_ID);

async function downloadFile(relPath) {
  const dest = path.join(modelDestRoot, relPath);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
    console.log(`[models] Cached: ${relPath} (${(fs.statSync(dest).size / 1024 / 1024).toFixed(2)} MB)`);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const url = `${BASE_URL}/${relPath}`;
  console.log(`[models] Downloading ${url} ...`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
  console.log(`[models] Saved ${relPath} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
}

for (const file of FILES) {
  await downloadFile(file);
}
console.log('[models] All local ONNX models and WASM runtimes are ready for offline & MSIX bundling.');
