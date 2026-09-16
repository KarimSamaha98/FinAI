import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { FxRatesController } from './fx-rates.controller.js'
import { FxRatesService } from './fx-rates.service.js'

@Module({
  imports: [AuthModule],
  controllers: [FxRatesController],
  providers: [FxRatesService],
  exports: [FxRatesService],
})
export class FxRatesModule {}
