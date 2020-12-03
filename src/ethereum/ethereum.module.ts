import { Module } from '@nestjs/common';
import { EthereumService } from './ethereum.service';
import { AppConfigModule } from 'src/config/config.module';

@Module({
  imports: [AppConfigModule],
  providers: [EthereumService],
  exports: [EthereumService],
})
export class EthereumModule {}
