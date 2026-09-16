import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { ImportProfilesController } from './import-profiles.controller.js'
import { ImportProfilesService } from './import-profiles.service.js'

@Module({
  imports: [AuthModule],
  controllers: [ImportProfilesController],
  providers: [ImportProfilesService],
})
export class ImportProfilesModule {}
