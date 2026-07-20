/**
 * Voice Transcription Service — uses local Whisper (100% free)
 * Handles Hindi, English, Punjabi, accents, code-mixed speech perfectly
 *
 * Setup (one time):
 *   pip install openai-whisper
 *   pip install ffmpeg-python
 *   Also install ffmpeg: https://ffmpeg.org/download.html (add to PATH)
 *
 * Whisper 'medium' model (~1.5GB) = best balance of speed and accuracy for Indian languages
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const execAsync = promisify(exec);

const WHISPER_MODEL = process.env.WHISPER_MODEL || 'medium';

/**
 * Transcribe an audio file using local Whisper.
 * @param {Buffer} audioBuffer - audio data (webm/mp4/wav)
 * @param {string} mimeType - e.g. 'audio/webm'
 * @returns {string} transcribed text
 */
async function transcribe(audioBuffer, mimeType = 'audio/webm') {
  // Write buffer to temp file
  const ext = mimeType.includes('mp4') ? '.mp4' : mimeType.includes('wav') ? '.wav' : '.webm';
  const tmpFile = path.join(os.tmpdir(), `voice_${Date.now()}${ext}`);
  const outBase = path.join(os.tmpdir(), `voice_${Date.now()}_out`);

  fs.writeFileSync(tmpFile, audioBuffer);

  try {
    // Run whisper CLI
    // --language auto = auto-detect (handles Hindi/English/Punjabi)
    // --model medium = good accuracy for Indian languages
    // --output_format txt = plain text output
    const cmd = `whisper "${tmpFile}" --model ${WHISPER_MODEL} --language auto --output_format txt --output_dir "${os.tmpdir()}" --output_name "voice_${Date.now()}_out" --fp16 False`;

    await execAsync(cmd, { timeout: 60000 }); // 60s max

    const outFile = `${outBase}.txt`;
    if (fs.existsSync(outFile)) {
      const text = fs.readFileSync(outFile, 'utf8').trim();
      fs.unlinkSync(outFile);
      return text;
    }

    // Fallback: check for any output file
    const files = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(`voice_`) && f.endsWith('.txt'));
    if (files.length > 0) {
      const latest = files.sort().pop();
      const text = fs.readFileSync(path.join(os.tmpdir(), latest), 'utf8').trim();
      try { fs.unlinkSync(path.join(os.tmpdir(), latest)); } catch {}
      return text;
    }

    throw new Error('Whisper produced no output file');
  } finally {
    // Cleanup temp input
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

/**
 * Check if Whisper is installed and working.
 */
async function checkWhisperAvailable() {
  try {
    await execAsync('whisper --help', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

module.exports = { transcribe, checkWhisperAvailable };
