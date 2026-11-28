import { Module } from '@nestjs/common'
import { ContactsController, PeopleController } from './people.controller.js'
import { PeopleService } from './people.service.js'

// ExchangeRatesModule is global, so it isn't imported here.
@Module({
  controllers: [ContactsController, PeopleController],
  providers: [PeopleService],
})
export class PeopleModule {}
