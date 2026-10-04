import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { CreateAccountInputSchema, UpdateAccountInputSchema } from 'shared-types'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { AccountsService } from './accounts.service.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

@Controller('accounts')
@UseGuards(SupabaseAuthGuard)
export class AccountsController {
  constructor(@Inject(AccountsService) private readonly accountsService: AccountsService) {}

  // Both static routes must stay declared above @Get(':id') so the param
  // route can't capture them.

  @Get('net-worth')
  netWorth(@CurrentUserId() userId: string) {
    return this.accountsService.netWorth(userId)
  }

  @Get('net-worth-series')
  netWorthSeries(@CurrentUserId() userId: string, @Query('from') from?: string, @Query('to') to?: string) {
    if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
      throw new BadRequestException('from and to must be dates (yyyy-MM-dd) with from <= to')
    }
    return this.accountsService.netWorthSeries(userId, from, to)
  }

  @Get()
  list(@CurrentUserId() userId: string, @Query('includeArchived') includeArchived?: string) {
    return this.accountsService.list(userId, { includeArchived: includeArchived === 'true' })
  }

  @Get(':id')
  getById(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.accountsService.getById(userId, id)
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const input = CreateAccountInputSchema.parse(body)
    return this.accountsService.create(userId, input)
  }

  @Patch(':id')
  update(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    const { id: _id, ...input } = UpdateAccountInputSchema.parse({ ...(body as object), id })
    return this.accountsService.update(userId, id, input)
  }

  @Post(':id/card-image')
  async uploadCardImage(@CurrentUserId() userId: string, @Param('id') id: string, @Req() req: FastifyRequest) {
    const file = await req.file()
    if (!file) {
      throw new BadRequestException('No file was uploaded')
    }
    const buffer = await file.toBuffer()
    return this.accountsService.uploadCardImage(userId, id, { buffer, mimetype: file.mimetype })
  }

  @Delete(':id/card-image')
  removeCardImage(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.accountsService.removeCardImage(userId, id)
  }

  @Delete(':id')
  delete(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.accountsService.delete(userId, id)
  }
}
