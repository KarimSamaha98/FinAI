-- Remove 'e_banking' from the account type enum: an online banking account
-- is just a checking account (the Home screen already folded the two
-- together). Existing e_banking accounts migrate to 'checking' so no row is
-- left outside the enum before the CHECK constraint is replaced.

update accounts set type = 'checking' where type = 'e_banking';

alter table accounts drop constraint accounts_type_check;
alter table accounts add constraint accounts_type_check
  check (type in ('checking', 'credit', 'investment', 'cash', 'other'));
