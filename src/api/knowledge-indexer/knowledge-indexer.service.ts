import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@microsoft/microsoft-graph-client';
import { ConfigurationService } from '../config/configuration.service';
import { AppGraphService } from '../shared-services/app-graph.service';

export interface KnowledgeDocument {
  id: string;
  title: string;
  webUrl: string;
  fileType: string;
  lastModified: string;
  siteUrl: string;
  siteName: string;
  driveId?: string;
  driveItemId?: string;
}

export interface SearchHit {
  hitId: string;
  resource: {
    '@odata.type': string;
    id: string;
    name: string;
    webUrl: string;
    lastModifiedDateTime: string;
    fileExtension?: string;
    parentReference?: {
      siteId?: string;
      driveId?: string;
    };
    sharepointIds?: {
      siteUrl?: string;
    };
    listItem?: {
      id: string;
      fields: Record<string, unknown>;
    };
  };
}

export interface SearchResponse {
  value: Array<{
    hitsContainers: Array<{
      hits: SearchHit[];
      total: number;
      moreResultsAvailable: boolean;
    }>;
  }>;
}

export interface IndexerOptions {
  /** Limit search to a specific site URL. If not provided, searches all sites. */
  siteUrl?: string;
  /** Number of days back to search for modified documents. Defaults to 2. */
  modifiedWithinDays?: number;
}

@Injectable()
export class KnowledgeIndexerService {
  private readonly logger = new Logger(KnowledgeIndexerService.name);
  private graphClient: Client;

  constructor(
    private readonly appGraphService: AppGraphService,
    private readonly configurationService: ConfigurationService,
  ) {}

  /**
   * Search SharePoint for documents marked as knowledge content.
   * Uses app-only permissions and specifies the geo region.
   */
  async searchKnowledgeDocuments(options: IndexerOptions = {}): Promise<KnowledgeDocument[]> {
    this.graphClient = this.appGraphService.getClient();
    const { configuration } = this.configurationService;

    const { siteUrl, modifiedWithinDays = 2 } = options;

    // Build KQL query
    const kqlParts: string[] = [
      'IsKnowledgeOWSBOOL:1',
      '(FileType:aspx OR FileType:doc OR FileType:docx OR FileType:pdf)',
    ];

    // Add site filter if provided
    if (siteUrl) {
      kqlParts.push(`path:"${siteUrl}"`);
    }

    // Add date range filter
    const dateRange = this.buildDateRangeFilter(modifiedWithinDays);
    if (dateRange) {
      kqlParts.push(dateRange);
    }

    const kqlQuery = kqlParts.join(' ');

    const searchRequest = {
      requests: [
        {
          entityTypes: ['driveItem', 'listItem'],
          query: {
            queryString: kqlQuery,
          },
          from: 0,
          size: 500,
          region: configuration.SHAREPOINT_GEO,
          fields: [
            'id',
            'name',
            'webUrl',
            'lastModifiedDateTime',
            'parentReference',
            'listItem',
            'sharepointIds',
            'fileExtension',
            'SPSiteUrl',
            'SiteTitle',
          ],
        },
      ],
    };

    this.logger.log(`Executing knowledge search with query: ${kqlQuery}`);

    try {
      const response: SearchResponse = await this.graphClient
        .api('/search/query')
        .post(searchRequest);

      const documents = this.parseSearchResults(response);
      this.logger.log(`Found ${documents.length} knowledge documents`);

      return documents;
    } catch (error) {
      this.logger.error('Failed to search for knowledge documents', error);
      throw error;
    }
  }

  /**
   * Build a KQL date range filter for LastModifiedTime.
   */
  private buildDateRangeFilter(daysBack: number): string {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysBack);

    // Format as YYYY-MM-DD for KQL
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    return `LastModifiedTime>=${formatDate(startDate)} LastModifiedTime<=${formatDate(now)}`;
  }

  /**
   * Parse search results into a normalized document structure.
   */
  private parseSearchResults(response: SearchResponse): KnowledgeDocument[] {
    const documents: KnowledgeDocument[] = [];

    for (const result of response.value || []) {
      for (const container of result.hitsContainers || []) {
        for (const hit of container.hits || []) {
          const resource = hit.resource;
          // this.logger.log(resource);

          documents.push({
            id: hit.hitId,
            title: resource.name,
            webUrl: resource.webUrl,
            fileType: resource.fileExtension || this.inferFileType(resource.name),
            lastModified: resource.lastModifiedDateTime,
            siteUrl: (resource.listItem?.fields?.spSiteUrl as string) ?? '',
            siteName: (resource.listItem?.fields?.siteTitle as string) ?? '',
            driveId: resource.parentReference?.driveId,
            driveItemId: resource.id,
          });
        }
      }
    }

    return documents;
  }

  /**
   * Fallback to infer file type from name if fileExtension not returned.
   */
  private inferFileType(filename: string): string {
    const match = filename.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : 'unknown';
  }

  /**
   * Get the content of a document for embedding generation.
   * This will be expanded in the next phase.
   */
  async getDocumentContent(document: KnowledgeDocument): Promise<string> {
    // Placeholder for next phase - will use similar logic to GraphFileReaderTool
    this.logger.log(`Would fetch content for: ${document.title}`);
    return '';
  }
}
