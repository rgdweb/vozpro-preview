/** 
 * 🛡️ GOVERNANÇA OBRIGATÓRIA — LEIA ANTES DE ALTERAR ESTE ARQUIVO
 * ─────────────────────────────────────────────────────────────
 * ⚠️ REGRAS ABSOLUTAS (já causaram DOWNTIME real):
 *
 * 1. NUNCA: git reset --hard | rm -rf | git checkout -- .env
 * 2. NUNCA: altere .env de produção, git remote, DATABASE_URL, API keys
 * 3. NUNCA: crie scripts de deploy alternativos, arquivos temp no root
 * 4. SEMPRE: use deploy-seguro.py para deploy, vozpro-preview para commits
 * 5. SEMPRE: verifique next build passa, .env tem PostgreSQL, token bate
 *
 * 📋 LEIA COMPLETO:
 *    https://github.com/rgdweb/vozpro-preview/blob/main/REGRAS-ERROS-PROIBIDOS.md
 *    https://github.com/rgdweb/vozpro-preview/blob/main/GOVERNANCE.md
 *
 * 13 erros já cometidos que derrubaram o sistema.
 * Se você tocar em qualquer coisa sem ler as regras acima, vai quebrar.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Audio Trimmer — Trims audio buffers to a maximum duration (default 12 seconds)
 *
 * Supports:
 *   - WAV  : Full RIFF/WAV header parsing, PCM data slicing, header size updates
 *   - MP3  : ID3v2 passthrough + frame-level parsing (MPEG-1/2/2.5 Layer III)
 *   - Other: Pass-through with a warning log
 *
 * Pure TypeScript — zero external dependencies. Runs on Vercel Edge & Node.js.
 * Uses only Buffer / DataView (Node.js built-ins).
 */

// ============================================================
// TYPES
// ============================================================

export interface TrimResult {
  /** Trimmed audio data (or original if within limit) */
  buffer: ArrayBuffer;
  /** Whether the audio was actually trimmed */
  trimmed: boolean;
  /** Original estimated duration in seconds */
  originalDurationSec: number;
  /** Resulting duration in seconds */
  resultDurationSec: number;
  /** File format detected */
  format: 'wav' | 'mp3' | 'unknown';
}

// ============================================================
// LOGGING
// ============================================================

type LogLevel = 'warn' | 'info';

function log(level: LogLevel, message: string): void {
  if (typeof console !== 'undefined') {
    const fn = level === 'warn' ? console.warn : console.info;
    fn(`[audio-trimmer] ${message}`);
  }
}

// ============================================================
// FORMAT DETECTION
// ============================================================

function detectFormat(buffer: ArrayBuffer, filename: string): 'wav' | 'mp3' | 'unknown' {
  const bytes = new Uint8Array(buffer);

  // Check WAV: "RIFF"...."WAVE"
  if (buffer.byteLength >= 12) {
    const riff =
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46;
    const wave =
      bytes[8] === 0x57 &&
      bytes[9] === 0x41 &&
      bytes[10] === 0x56 &&
      bytes[11] === 0x45;
    if (riff && wave) return 'wav';
  }

  // Check MP3: look for either an ID3v2 tag or an MP3 sync word (0xFF 0xE0+)
  if (buffer.byteLength >= 3) {
    const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
    if (id3) return 'mp3';

    const sync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    if (sync) return 'mp3';
  }

  // Fallback to extension
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'wav') return 'wav';
  if (ext === 'mp3' || ext === 'mpeg') return 'mp3';

  return 'unknown';
}

// ============================================================
// WAV PARSING
// ============================================================

interface WavFormat {
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  byteRate: number;
  blockAlign: number;
  audioFormat: number;
}

interface WavChunks {
  fmt: { offset: number; size: number; data: WavFormat } | null;
  data: { offset: number; size: number } | null;
  /** Total header size (everything before the data chunk content) */
  headerSize: number;
  /** Extra chunks between header and data (e.g. LIST, fact, bext) */
  extraChunks: { offset: number; size: number; id: string }[];
}

/**
 * Parse all RIFF chunks in a WAV buffer.
 * Walks through the file chunk by chunk, correctly handling
 * non-standard layouts where chunks may appear in any order.
 */
function parseWavChunks(buffer: ArrayBuffer): WavChunks | null {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (buffer.byteLength < 12) return null;

  // Verify RIFF header
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (riff !== 'RIFF') return null;

  const wave = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (wave !== 'WAVE') return null;

  let offset = 12; // start after "RIFF<size>WAVE"
  const end = buffer.byteLength;

  let fmtResult: WavChunks['fmt'] = null;
  let dataResult: WavChunks['data'] = null;
  const extraChunks: WavChunks['extraChunks'] = [];

  while (offset + 8 <= end) {
    const chunkId = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
    const chunkSize = view.getUint32(offset + 4, true); // little-endian
    const chunkDataOffset = offset + 8;

    if (chunkDataOffset + chunkSize > end) {
      // Chunk extends past buffer — stop parsing
      break;
    }

    if (chunkId === 'fmt ') {
      if (chunkSize >= 16) {
        fmtResult = {
          offset: offset,
          size: chunkSize,
          data: {
            audioFormat: view.getUint16(chunkDataOffset, true),
            numChannels: view.getUint16(chunkDataOffset + 2, true),
            sampleRate: view.getUint32(chunkDataOffset + 4, true),
            byteRate: view.getUint32(chunkDataOffset + 8, true),
            blockAlign: view.getUint16(chunkDataOffset + 12, true),
            bitsPerSample: view.getUint16(chunkDataOffset + 14, true),
          },
        };
      }
    } else if (chunkId === 'data') {
      dataResult = { offset: offset, size: chunkSize };
    } else {
      extraChunks.push({ offset, size: chunkSize, id: chunkId });
    }

    // Advance: chunk header (8) + chunk data, padded to even byte boundary
    offset = chunkDataOffset + chunkSize;
    if (chunkSize % 2 !== 0) offset += 1; // RIFF padding byte
  }

  if (!fmtResult || !dataResult) return null;

  // Header size = everything up to (but not including) the data chunk content
  const headerSize = dataResult.offset + 8;

  return { fmt: fmtResult, data: dataResult, headerSize, extraChunks };
}

// ============================================================
// WAV TRIMMING
// ============================================================

/**
 * Trim a WAV buffer to at most `maxSeconds` of audio.
 *
 * Algorithm:
 *  1. Parse RIFF/WAVE header and locate fmt + data chunks
 *  2. Calculate bytes-per-second from format metadata
 *  3. Slice PCM data to the byte limit
 *  4. Rebuild the buffer: header + trimmed data
 *  5. Patch RIFF chunk size and data chunk size fields
 *
 * Returns the trimmed buffer, or the original if it's already short enough.
 */
export function trimWavBuffer(buffer: ArrayBuffer, maxSeconds: number): ArrayBuffer {
  if (maxSeconds <= 0) return buffer;

  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const chunks = parseWavChunks(buffer);
  if (!chunks) {
    log('warn', 'Cannot parse WAV header — returning original buffer');
    return buffer;
  }

  const { fmt, data, headerSize } = chunks;
  if (!fmt || !data) {
    log('warn', 'Missing fmt or data chunk — returning original buffer');
    return buffer;
  }

  const { sampleRate, numChannels, bitsPerSample, byteRate } = fmt.data;

  // Calculate current duration
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = data.size / (numChannels * bytesPerSample);
  const originalDurationSec = totalSamples / sampleRate;

  // Already short enough?
  if (originalDurationSec <= maxSeconds) {
    return buffer;
  }

  // Calculate maximum bytes to keep (must be aligned to block size)
  const maxBytes = Math.floor(maxSeconds * sampleRate) * numChannels * bytesPerSample;

  // Ensure we don't exceed actual data
  const trimBytes = Math.min(maxBytes, data.size);
  // Align down to block boundary just in case
  const alignedTrimBytes = trimBytes - (trimBytes % (numChannels * bytesPerSample));
  const finalTrimBytes = Math.max(0, alignedTrimBytes);

  if (finalTrimBytes <= 0) {
    log('warn', 'Trim resulted in zero-length audio — returning original buffer');
    return buffer;
  }

  const resultDurationSec = finalTrimBytes / byteRate;

  log(
    'warn',
    `Trimming WAV from ${originalDurationSec.toFixed(2)}s to ${resultDurationSec.toFixed(2)}s ` +
      `(removed ${(originalDurationSec - resultDurationSec).toFixed(2)}s, max=${maxSeconds}s)`,
  );

  // Build the new buffer
  // Layout: RIFF header (12) + chunks before data (headerSize - 12) + trimmed data
  // We need to reconstruct: keep everything up to data content, then insert trimmed data
  const headerPart = bytes.slice(0, headerSize); // includes "RIFF<size>WAVE" + all chunks + "data<size>"
  const dataPart = bytes.slice(data.offset + 8, data.offset + 8 + finalTrimBytes);

  const newDataSize = finalTrimBytes;
  // RIFF chunk size = total file size − 8 (the 8-byte RIFF header itself)
  const newRiffSize = headerSize + newDataSize - 8;

  // Assemble new buffer
  const result = new Uint8Array(headerSize + newDataSize);
  result.set(headerPart);

  // Patch RIFF chunk size at offset 4 (little-endian uint32)
  const resultView = new DataView(result.buffer);
  resultView.setUint32(4, newRiffSize, true);

  // Patch data chunk size at offset (data.offset + 4) relative to buffer start
  // But in the new buffer, the data chunk header is at the same relative position
  // since we kept headerPart intact up to headerSize
  resultView.setUint32(data.offset + 4, newDataSize, true);

  // Copy trimmed data
  result.set(dataPart, headerSize);

  return result.buffer;
}

// ============================================================
// MP3 PARSING & TRIMMING
// ============================================================

/**
 * MPEG version definitions for bitrates and sample rates.
 * Each entry is indexed by the 2-bit code from the frame header.
 */
interface MpegVersionEntry {
  version?: number;
  label: string;
}

interface MpegLayerEntry {
  layer?: number;
  label: string;
}

const MPEG_VERSIONS: MpegVersionEntry[] = [
  { version: 2.5, label: 'MPEG 2.5' },
  { label: 'reserved' },
  { version: 2, label: 'MPEG 2' },
  { version: 1, label: 'MPEG 1' },
];

const MPEG_LAYERS: MpegLayerEntry[] = [
  { label: 'reserved' },
  { layer: 3, label: 'Layer III' },
  { layer: 2, label: 'Layer II' },
  { layer: 1, label: 'Layer I' },
];

/** Bitrate tables [version_index][layer_index][bitrate_index] in kbps */
const BITRATES: Record<number, Record<number, number[]>> = {
  // MPEG 1
  3: {
    1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  },
  // MPEG 2 / 2.5
  2: {
    1: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  },
};

const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000],  // MPEG 2.5
};

interface Mp3FrameHeader {
  /** Frame offset in the file (start of sync word) */
  offset: number;
  /** MPEG version (1, 2, or 2.5) */
  version: number;
  /** Layer (1, 2, or 3) */
  layer: number;
  /** Bitrate in kbps */
  bitrate: number;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Padding flag */
  padding: boolean;
  /** Frame size in bytes (including header) */
  frameSize: number;
  /** Duration of this frame in seconds */
  durationSec: number;
}

/**
 * Read a syncsafe integer from 4 bytes (ID3v2 size encoding).
 * Each byte uses only 7 bits (MSB is 0).
 */
function readSyncsafe(view: DataView, offset: number): number {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  );
}

/**
 * Find the end of ID3v2 tags at the beginning of an MP3 file.
 * Returns the byte offset of the first audio frame (after ID3v2).
 * If there are no ID3v2 tags, returns 0.
 */
function findId3v2End(buffer: ArrayBuffer): number {
  if (buffer.byteLength < 10) return 0;

  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Check for ID3v2 magic
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return 0;
  }

  const majorVersion = view.getUint8(3);
  const flags = view.getUint8(5);

  // ID3v2 size (syncsafe) covers everything after the 10-byte header
  const tagSize = readSyncsafe(view, 6);
  let end = 10 + tagSize;

  // Handle footer (present if bit 4 of flags is set, v2.4 only)
  if (majorVersion >= 4 && (flags & 0x10)) {
    end += 10; // footer is another 10 bytes
  }

  return Math.min(end, buffer.byteLength);
}

/**
 * Try to parse an MP3 frame header at the given offset.
 * Returns the parsed header or null if it's not a valid frame sync.
 */
function parseMp3FrameHeader(
  buffer: ArrayBuffer,
  offset: number,
): Mp3FrameHeader | null {
  if (offset + 4 > buffer.byteLength) return null;

  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Check sync word: 0xFF followed by bits 111xxxxx (at least 0xE0)
  if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) {
    return null;
  }

  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];

  const versionIndex = (b1 >> 3) & 0x03;
  const layerIndex = (b1 >> 1) & 0x03;
  // protectionBit = b1 & 0x01; // unused — CRC flag, not needed for trimming

  const bitrateIndex = (b2 >> 4) & 0x0f;
  const sampleRateIndex = (b2 >> 2) & 0x03;
  const paddingBit = (b2 >> 1) & 0x01;

  // Validate version
  if (versionIndex === 1) return null; // reserved
  const versionEntry = MPEG_VERSIONS[versionIndex];
  if (versionEntry.version === undefined) return null;
  const version = versionEntry.version;

  // Validate layer
  if (layerIndex === 0) return null; // reserved
  const layerEntry = MPEG_LAYERS[layerIndex];
  if (layerEntry.layer === undefined) return null;
  const layer = layerEntry.layer;

  // Validate sample rate
  if (sampleRateIndex === 3) return null; // reserved
  const versionKey = versionIndex === 0 ? 0 : versionIndex;
  const sampleRateArr = SAMPLE_RATES[versionKey];
  const sampleRate = sampleRateArr?.[sampleRateIndex];
  if (!sampleRate) return null;

  // Validate bitrate
  if (bitrateIndex === 0 || bitrateIndex === 15) return null; // free or bad
  const bitrateKey = version >= 2 ? 2 : 3; // MPEG 2/2.5 use index 2, MPEG 1 uses index 3
  const bitrateArr = BITRATES[bitrateKey]?.[layerIndex];
  const bitrate = bitrateArr?.[bitrateIndex];
  if (!bitrate) return null;

  // Calculate frame size
  let frameSize: number;
  if (layer === 1) {
    // Layer I: frame_size = (12 * bitrate * 1000 / sampleRate + padding) * 4
    frameSize = Math.floor((12 * bitrate * 1000) / sampleRate + paddingBit) * 4;
  } else {
    // Layer II & III: frame_size = 144 * bitrate * 1000 / sampleRate + padding
    frameSize = Math.floor((144 * bitrate * 1000) / sampleRate) + paddingBit;
  }

  if (frameSize <= 0 || frameSize > buffer.byteLength - offset) {
    // Frame extends past buffer — still valid for duration calculation
    frameSize = Math.max(frameSize, 1);
  }

  // Calculate frame duration
  const samplesPerFrame = layer === 1 ? 384 : 1152;
  // For MPEG 2.5 and MPEG 2 Layer III, it's 576 samples
  const actualSamplesPerFrame =
    version < 1 && layer === 3 ? 576 : samplesPerFrame;
  const durationSec = actualSamplesPerFrame / sampleRate;

  return {
    offset,
    version,
    layer,
    bitrate,
    sampleRate,
    padding: paddingBit === 1,
    frameSize,
    durationSec,
  };
}

/**
 * Scan MP3 frames starting from the given offset.
 * Returns an array of frame headers (offset + size) and total duration estimate.
 *
 * Handles:
 *  - Free bitrate frames (index 0) by skipping them
 *  - Invalid/corrupt frames by scanning for next sync word
 *  - VBR streams (bitrate read per-frame)
 */
function scanMp3Frames(
  buffer: ArrayBuffer,
  startOffset: number,
): { frames: Mp3FrameHeader[]; totalDurationSec: number } {
  const frames: Mp3FrameHeader[] = [];
  let offset = startOffset;
  let totalDuration = 0;
  const bufferLen = buffer.byteLength;

  while (offset < bufferLen - 4) {
    const header = parseMp3FrameHeader(buffer, offset);

    if (header) {
      frames.push(header);
      totalDuration += header.durationSec;
      offset += header.frameSize;
    } else {
      // Skip one byte and look for next sync word
      offset += 1;
    }

    // Safety limit: don't scan more than reasonable
    if (frames.length > 200000) break;
  }

  return { frames, totalDurationSec: totalDuration };
}

/**
 * Trim an MP3 buffer to at most `maxSeconds` of audio.
 *
 * Strategy:
 *  1. Preserve ID3v2 tag (if present) at the beginning
 *  2. Scan MP3 frames to estimate cumulative duration
 *  3. Write ID3v2 + frames until duration >= maxSeconds
 *  4. Return new buffer
 */
function trimMp3Buffer(buffer: ArrayBuffer, maxSeconds: number): ArrayBuffer {
  if (maxSeconds <= 0) return buffer;

  const id3v2End = findId3v2End(buffer);
  const id3v2Tag = buffer.slice(0, id3v2End);

  const { frames, totalDurationSec } = scanMp3Frames(buffer, id3v2End);

  if (frames.length === 0) {
    log('warn', 'Could not parse any MP3 frames — returning original buffer');
    return buffer;
  }

  if (totalDurationSec <= maxSeconds) {
    return buffer;
  }

  // Determine how many frames to keep
  let cumulativeDuration = 0;
  let frameCount = 0;
  for (let i = 0; i < frames.length; i++) {
    cumulativeDuration += frames[i].durationSec;
    frameCount = i + 1;
    if (cumulativeDuration >= maxSeconds) break;
  }

  // Calculate byte boundary
  const lastFrame = frames[frameCount - 1];
  const audioEnd = lastFrame.offset + lastFrame.frameSize;
  const totalSize = id3v2End + (audioEnd - id3v2End);

  const resultDuration = cumulativeDuration;
  const originalDuration = totalDurationSec;

  log(
    'warn',
    `Trimming MP3 from ${originalDuration.toFixed(2)}s to ${resultDuration.toFixed(2)}s ` +
      `(${frameCount} frames, removed ${(originalDuration - resultDuration).toFixed(2)}s, max=${maxSeconds}s)`,
  );

  // Assemble new buffer
  const id3Part = new Uint8Array(id3v2Tag);
  const audioPart = new Uint8Array(buffer, id3v2End, audioEnd - id3v2End);

  const result = new Uint8Array(id3Part.length + audioPart.length);
  result.set(id3Part, 0);
  result.set(audioPart, id3Part.length);

  return result.buffer;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Trim any audio buffer to a maximum duration.
 *
 * Supports WAV (native parsing + slicing) and MP3 (frame-level parsing).
 * All other formats are passed through unchanged with a warning.
 *
 * @param buffer     - Raw ArrayBuffer of the audio file
 * @param filename   - Original filename (used for format detection fallback)
 * @param maxSeconds - Maximum duration in seconds (default: 12)
 * @returns TrimResult with the (possibly trimmed) buffer and metadata
 */
export function trimAudioBuffer(
  buffer: ArrayBuffer,
  filename: string,
  maxSeconds: number = 12,
): TrimResult {
  if (buffer.byteLength === 0) {
    return {
      buffer,
      trimmed: false,
      originalDurationSec: 0,
      resultDurationSec: 0,
      format: detectFormat(buffer, filename),
    };
  }

  const format = detectFormat(buffer, filename);

  switch (format) {
    case 'wav': {
      const chunks = parseWavChunks(buffer);
      let originalDurationSec = 0;

      if (chunks?.fmt && chunks.data) {
        const { sampleRate, numChannels, bitsPerSample } = chunks.fmt.data;
        const bytesPerSample = bitsPerSample / 8;
        const totalSamples =
          chunks.data.size / (numChannels * bytesPerSample);
        originalDurationSec = totalSamples / sampleRate;
      }

      const trimmedBuffer = trimWavBuffer(buffer, maxSeconds);

      // Re-calculate result duration
      const trimmedChunks = parseWavChunks(trimmedBuffer);
      let resultDurationSec = originalDurationSec;
      if (trimmedChunks?.fmt && trimmedChunks.data) {
        const { sampleRate, numChannels, bitsPerSample } =
          trimmedChunks.fmt.data;
        const bytesPerSample = bitsPerSample / 8;
        const totalSamples =
          trimmedChunks.data.size / (numChannels * bytesPerSample);
        resultDurationSec = totalSamples / sampleRate;
      }

      return {
        buffer: trimmedBuffer,
        trimmed: trimmedBuffer.byteLength < buffer.byteLength,
        originalDurationSec,
        resultDurationSec,
        format: 'wav',
      };
    }

    case 'mp3': {
      const id3v2End = findId3v2End(buffer);
      const { frames, totalDurationSec: originalDurationSec } =
        scanMp3Frames(buffer, id3v2End);

      const trimmedBuffer = trimMp3Buffer(buffer, maxSeconds);

      // Re-calculate result duration
      const trimmedId3End = findId3v2End(trimmedBuffer);
      const { totalDurationSec: resultDurationSec } = scanMp3Frames(
        trimmedBuffer,
        trimmedId3End,
      );

      return {
        buffer: trimmedBuffer,
        trimmed: trimmedBuffer.byteLength < buffer.byteLength,
        originalDurationSec,
        resultDurationSec,
        format: 'mp3',
      };
    }

    default: {
      log(
        'warn',
        `Unsupported audio format "${filename}" — returning original buffer ` +
          `(no trimming performed). Supported: WAV, MP3.`,
      );

      return {
        buffer,
        trimmed: false,
        originalDurationSec: 0,
        resultDurationSec: 0,
        format: 'unknown',
      };
    }
  }
}
