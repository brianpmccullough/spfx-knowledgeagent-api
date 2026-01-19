import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@microsoft/microsoft-graph-client';
import * as mammoth from 'mammoth';
import { AppGraphService } from '../shared-services/app-graph.service';
import { KnowledgeDocument } from './knowledge-indexer.service';

// Dynamic import for pdfjs-dist (ES module)
let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function getPdfJs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
  }
  return pdfjsLib;
}

@Injectable()
export class DocumentContentService {
  private readonly logger = new Logger(DocumentContentService.name);
  private graphClient: Client;

  constructor(private readonly appGraphService: AppGraphService) {}

  /**
   * Extract text content from a document.
   * Supports PDF, Word (doc/docx), and ASPX pages.
   */
  async extractContent(document: KnowledgeDocument): Promise<string> {
    this.graphClient = this.appGraphService.getClient();

    try {
      switch (document.fileType.toLowerCase()) {
        case 'pdf':
          return await this.extractPdfContent(document);
        case 'doc':
        case 'docx':
          return await this.extractWordContent(document);
        case 'aspx':
          return await this.extractAspxContent(document);
        default:
          this.logger.warn(`Unsupported file type: ${document.fileType} for ${document.title}`);
          return '';
      }
    } catch (error) {
      this.logger.error(`Failed to extract content from ${document.title}`, error);
      return '';
    }
  }

  /**
   * Extract text from PDF using pdfjs-dist.
   */
  private async extractPdfContent(document: KnowledgeDocument): Promise<string> {
    const pdfjs = await getPdfJs();

    // Download the file content
    const content = await this.downloadFileContent(document);
    //this.logger.debug('downloaded file content', content);
    if (!content) return '';

    try {
      const pdf = await pdfjs.getDocument({ data: content }).promise;
      const textParts: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        textParts.push(pageText);
      }

      const fullText = textParts.join('\n\n');
      this.logger.debug(`Extracted ${fullText.length} characters from PDF: ${document.title}`);

      return this.cleanText(fullText);
    } catch (error) {
      this.logger.error(`Failed to parse PDF: ${document.title}`, error);
      return '';
    }
  }

  /**
   * Extract text from Word documents using mammoth.
   */
  private async extractWordContent(document: KnowledgeDocument): Promise<string> {
    const content = await this.downloadFileContent(document);
    if (!content) return '';

    try {
      const result = await mammoth.extractRawText({
        buffer: Buffer.from(content),
      });

      this.logger.debug(`Extracted ${result.value.length} characters from Word: ${document.title}`);

      return this.cleanText(result.value);
    } catch (error) {
      this.logger.error(`Failed to parse Word document: ${document.title}`, error);
      return '';
    }
  }

  /**
   * Extract text from SharePoint ASPX pages.
   * Uses the page's text web parts content via Graph API.
   */
  private async extractAspxContent(document: KnowledgeDocument): Promise<string> {
    try {
      // Extract site path and page name from webUrl
      // Example: https://tenant.sharepoint.com/sites/sitename/SitePages/pagename.aspx
      const url = new URL(document.webUrl);
      const pathParts = url.pathname.split('/');
      const siteIndex = pathParts.indexOf('sites');

      if (siteIndex === -1) {
        this.logger.warn(`Could not parse site from URL: ${document.webUrl}`);
        return '';
      }

      const siteName = pathParts[siteIndex + 1];
      const pageName = pathParts[pathParts.length - 1];

      // Get page content via Graph API
      const siteId = await this.getSiteId(url.origin, siteName);
      if (!siteId) return '';

      // Try to get page content
      const pageContent = await this.getPageContent(siteId, pageName);

      this.logger.debug(`Extracted ${pageContent.length} characters from ASPX: ${document.title}`);

      return this.cleanText(pageContent);
    } catch (error) {
      this.logger.error(`Failed to extract ASPX content: ${document.title}`, error);
      return '';
    }
  }

  /**
   * Get SharePoint site ID from host and site name.
   */
  private async getSiteId(host: string, siteName: string): Promise<string | null> {
    try {
      const hostName = new URL(host).hostname;
      const site = await this.graphClient.api(`/sites/${hostName}:/sites/${siteName}`).get();
      return site.id;
    } catch (error) {
      this.logger.error(`Failed to get site ID for ${siteName}`, error);
      return null;
    }
  }

  /**
   * Get page content from SharePoint.
   */
  private async getPageContent(siteId: string, pageName: string): Promise<string> {
    try {
      // Get the page
      const pages = await this.graphClient
        .api(`/sites/${siteId}/pages`)
        .filter(`name eq '${pageName}'`)
        .select('id,title,webParts')
        .expand('webParts')
        .get();

      if (!pages.value || pages.value.length === 0) {
        return '';
      }

      const page = pages.value[0];
      const textParts: string[] = [];

      // Add title
      if (page.title) {
        textParts.push(page.title);
      }

      // Extract text from web parts
      if (page.webParts) {
        for (const webPart of page.webParts) {
          const text = this.extractTextFromWebPart(webPart);
          if (text) {
            textParts.push(text);
          }
        }
      }

      return textParts.join('\n\n');
    } catch (error) {
      this.logger.error(`Failed to get page content for ${pageName}`, error);
      // Fallback: try to get page via direct file content
      return await this.getPageFallback(siteId, pageName);
    }
  }

  /**
   * Fallback method to get page content when webParts API fails.
   */
  private async getPageFallback(siteId: string, pageName: string): Promise<string> {
    try {
      // Try to get the file content directly
      const driveItem = await this.graphClient
        .api(`/sites/${siteId}/drive/root:/SitePages/${pageName}`)
        .get();

      if (driveItem && driveItem.id) {
        const content = await this.graphClient
          .api(`/sites/${siteId}/drive/items/${driveItem.id}/content`)
          .get();

        // Parse HTML content
        return this.extractTextFromHtml(content.toString());
      }
    } catch (error) {
      this.logger.debug(`Fallback also failed for ${pageName}`, error);
    }

    return '';
  }

  /**
   * Extract text content from a SharePoint web part.
   */
  private extractTextFromWebPart(webPart: any): string {
    if (!webPart) return '';

    // Handle text web parts
    if (webPart.innerHtml) {
      return this.extractTextFromHtml(webPart.innerHtml);
    }

    // Handle data-driven web parts
    if (webPart.data?.properties?.text) {
      return this.extractTextFromHtml(webPart.data.properties.text);
    }

    return '';
  }

  /**
   * Extract plain text from HTML content.
   */
  private extractTextFromHtml(html: string): string {
    if (!html) return '';

    // Remove script and style tags
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Replace block elements with newlines
    text = text.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');

    // Remove remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    return this.cleanText(text);
  }

  /**
   * Download file content from SharePoint via Graph API.
   */
  private async downloadFileContent(document: KnowledgeDocument): Promise<ArrayBuffer | null> {
    try {
      let downloadUrl: string;

      if (document.driveId && document.driveItemId) {
        // Use drive path if available
        downloadUrl = `/drives/${document.driveId}/items/${document.driveItemId}/content`;
      } else {
        // Fallback to webUrl-based approach
        const url = new URL(document.webUrl);
        const hostName = url.hostname;
        const encodedPath = encodeURIComponent(url.pathname);
        downloadUrl = `/sites/${hostName}:${decodeURIComponent(encodedPath)}:/content`;
      }
      //this.logger.debug(`downloadUrl: ${downloadUrl}`);
      const response = await this.graphClient
        .api(downloadUrl)
        .responseType('arraybuffer' as any)
        .get();
      //this.logger.debug(response);
      // Handle different response types
      if (response instanceof ArrayBuffer) {
        //this.logger.debug('ArrayBuffer');
        return response;
      } else if (Buffer.isBuffer(response)) {
        //this.logger.debug('Buffer.isBuffer');
        const buffer = response.buffer;
        const start = response.byteOffset;
        const length = response.byteLength;

        // SharedArrayBuffer needs to be copied to a regular ArrayBuffer
        if (buffer instanceof SharedArrayBuffer) {
          const arrayBuffer = new ArrayBuffer(length);
          new Uint8Array(arrayBuffer).set(new Uint8Array(buffer, start, length));
          return arrayBuffer;
        }

        return buffer.slice(start, start + length);
      } else if (typeof response === 'string') {
        //this.logger.debug('string');
        return new TextEncoder().encode(response).buffer;
      }

      this.logger.debug(`unknown response type`);
      return null;
    } catch (error) {
      this.logger.error(`Failed to download file content for ${document.title}`, error);
      return null;
    }
  }

  /**
   * Clean and normalize extracted text.
   */
  private cleanText(text: string): string {
    return (
      text
        // Normalize whitespace
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Replace multiple spaces with single space
        .replace(/[ \t]+/g, ' ')
        // Replace multiple newlines with double newline
        .replace(/\n{3,}/g, '\n\n')
        // Trim lines
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        // Final trim
        .trim()
    );
  }
}
