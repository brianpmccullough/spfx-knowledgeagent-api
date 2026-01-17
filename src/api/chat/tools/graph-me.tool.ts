import { Tool } from '@langchain/core/tools';
import { Client } from '@microsoft/microsoft-graph-client';
import { MeService } from '../../me/me.service';

export class GraphMeTool extends Tool {
  name = 'get_current_user';
  description =
    'Get details about the current user including job title, department, company, location, manager, and contact information. Use this when the user asks about themselves, their role, their manager, or their profile.  For example when specific company, department or location information is needed.';

  private graphClient: Client;
  private meService: MeService;

  constructor(graphClient: Client, meService: MeService) {
    super();
    this.graphClient = graphClient;
    this.meService = meService;
  }

  async _call(): Promise<string> {
    try {
      const profile = await this.meService.getProfile(this.graphClient);
      return JSON.stringify(profile, null, 2);
    } catch (error) {
      return `Failed to get user details: ${error.message}`;
    }
  }
}
