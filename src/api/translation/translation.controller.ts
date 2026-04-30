import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { AzureADGuard } from '../../auth/azure-ad.guard';
import { CurrentUser } from '../../auth/user.decorator';
import { AuthenticatedUser } from '../../auth/authenticateduser';
import { TranslationRequest, TranslationResponse, TranslationStatusResponse } from './models';

@Controller('api/translation')
@UseGuards(AzureADGuard)
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  /**
   * Translate a SharePoint page into one or more languages.
   * POST /api/translation
   *
   * Request body:
   * {
   *   "siteUrl": "https://contoso.sharepoint.com/sites/MySite",
   *   "pageUrl": "/sites/MySite/SitePages/Home.aspx",   // one of pageUrl or pageId required
   *   "pageId": "a1b2c3d4-...",                         // GUID of the page list item
   *   "languages": ["fr", "es", "de"]                   // BCP 47 language tags
   * }
   *
   * Response:
   * {
   *   "siteUrl": "https://contoso.sharepoint.com/sites/MySite",
   *   "pageUrl": "/sites/MySite/SitePages/Home.aspx",
   *   "pageId": "a1b2c3d4-...",
   *   "translations": [
   *     { "language": "fr", "content": "..." },
   *     { "language": "es", "content": "..." }
   *   ]
   * }
   */
  @Post()
  async translatePage(
    @Body() request: TranslationRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TranslationResponse> {
    return this.translationService.translatePage(request, user);
  }

  /**
   * Get translation status for a SharePoint page.
   * GET /api/translation/status?siteUrl=...&pageId=...
   *
   * Query params:
   * - siteUrl: absolute URL of the SharePoint site, e.g. https://contoso.sharepoint.com/sites/MySite
   * - pageId:  numeric list item ID of the source page (the integer used in /_api/sitepages/pages({id}))
   *
   * Response:
   * {
   *   "siteUrl": "https://contoso.sharepoint.com/sites/MySite",
   *   "pageId": 9,
   *   "path": "/sites/MySite/SitePages/Home.aspx",
   *   "version": "1.0",
   *   "translations": [
   *     { "language": "es", "path": "/sites/MySite/SitePages/es/Home.aspx",
   *       "fileStatus": "published", "hasPublishedVersion": true },
   *     { "language": "fr", "path": "/sites/MySite/SitePages/fr/Home.aspx",
   *       "fileStatus": "draft", "hasPublishedVersion": false }
   *   ],
   *   "untranslatedLanguages": ["de"]
   * }
   */
  @Get('status')
  async getTranslationStatus(
    @Query('siteUrl') siteUrl: string,
    @Query('pageId') pageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TranslationStatusResponse> {
    return this.translationService.getTranslationStatus({ siteUrl, pageId: Number(pageId) }, user);
  }
}
