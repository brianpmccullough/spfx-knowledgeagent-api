import { Controller, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ExtractionService } from './extraction.service';
import { AzureADGuard } from '../../auth/azure-ad.guard';
import { CurrentUser } from '../../auth/user.decorator';
import { AuthenticatedUser } from '../../auth/authenticateduser';
import {
  MetadataExtractionRequest,
  MetadataExtractionResponse,
  TextExtractionRequest,
  TextExtractionResponse,
  TextOutputFormat,
} from './models';

@Controller('api/extract')
@UseGuards(AzureADGuard)
export class ExtractionController {
  constructor(private readonly extractionService: ExtractionService) {}

  /**
   * Extract metadata from a document.
   * POST /api/extract/metadata
   *
   * Request body:
   * {
   *   "document": {
   *     "path": "/sites/MySite/Shared Documents/document.docx"
   *     // OR
   *     "driveId": "b!abc123...",
   *     "driveItemId": "01ABC123..."
   *   },
   *   "fields": [
   *     {
   *       "title": "Author",
   *       "description": "Extract the author name from the document header or metadata",
   *       "dataType": "string"
   *     },
   *     {
   *       "title": "PageCount",
   *       "description": "Count the total number of pages in the document",
   *       "dataType": "number"
   *     }
   *   ]
   * }
   *
   * Response:
   * {
   *   "document": { ... },
   *   "results": [
   *     { "fieldName": "Author", "confidence": "green", "value": "John Doe" },
   *     { "fieldName": "PageCount", "confidence": "yellow", "value": 12 }
   *   ]
   * }
   */
  @Post('metadata')
  async extractMetadata(
    @Body() request: MetadataExtractionRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MetadataExtractionResponse> {
    return this.extractionService.extractMetadata(request, user);
  }

  /**
   * Extract text content from a document.
   * POST /api/extract/text?format=markdown|text
   *
   * Query params:
   * - format: Output format - 'markdown' (default) or 'text'
   *
   * Request body:
   * {
   *   "document": {
   *     "path": "/sites/MySite/Shared Documents/document.docx"
   *     // OR
   *     "driveId": "b!abc123...",
   *     "driveItemId": "01ABC123..."
   *   }
   * }
   *
   * Response:
   * {
   *   "document": { ... },
   *   "format": "markdown",
   *   "content": "# Document Title\n\nDocument content..."
   * }
   *
   * Supported document types: .docx, .pdf, .aspx (SharePoint pages)
   */
  @Post('text')
  async extractText(
    @Body() request: TextExtractionRequest,
    @Query('format') format: TextOutputFormat = 'markdown',
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TextExtractionResponse> {
    const validFormat = format === 'text' ? 'text' : 'markdown';
    return this.extractionService.extractText(request, validFormat, user);
  }
}
