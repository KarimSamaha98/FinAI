-- Every category gets its own icon; the "tag" glyph is reserved for
-- Uncategorized (and categories with no icon).

-- "Other" moves from the tag to a "more" (three dots) icon, on the global
-- template rows (copied to new users at signup) and every user's copy.
update categories
set icon = 'dots'
where lower(name) = 'other' and (icon is null or icon = 'tag');

-- The demo dataset's custom categories were created without icons.
update categories set icon = 'coffee' where user_id is not null and lower(name) = 'coffee' and icon is null;
update categories set icon = 'laptop' where user_id is not null and lower(name) = 'gadgets' and icon is null;
