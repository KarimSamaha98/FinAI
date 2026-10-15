import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { TransactionsModule } from '../transactions/transactions.module.js'
import { FxSyncController } from './fx-sync.controller.js'
import { FxSyncService } from './fx-sync.service.js'

@Module({
  imports: [AuthModule, TransactionsModule],
  controllers: [FxSyncController],
  providers: [FxSyncService],
})
export class FxSyncModule {}
