import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { ReportingController } from './reporting.controller.js'
import { ReportingQueryService } from './reporting-query.service.js'
import { ChartAggregationService } from './chart-aggregation.service.js'

@Module({
  imports: [AuthModule],
  controllers: [ReportingController],
  providers: [ReportingQueryService, ChartAggregationService],
  exports: [ReportingQueryService],
})
export class ReportingModule {}
