import { Tool } from '@langchain/core/tools';
import { Client } from '@microsoft/microsoft-graph-client';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';

export class GraphFileReaderTool extends Tool {
  name = 'read_file_content';
  description =
    'Read the content of a SharePoint document (.doc, .docx, or .pdf) or page (.aspx). Use this when you need to answer questions about what a specific document contains. Input must be the full webUrl of the document.';

  private graphClient: Client;

  constructor(graphClient: Client) {
    super();
    this.graphClient = graphClient;
  }

  async _call(webUrl: string): Promise<string> {
    try {
      const url = new URL(webUrl);
      const pathParts = url.pathname.split('/');
      const sitesIndex = pathParts.indexOf('sites');

      if (sitesIndex === -1) {
        return 'Invalid SharePoint URL - could not find site path';
      }

      const sitePath = pathParts.slice(0, sitesIndex + 2).join('/');

      // Get site ID
      const site = await this.graphClient
        .api(`/sites/${url.hostname}:${sitePath}`)
        .get();

      // Determine file type from URL
      const extension = this.getExtension(webUrl);

      if (extension === 'aspx') {
        return await this.readSharePointPage(site.id, webUrl, pathParts);
      }

      // Use search to find the file by path
      const searchResponse = await this.graphClient.api('/search/query').post({
        requests: [
          {
            entityTypes: ['driveItem'],
            query: { queryString: `path:"${webUrl}"` },
            from: 0,
            size: 1,
          },
        ],
      });

      const hits = searchResponse.value?.[0]?.hitsContainers?.[0]?.hits;
      if (!hits || hits.length === 0) {
        return `File not found: ${webUrl}`;
      }
      const driveItem = hits[0].resource;
      console.log(driveItem);

      if (extension === 'pdf') {
        return await this.readPdf(site.id, driveItem);
      }

      if (['docx', 'doc'].includes(extension)) {
        return await this.readWord(site.id, driveItem);
      }

      return `Unsupported file type: ${extension}`;
    } catch (error) {
      return `Failed to read file: ${error.message}`;
    }
  }

  private getExtension(webUrl: string): string {
    const path = new URL(webUrl).pathname.toLowerCase();
    const match = path.match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  }

  private async readPdf(siteId: string, driveItem: any): Promise<string> {
    try {
      const response = await this.graphClient
        .api(`/sites/${siteId}/drive/items/${driveItem.id}/content`)
        .responseType('arraybuffer' as any)
        .get();

      const uint8Array = new Uint8Array(response);
      const pdfDoc = await getDocument({ data: uint8Array }).promise;

      let text = '';
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(' ');
        text += pageText + '\n';
      }

      return this.formatContent(driveItem.name, text);
    } catch (error) {
      console.log(`Failed to read PDF: ${error.message}`);
      return `Failed to read PDF: ${error.message}`;
    }
  }

  private async readWord(siteId: string, driveItem: any): Promise<string> {
    try {
      const response = await this.graphClient
        .api(`/sites/${siteId}/drive/items/${driveItem.id}/content`)
        .responseType('arraybuffer' as any)
        .get();

      const buffer = Buffer.from(response);
      const result = await mammoth.extractRawText({ buffer });

      return this.formatContent(driveItem.name, result.value);
    } catch (error) {
      console.log(`Failed to read Word document: ${error.message}`);
      return `Failed to read Word document: ${error.message}`;
    }
  }

  private async readSharePointPage(
    siteId: string,
    webUrl: string,
    pathParts: string[],
  ): Promise<string> {
    try {
      // Extract page name from URL
      const pageName = pathParts[pathParts.length - 1].replace('.aspx', '');

      const page = await this.graphClient
        .api(`/sites/${siteId}/pages/${pageName}`)
        .expand('canvasLayout')
        .get();

      let content = '';

      if (page.canvasLayout?.horizontalSections) {
        for (const section of page.canvasLayout.horizontalSections) {
          for (const column of section.columns || []) {
            for (const webpart of column.webparts || []) {
              if (webpart.innerHtml) {
                const text = this.stripHtml(webpart.innerHtml);
                if (text) content += text + '\n\n';
              }
            }
          }
        }
      }

      return this.formatContent(
        page.title || pageName,
        content || 'No text content found on page.',
      );
    } catch (error) {
      console.log(`Failed to read SharePoint page: ${error.message}`);
      return `Failed to read SharePoint page: ${error.message}`;
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatContent(
    name: string,
    content: string,
    maxLength = 8000,
  ): string {
    const trimmedContent =
      content.length > maxLength
        ? content.substring(0, maxLength) + '\n\n[Content truncated]'
        : content;

    return `Document: ${name}\n\nContent:\n${trimmedContent}`;
  }
}
