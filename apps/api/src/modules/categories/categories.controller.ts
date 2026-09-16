import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { CreateCategoryInputSchema, RenameCategoryInputSchema } from 'shared-types'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js'
import { CurrentUserId } from '../auth/current-user-id.decorator.js'
import { CategoriesService } from './categories.service.js'

@Controller('categories')
@UseGuards(SupabaseAuthGuard)
export class CategoriesController {
  constructor(@Inject(CategoriesService) private readonly categoriesService: CategoriesService) {}

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.categoriesService.list(userId)
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const input = CreateCategoryInputSchema.parse(body)
    return this.categoriesService.create(userId, input)
  }

  @Patch(':id')
  rename(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    const input = RenameCategoryInputSchema.parse({ ...(body as object), id })
    return this.categoriesService.rename(userId, input.id, input.name)
  }

  @Delete(':id')
  delete(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.categoriesService.delete(userId, id)
  }
}
