<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep customer spreadsheet parsing/export in a client-safe `src/lib/export/` module so admin screens share one field mapping and validation.
- Prefix return-trip select values with `return:` so independent outbound/return IDs filter by their respective booking fields without collisions.
- Store the return-seat company share in `settlement_reference.return_trip_company_profit_rate` and use it only for bookings with `return_trip_id` or `trip_mode = 'return'`, so regular commissions remain unchanged.
