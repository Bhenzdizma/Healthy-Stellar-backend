import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpIdempotencyEntity } from './idempotency.entity';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([HttpIdempotencyEntity])],
  providers: [IdempotencyInterceptor],
  exports: [IdempotencyInterceptor],
})
export class IdempotencyModule {}
