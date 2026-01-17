import { Controller, Get, UseGuards } from '@nestjs/common';
import { AzureADGuard } from '../../auth/azure-ad.guard';
import { CurrentUser } from '../../auth/user.decorator';
import { AuthenticatedUser } from '../../auth/authenticateduser';
import { MeService } from './me.service';
import { OboGraphService } from '../shared-services/obo-graph.service';

@Controller('api/me')
@UseGuards(AzureADGuard)
export class MeController {
  constructor(
    private readonly meService: MeService,
    private readonly oboGraphService: OboGraphService,
  ) {}

  @Get()
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    const graphClient = await this.oboGraphService.getGraphClient(user.token);
    return this.meService.getProfile(graphClient);
  }
}
