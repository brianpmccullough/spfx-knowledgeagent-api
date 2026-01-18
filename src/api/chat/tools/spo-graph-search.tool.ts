import { Tool } from '@langchain/core/tools';
import { Client } from '@microsoft/microsoft-graph-client';

export class GraphSearchTool extends Tool {
  name = 'sharepoint_search';
  description = `Search SharePoint Online for documents and pages. 
    Use this when the user asks about, or is intending to, find about finding content, documents, or information in SharePoint (Online).
    The supplied query should be a few words about the overall theme and NOT include context content such as user location or company.
    `;

  constructor(
    private graphClient: Client,
    private siteUrl: string | null,
  ) {
    super();
  }

  async _call(query: string): Promise<string> {
    try {
      console.log(`search tool: '${query}'`);
      let searchQuery = this.siteUrl ? `${query} site:${this.siteUrl}` : query;

      searchQuery += ' AND (IsDocument:true OR FileType:aspx)';

      const response = await this.graphClient.api('/search/query').post({
        requests: [
          {
            entityTypes: ['driveItem', 'listItem'],
            query: { queryString: searchQuery },
            from: 0,
            size: 10,
          },
        ],
      });

      const hits = response.value?.[0]?.hitsContainers?.[0]?.hits || [];

      if (hits.length === 0) {
        return 'No results found.';
      }

      const results = hits.map((hit: any) => ({
        name: hit.resource.name,
        summary: hit.summary || '',
        webUrl: hit.resource.webUrl,
        driveId: hit.resource.parentReference?.driveId,
        itemId: hit.resource.id,
        lastModified: hit.resource.lastModifiedDateTime,
      }));

      console.log('Search results: ', results);
      return JSON.stringify(results, null, 2);
    } catch (error) {
      console.log(`Search tool failed: ${error.message}`);
      return `Search failed: ${error.message}`;
    }
  }
}
