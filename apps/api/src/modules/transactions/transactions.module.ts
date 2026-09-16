import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { ReportingModule } from '../reporting/reporting.module.js'
import { TransactionsController } from './transactions.controller.js'
import { TransactionsService } from './transactions.service.js'

@Module({
  imports: [AuthModule, ReportingModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
