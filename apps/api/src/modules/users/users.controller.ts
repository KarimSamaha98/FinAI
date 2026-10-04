import { BadRequestException, Body, Controller, Get, Inject, Patch, Post, Req, UseGuards } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { UpdateProfileInputSchema } from 'shared-types'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { UsersService } from './users.service.js'

@Controller('users')
@UseGuards(SupabaseAuthGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUserId() userId: string) {
    return this.usersService.getProfile(userId)
  }

  @Patch('me')
  updateMe(@CurrentUserId() userId: string, @Body() body: unknown) {
    const input = UpdateProfileInputSchema.parse(body)
    return this.usersService.updateProfile(userId, input)
  }

  @Post('me/avatar')
  async uploadAvatar(@CurrentUserId() userId: string, @Req() req: FastifyRequest) {
    const file = await req.file()
    if (!file) {
      throw new BadRequestException('No file was uploaded')
    }
    const buffer = await file.toBuffer()
    return this.usersService.uploadAvatar(userId, { buffer, mimetype: file.mimetype })
  }
}
