import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BankConnectionsController } from './bank-connections.controller.js'
import { BankConnectionsService } from './bank-connections.service.js'

@Module({
  imports: [AuthModule],
  controllers: [BankConnectionsController],
  providers: [BankConnectionsService],
})
export class BankConnectionsModule {}
