/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/authenticateduser';
import { OboGraphService } from '../shared-services/obo-graph.service';
import {
  TranslationRequest,
  TranslationResponse,
  PageTranslation,
  TranslationStatusRequest,
  TranslationStatusResponse,
  TranslationStatusItem,
  TranslationFileStatus,
  SpoPageResponse,
} from './models';

const SPO_FILE_STATUS_MAP: Record<number, TranslationFileStatus> = {
  0: 'none',
  1: 'draft',
  2: 'published',
};

@Injectable()
export class TranslationService {
  constructor(private readonly oboGraphService: OboGraphService) {}

  async translatePage(
    request: TranslationRequest,
    user: AuthenticatedUser,
  ): Promise<TranslationResponse> {
    if (!request.pageUrl && !request.pageId) {
      throw new BadRequestException('Either pageUrl or pageId must be provided');
    }

    if (!request.languages || request.languages.length === 0) {
      throw new BadRequestException('At least one target language must be specified');
    }

    // TODO: fetch page content via Graph API using user.token (OBO flow)
    const pageContent = await this.fetchPageContent(request, user);

    // TODO: translate pageContent for each requested language
    // Options: Azure Cognitive Services Translator, or Claude via Anthropic SDK
    const translations: PageTranslation[] = await Promise.all(
      request.languages.map((language) => this.translateContent(pageContent, language, user)),
    );

    return {
      siteUrl: request.siteUrl,
      pageUrl: request.pageUrl ?? '',
      pageId: request.pageId ?? '',
      translations,
    };
  }

  async getTranslationStatus(
    request: TranslationStatusRequest,
    user: AuthenticatedUser,
  ): Promise<TranslationStatusResponse> {
    const token = await this.oboGraphService.getSharePointToken(user.token, request.siteUrl);

    const apiUrl =
      `${request.siteUrl}/_api/sitepages/pages(${request.pageId})` +
      `?$select=Path,Version,Translations&$expand=Translations`;

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json;odata=nometadata',
      },
    });

    if (!response.ok) {
      throw new InternalServerErrorException(
        `SharePoint pages API returned ${response.status}: ${await response.text()}`,
      );
    }

    const data = (await response.json()) as SpoPageResponse;

    const translations: TranslationStatusItem[] = (data.Translations?.Items ?? []).map((item) => ({
      language: item.Culture,
      path: item.Path,
      fileStatus: SPO_FILE_STATUS_MAP[item.FileStatus] ?? 'none',
      hasPublishedVersion: item.HasPublishedVersion,
    }));

    return {
      siteUrl: request.siteUrl,
      pageId: request.pageId,
      path: data.Path,
      version: data.Version,
      translations,
      untranslatedLanguages: data.Translations?.UntranslatedLanguageCodes ?? [],
    };
  }

  private async fetchPageContent(
    _request: TranslationRequest,
    _user: AuthenticatedUser,
  ): Promise<string> {
    // TODO: implement Graph API call to retrieve page HTML/text
    throw new Error('fetchPageContent not yet implemented');
  }

  private async translateContent(
    _content: string,
    language: string,
    _user: AuthenticatedUser,
  ): Promise<PageTranslation> {
    // TODO: implement translation (Azure Translator or Claude)
    throw new Error(`translateContent to '${language}' not yet implemented`);
  }
}
