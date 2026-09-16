import { Body, Controller, Get, Inject, Patch, UseGuards } from '@nestjs/common'
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
}
