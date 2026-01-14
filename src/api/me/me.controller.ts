import { Controller, Get, UseGuards } from '@nestjs/common';
import { MeService } from './me.service';
import { AzureADGuard } from 'src/auth/azure-ad.guard';
import { AuthenticatedUser } from 'src/auth/authenticateduser';
import { CurrentUser } from 'src/auth/user.decorator';

@Controller('api/me')
@UseGuards(AzureADGuard)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get()
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getMe(user.token);
  }
}
