import { Controller, Get } from '@nestjs/common';

@Controller('api/me')
export class MeController {
  @Get()
  getMe() {
    return {
      firstName: 'Brian',
      lastName: 'McCullough',
    };
  }
}
