ALTER TABLE public.profiles
  ADD COLUMN adult_confirmed_at timestamptz,
  ADD COLUMN mature_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.generations ADD COLUMN is_mature boolean NOT NULL DEFAULT false;

-- Users may only edit their display name directly; credits/age/mature flags are server-controlled.
REVOKE UPDATE, INSERT ON public.profiles FROM authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;
GRANT INSERT (id, email, display_name) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_adult()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.profiles SET adult_confirmed_at = COALESCE(adult_confirmed_at, now()) WHERE id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.set_mature_mode(_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_confirmed timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT adult_confirmed_at INTO v_confirmed FROM public.profiles WHERE id = auth.uid();
  IF _enabled AND v_confirmed IS NULL THEN RAISE EXCEPTION 'age confirmation required'; END IF;
  UPDATE public.profiles SET mature_enabled = _enabled WHERE id = auth.uid();
  RETURN _enabled;
END $$;

REVOKE EXECUTE ON FUNCTION public.confirm_adult() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_mature_mode(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_adult() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_mature_mode(boolean) TO authenticated;