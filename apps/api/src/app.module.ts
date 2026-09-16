import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { validateEnv } from './config/env.js'
import { HealthController } from './common/health.controller.js'
import { DbModule } from './db/db.module.js'
import { StorageModule } from './storage/storage.module.js'
import { AuthModule } from './modules/auth/auth.module.js'
import { UsersModule } from './modules/users/users.module.js'
import { CategoriesModule } from './modules/categories/categories.module.js'
import { AccountsModule } from './modules/accounts/accounts.module.js'
import { TransactionsModule } from './modules/transactions/transactions.module.js'
import { ImportProfilesModule } from './modules/import-profiles/import-profiles.module.js'
import { ImportRunsModule } from './modules/import-runs/import-runs.module.js'
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module.js'
import { MonthSplitModule } from './modules/month-split/month-split.module.js'
import { ReportingModule } from './modules/reporting/reporting.module.js'
import { FxRatesModule } from './modules/fx-rates/fx-rates.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DbModule,
    StorageModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    AccountsModule,
    TransactionsModule,
    ImportProfilesModule,
    ImportRunsModule,
    ReconciliationModule,
    MonthSplitModule,
    ReportingModule,
    FxRatesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
