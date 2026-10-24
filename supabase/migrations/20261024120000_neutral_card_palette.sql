-- Neutral card finishes. The default palette moves from bright UI colours to
-- the tones real bank cards use (see CARD_COLOR_PALETTE in shared-types).
-- Accounts still on an old default colour move to its nearest new finish;
-- custom colours people picked themselves are left alone.

alter table accounts alter column card_color set default '#1c1c1e';

update accounts
set card_color = case card_color
  when '#4f46e5' then '#1e3a5f' -- indigo  → navy
  when '#0f766e' then '#2f4858' -- teal    → slate
  when '#be123c' then '#6b1d2a' -- rose    → maroon
  when '#1d4ed8' then '#1c1c1e' -- blue    → midnight black
  when '#b45309' then '#7a5c3a' -- amber   → bronze
  when '#7c3aed' then '#48484a' -- violet  → graphite
  when '#15803d' then '#1f4d3a' -- green   → forest
  when '#334155' then '#6e7781' -- slate   → platinum
end
where card_color in ('#4f46e5', '#0f766e', '#be123c', '#1d4ed8', '#b45309', '#7c3aed', '#15803d', '#334155');
