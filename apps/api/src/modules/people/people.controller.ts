import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { CreateContactInputSchema, SettleUpInputSchema, TransactionSplitInputSchema, UpdateContactInputSchema } from 'shared-types'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { PeopleService } from './people.service.js'

@Controller('contacts')
@UseGuards(SupabaseAuthGuard)
export class ContactsController {
  constructor(@Inject(PeopleService) private readonly people: PeopleService) {}

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.people.listContacts(userId)
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: unknown) {
    return this.people.createContact(userId, CreateContactInputSchema.parse(body))
  }

  @Patch(':id')
  update(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.people.updateContact(userId, id, UpdateContactInputSchema.parse(body))
  }

  @Delete(':id')
  delete(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.people.deleteContact(userId, id)
  }
}

@Controller('people')
@UseGuards(SupabaseAuthGuard)
export class PeopleController {
  constructor(@Inject(PeopleService) private readonly people: PeopleService) {}

  /** Everyone with activity and their balance (Home's People table). */
  @Get()
  list(@CurrentUserId() userId: string) {
    return this.people.people(userId)
  }

  /** How a transaction is shared with people (null split when it isn't). */
  @Get('splits/:transactionId')
  split(@CurrentUserId() userId: string, @Param('transactionId') transactionId: string) {
    return this.people.byTransaction(userId, transactionId)
  }

  @Put('splits/:transactionId')
  setSplit(@CurrentUserId() userId: string, @Param('transactionId') transactionId: string, @Body() body: unknown) {
    return this.people.setSplit(userId, transactionId, TransactionSplitInputSchema.parse(body))
  }

  @Delete('splits/:transactionId')
  deleteSplit(@CurrentUserId() userId: string, @Param('transactionId') transactionId: string) {
    return this.people.deleteSplit(userId, transactionId)
  }

  @Delete('entries/:entryId')
  deleteEntry(@CurrentUserId() userId: string, @Param('entryId') entryId: string) {
    return this.people.deleteEntry(userId, entryId)
  }

  @Get(':contactId')
  person(@CurrentUserId() userId: string, @Param('contactId') contactId: string) {
    return this.people.person(userId, contactId)
  }

  /** Transactions that could settle up with this person ("Link a transaction"). */
  @Get(':contactId/settle-up/candidates')
  settleUpCandidates(@CurrentUserId() userId: string, @Param('contactId') contactId: string) {
    return this.people.settleUpCandidates(userId, contactId)
  }

  @Post(':contactId/settle-up')
  settleUp(@CurrentUserId() userId: string, @Param('contactId') contactId: string, @Body() body: unknown) {
    return this.people.settleUp(userId, contactId, SettleUpInputSchema.parse(body))
  }
}
