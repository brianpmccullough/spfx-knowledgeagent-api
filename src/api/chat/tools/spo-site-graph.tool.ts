import { Tool } from '@langchain/core/tools';
import { Client } from '@microsoft/microsoft-graph-client';

export class GraphSiteTool extends Tool {
  name = 'get_current_site';
  description =
    'Get details about the current site including name, description, url, and id for use in other tools. Use this when the user asks about the site they are on.  For example if a siteid is needed for other tool calls.';

  constructor(
    private graphClient: Client,
    private siteUrl: string,
  ) {
    super();
  }

  async _call(): Promise<string> {
    try {
      const url = new URL(this.siteUrl);
      const pathParts = url.pathname.split('/');
      const sitesIndex = pathParts.indexOf('sites');

      if (sitesIndex === -1) {
        return 'Invalid SharePoint URL - could not find site path';
      }

      const sitePath = pathParts.slice(0, sitesIndex + 2).join('/');

      const site = await this.graphClient.api(`/sites/${url.hostname}:${sitePath}`).get();
      return JSON.stringify(site, null, 2);
    } catch (error) {
      console.log(`Site tool failed: ${error.message}`);
      return `Site failed: ${error.message}`;
    }
  }
}
