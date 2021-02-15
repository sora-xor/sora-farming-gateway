import * as Joi from '@hapi/joi';
import { Module } from '@nestjs/common';
import { AppConfigService, configFactory } from './config.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configFactory],
      validationSchema: Joi.object({
        APP_DATABASE: Joi.string(),
        APP_ETHEREUM: Joi.string().uri(),
        APP_ETHEREUM_START_BLOCK: Joi.number().optional(),
        APP_ETHEREUM_FORMULA_UPDATE_BLOCK: Joi.number().optional(),
        APP_HOST: Joi.string()
          .ip()
          .default('0.0.0.0'),
        APP_PORT: Joi.number()
          .port()
          .default(9000),
      }),
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
