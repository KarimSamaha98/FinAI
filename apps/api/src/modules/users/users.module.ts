import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { TransactionsModule } from '../transactions/transactions.module.js'
import { UsersController } from './users.controller.js'
import { UsersService } from './users.service.js'

@Module({
  imports: [AuthModule, TransactionsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
