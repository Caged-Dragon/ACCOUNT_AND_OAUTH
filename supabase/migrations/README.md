The schema is already applied to the CAGED_DRAGON project (gbeurqibcfvquacasofq) as migrations
`caged_dragon_accounts_foundation` and `caged_dragon_prefix_all_objects`. To keep it in this repo:

    supabase link --project-ref gbeurqibcfvquacasofq
    supabase db pull

Naming rule for everything in the database: prefix `account_` (account features) or `oauth_` (protection against approved-app tokens).
