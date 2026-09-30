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
- Text→Image uses Replicate via the connector gateway (providers.server.ts REPLICATE_IMAGE_MODELS); outputs copied to private 'generations' bucket with 1-year signed URLs because Replicate URLs expire; failed jobs refund via service-role refund_credit_split.

- Generation rows are written only by the server (service role); users have read/delete only — prevents forged results/is_demo flags.
- check_generation_allowed RPC enforces daily per-kind limits (app_settings.credits.daily_image_limit/daily_video_limit) and one running job per user; staff bypass.
