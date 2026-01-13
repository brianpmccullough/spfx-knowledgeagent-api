import { Controller, Get } from '@nestjs/common';

@Controller('api/me')
export class MeController {
  @Get()
  getMe() {
    return {
      firstName: 'Brian',
      lastName: 'McCullough',
      tenant: process.env.AD_TENANT_NAME,
      clientid: process.env.AD_CLIENT_ID,
    };
  }
}
