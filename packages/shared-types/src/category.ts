import { z } from "zod";

/**
 * The pickable category icon set. Keys are stored on the category row and
 * rendered by the web app's registry (components/categoryIcons.tsx). Adding an
 * icon means adding it here and to that registry — TS keeps them in sync.
 */
export const CategoryIconKeySchema = z.enum([
  "cart",
  "utensils",
  "coffee",
  "home",
  "bolt",
  "droplet",
  "flame",
  "wifi",
  "phone",
  "car",
  "fuel",
  "bus",
  "plane",
  "bag",
  "shirt",
  "heart",
  "pill",
  "dumbbell",
  "shield",
  "film",
  "music",
  "gamepad",
  "book",
  "graduation-cap",
  "wallet",
  "banknote",
  "transfer",
  "repeat",
  "receipt",
  "trending-up",
  "piggy-bank",
  "gift",
  "paw",
  "baby",
  "hand-heart",
  "scissors",
  "sparkles",
  "tool",
  "laundry",
  "laptop",
  "dots",
  "tag",
]);
export type CategoryIconKey = z.infer<typeof CategoryIconKeySchema>;

export const CategorySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  name: z.string().min(1).max(60),
  // Null falls back to the "tag" glyph in the UI.
  icon: CategoryIconKeySchema.nullable(),
  // Soft-deleted categories are hidden from pickers but still resolve by id
  // for the historical transactions that used them.
  isArchived: z.boolean(),
  // The user's chosen display order (Settings → Categories); lists come back sorted by it.
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
});
export type Category = z.infer<typeof CategorySchema>;

/** Every active category id, in the order the user arranged them. */
export const ReorderCategoriesInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});
export type ReorderCategoriesInput = z.infer<typeof ReorderCategoriesInputSchema>;

export const CreateCategoryInputSchema = CategorySchema.pick({ name: true }).extend({
  icon: CategoryIconKeySchema.nullable().optional(),
});
export type CreateCategoryInput = z.infer<typeof CreateCategoryInputSchema>;

export const RenameCategoryInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  // Omitted = leave unchanged; null = clear (fall back to the default glyph).
  icon: CategoryIconKeySchema.nullable().optional(),
});
export type RenameCategoryInput = z.infer<typeof RenameCategoryInputSchema>;
