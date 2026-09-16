import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { MonthSplitController } from './month-split.controller.js'
import { MonthSplitService } from './month-split.service.js'

@Module({
  imports: [AuthModule],
  controllers: [MonthSplitController],
  providers: [MonthSplitService],
  exports: [MonthSplitService],
})
export class MonthSplitModule {}
