import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { Client } from '@microsoft/microsoft-graph-client';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';

const FileReaderSchema = z.object({
  driveId: z.string().describe('The drive ID from the search results'),
  itemId: z.string().describe('The item ID from the search results'),
  name: z.string().describe('The filename from the search results'),
});

export class GraphFileReaderTool extends StructuredTool {
  name = 'read_file_content';
  description = `Read the content of a SharePoint document (.doc, .docx, or .pdf).
    Use this when you need to answer questions about what a specific document contains.
    Pass the driveId, itemId, and name from the search results.`;
  schema = FileReaderSchema;

  private graphClient: Client;

  constructor(graphClient: Client) {
    super();
    this.graphClient = graphClient;
  }

  async _call(input: z.infer<typeof FileReaderSchema>): Promise<string> {
    try {
      console.log('File reader input:', input);

      const { driveId, itemId, name } = input;

      const extension = this.getExtension(name);

      if (extension === 'pdf') {
        return await this.readPdf(driveId, itemId, name);
      }

      if (['docx', 'doc'].includes(extension)) {
        return await this.readWord(driveId, itemId, name);
      }

      return `Unsupported file type: ${extension}`;
    } catch (error) {
      return `Failed to read file: ${error.message}`;
    }
  }

  private getExtension(filename: string): string {
    const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  }

  private async readPdf(driveId: string, itemId: string, name: string): Promise<string> {
    try {
      const response = await this.graphClient
        .api(`/drives/${driveId}/items/${itemId}/content`)
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

      return this.formatContent(name, text);
    } catch (error) {
      console.log(`Failed to read PDF: ${error.message}`);
      return `Failed to read PDF: ${error.message}`;
    }
  }

  private async readWord(driveId: string, itemId: string, name: string): Promise<string> {
    try {
      const response = await this.graphClient
        .api(`/drives/${driveId}/items/${itemId}/content`)
        .responseType('arraybuffer' as any)
        .get();

      const buffer = Buffer.from(response);
      const result = await mammoth.extractRawText({ buffer });

      return this.formatContent(name, result.value);
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

  private formatContent(name: string, content: string, maxLength = 8000): string {
    const trimmedContent =
      content.length > maxLength
        ? content.substring(0, maxLength) + '\n\n[Content truncated]'
        : content;

    return `Document: ${name}\n\nContent:\n${trimmedContent}`;
  }
}
