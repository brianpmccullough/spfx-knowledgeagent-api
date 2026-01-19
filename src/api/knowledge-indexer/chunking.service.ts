import { Injectable, Logger } from '@nestjs/common';

export interface ChunkOptions {
  /** Target size of each chunk in characters. Default: 1500 (~375 tokens) */
  chunkSize?: number;
  /** Overlap between chunks in characters. Default: 200 (~50 tokens) */
  chunkOverlap?: number;
  /** Minimum chunk size to keep. Default: 100 */
  minChunkSize?: number;
}

export interface TextChunk {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

@Injectable()
export class ChunkingService {
  private readonly logger = new Logger(ChunkingService.name);

  // Approximate: 1 token ≈ 4 characters for English text
  private static readonly CHARS_PER_TOKEN = 4;

  /**
   * Split text into overlapping chunks.
   * Uses paragraph/sentence boundaries when possible for cleaner splits.
   */
  chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
    const { chunkSize = 1500, chunkOverlap = 200, minChunkSize = 100 } = options;

    if (!text || text.trim().length < minChunkSize) {
      if (text && text.trim().length > 0) {
        return [
          {
            index: 0,
            text: text.trim(),
            startOffset: 0,
            endOffset: text.length,
          },
        ];
      }
      return [];
    }

    const chunks: TextChunk[] = [];
    let currentPosition = 0;
    let chunkIndex = 0;

    while (currentPosition < text.length) {
      // Calculate end position for this chunk
      let endPosition = Math.min(currentPosition + chunkSize, text.length);

      // If we're not at the end, try to find a good break point
      if (endPosition < text.length) {
        endPosition = this.findBreakPoint(text, currentPosition, endPosition, chunkSize);
      }

      const chunkText = text.slice(currentPosition, endPosition).trim();

      if (chunkText.length >= minChunkSize) {
        chunks.push({
          index: chunkIndex++,
          text: chunkText,
          startOffset: currentPosition,
          endOffset: endPosition,
        });
      }

      // Move position forward, accounting for overlap
      if (endPosition >= text.length) {
        break;
      }

      // Calculate next start position with overlap
      const nextStart = endPosition - chunkOverlap;
      currentPosition = Math.max(nextStart, currentPosition + 1);

      // Try to start at a sentence boundary if possible
      currentPosition = this.findStartPoint(text, currentPosition, endPosition);
    }

    this.logger.debug(`Chunked ${text.length} characters into ${chunks.length} chunks`);

    return chunks;
  }

  /**
   * Find a good break point (paragraph, sentence, or word boundary).
   */
  private findBreakPoint(text: string, start: number, idealEnd: number, chunkSize: number): number {
    const searchStart = Math.max(start, idealEnd - Math.floor(chunkSize * 0.3));
    const searchText = text.slice(searchStart, idealEnd);

    // Priority 1: Paragraph break (double newline)
    const paragraphBreak = searchText.lastIndexOf('\n\n');
    if (paragraphBreak !== -1) {
      return searchStart + paragraphBreak + 2;
    }

    // Priority 2: Single newline
    const lineBreak = searchText.lastIndexOf('\n');
    if (lineBreak !== -1) {
      return searchStart + lineBreak + 1;
    }

    // Priority 3: Sentence end (. ! ?)
    const sentenceMatch = searchText.match(/[.!?]\s+(?=[A-Z])/g);
    if (sentenceMatch) {
      const lastSentenceEnd = searchText.lastIndexOf(sentenceMatch[sentenceMatch.length - 1]);
      if (lastSentenceEnd !== -1) {
        return searchStart + lastSentenceEnd + sentenceMatch[sentenceMatch.length - 1].length;
      }
    }

    // Priority 4: Any period followed by space
    const periodSpace = searchText.lastIndexOf('. ');
    if (periodSpace !== -1) {
      return searchStart + periodSpace + 2;
    }

    // Priority 5: Word boundary (space)
    const lastSpace = searchText.lastIndexOf(' ');
    if (lastSpace !== -1) {
      return searchStart + lastSpace + 1;
    }

    // Fallback: hard cut at ideal position
    return idealEnd;
  }

  /**
   * Find a good start point after overlap (preferably sentence boundary).
   */
  private findStartPoint(text: string, idealStart: number, maxStart: number): number {
    const searchEnd = Math.min(maxStart, idealStart + 100);
    const searchText = text.slice(idealStart, searchEnd);

    // Look for sentence start (capital letter after sentence-ending punctuation)
    const sentenceStart = searchText.search(/^[.!?]\s+[A-Z]/);
    if (sentenceStart !== -1) {
      return idealStart + sentenceStart + 2;
    }

    // Look for paragraph start
    const paragraphStart = searchText.indexOf('\n\n');
    if (paragraphStart !== -1 && paragraphStart < 50) {
      return idealStart + paragraphStart + 2;
    }

    // Look for line start
    const lineStart = searchText.indexOf('\n');
    if (lineStart !== -1 && lineStart < 30) {
      return idealStart + lineStart + 1;
    }

    return idealStart;
  }

  /**
   * Estimate token count for text (rough approximation).
   */
  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / ChunkingService.CHARS_PER_TOKEN);
  }
}
