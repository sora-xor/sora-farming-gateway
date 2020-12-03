import { Module } from '@nestjs/common';
import { PoolsService } from './pools.service';

const PoolsServiceProvider = {
  provide: PoolsService,
  useClass: PoolsService,
};

@Module({
  imports: [],
  providers: [PoolsServiceProvider],
  controllers: [],
  exports: [PoolsServiceProvider],
})
export class PoolsModule {}
