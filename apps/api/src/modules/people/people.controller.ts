import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { CreateContactInputSchema, SettleUpInputSchema, UpdateContactInputSchema } from 'shared-types'
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

  /** Everyone with an open balance (Home's People card). */
  @Get()
  list(@CurrentUserId() userId: string) {
    return this.people.people(userId)
  }

  @Get(':contactId')
  person(@CurrentUserId() userId: string, @Param('contactId') contactId: string) {
    return this.people.person(userId, contactId)
  }

  /** Transactions that could be this person's payment ("Match a payment"). */
  @Get(':contactId/settle-up/candidates')
  settleUpCandidates(@CurrentUserId() userId: string, @Param('contactId') contactId: string) {
    return this.people.settleUpCandidates(userId, contactId)
  }

  @Post(':contactId/settle-up')
  settleUp(@CurrentUserId() userId: string, @Param('contactId') contactId: string, @Body() body: unknown) {
    return this.people.settleUp(userId, contactId, SettleUpInputSchema.parse(body))
  }

  /** Forgives what's still expected from (or owed to) this person in one group. */
  @Post(':contactId/groups/:groupId/forgive')
  forgive(@CurrentUserId() userId: string, @Param('contactId') contactId: string, @Param('groupId') groupId: string) {
    return this.people.forgiveGroup(userId, contactId, groupId)
  }

  @Delete(':contactId/groups/:groupId/forgive')
  unforgive(@CurrentUserId() userId: string, @Param('contactId') contactId: string, @Param('groupId') groupId: string) {
    return this.people.unforgiveGroup(userId, contactId, groupId)
  }
}
