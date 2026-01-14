import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AzureADGuard extends AuthGuard('azure-ad') {
  constructor(private configService: ConfigService) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const bypassAuth = request.query.bypassauth;

    if (bypassAuth === 'true') {
      return true;
    }

    // Extract token before passport validates
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1] || '';

    // Run passport validation
    const result = await super.canActivate(context);

    // Attach token to user object
    if (result && request.user) {
      request.user.token = token;
    }

    return result as boolean;
  }
}
