/**
 * ASR Transcriber stub
 * Provides transcribeFromUrl for debug routes.
 * Real implementation would use Whisper or similar ASR service.
 */

export async function transcribeFromUrl(audioUrl: string): Promise<{ text: string; confidence: number }> {
  // Stub: In production, this would call Whisper ASR API
  console.warn('[asr-transcriber] Stub called — real ASR not configured. URL:', audioUrl?.substring(0, 80))
  return { text: '', confidence: 0 }
}
