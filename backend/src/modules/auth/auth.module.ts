import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../../config/env';
import { TenantContextFactory } from '../../tenancy/tenant-context.factory';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: env().JWT_ACCESS_SECRET,
        signOptions: { expiresIn: env().JWT_ACCESS_TTL as `${number}m` },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TenantContextFactory],
  exports: [AuthService, TenantContextFactory],
})
export class AuthModule {}
