import { z } from "zod";

export const CategorySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  name: z.string().min(1).max(60),
  createdAt: z.string().datetime(),
});
export type Category = z.infer<typeof CategorySchema>;

export const CreateCategoryInputSchema = CategorySchema.pick({ name: true });
export type CreateCategoryInput = z.infer<typeof CreateCategoryInputSchema>;

export const RenameCategoryInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
});
export type RenameCategoryInput = z.infer<typeof RenameCategoryInputSchema>;
