import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { ImportRunsController } from './import-runs.controller.js'
import { ImportRunsService } from './import-runs.service.js'

@Module({
  imports: [AuthModule],
  controllers: [ImportRunsController],
  providers: [ImportRunsService],
})
export class ImportRunsModule {}
