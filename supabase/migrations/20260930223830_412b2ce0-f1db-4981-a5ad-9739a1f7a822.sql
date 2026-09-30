-- Spend protection settings (defaults merged into existing credits setting)
UPDATE public.app_settings
SET value = jsonb_build_object('daily_image_limit', 20, 'daily_video_limit', 5, 'image_cost', 1, 'video_cost', 3, 'daily_free_credits', 5) || value,
    updated_at = now()
WHERE key = 'credits';

-- Server-side generation guard: daily limits + one running job at a time. Staff bypass.
CREATE OR REPLACE FUNCTION public.check_generation_allowed(_kind text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  v_limit int; v_count int; v_running int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _kind NOT IN ('image','video') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
  IF private.is_staff(uid) THEN RETURN jsonb_build_object('ok', true, 'unlimited', true); END IF;

  SELECT count(*) INTO v_running FROM public.generations
   WHERE user_id = uid AND status IN ('queued','running')
     AND created_at > now() - interval '20 minutes';
  IF v_running > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'job_running');
  END IF;

  SELECT (value->>CASE WHEN _kind = 'image' THEN 'daily_image_limit' ELSE 'daily_video_limit' END)::int
    INTO v_limit FROM public.app_settings WHERE key = 'credits';
  v_limit := COALESCE(v_limit, CASE WHEN _kind = 'image' THEN 20 ELSE 5 END);

  SELECT count(*) INTO v_count FROM public.generations
   WHERE user_id = uid AND kind = _kind AND status <> 'failed' AND created_at >= current_date;
  IF v_count >= v_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_limit', 'limit', v_limit, 'used', v_count);
  END IF;
  RETURN jsonb_build_object('ok', true, 'limit', v_limit, 'used', v_count);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_generation_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_generation_allowed(text) TO authenticated;

-- Users must not forge results (status/outputs/is_demo). Writes now happen only on the server.
DROP POLICY IF EXISTS "insert own generations" ON public.generations;
DROP POLICY IF EXISTS "update own generations" ON public.generations;
REVOKE INSERT, UPDATE ON public.generations FROM authenticated, anon;

-- Refund helpers are server-only
REVOKE EXECUTE ON FUNCTION public.refund_credit_split(uuid,int,int,date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_credits(uuid,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credit_split(uuid,int,int,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid,int) TO service_role;