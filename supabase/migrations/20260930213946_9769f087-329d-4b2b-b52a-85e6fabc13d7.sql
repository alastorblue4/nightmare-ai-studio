
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','antml_placeholder'::text::public.app_role));
$$;

-- correct definition (avoid placeholder)
CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','admin'));
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated, service_role;

-- recreate policies against private.is_staff
DROP POLICY "read own profile" ON public.profiles;
CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR private.is_staff(auth.uid()));

DROP POLICY "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.is_staff(auth.uid()));

DROP POLICY "public settings readable" ON public.app_settings;
CREATE POLICY "public settings readable" ON public.app_settings FOR SELECT TO anon, authenticated
  USING (is_public OR private.is_staff(auth.uid()));
DROP POLICY "staff manage settings" ON public.app_settings;
CREATE POLICY "staff manage settings" ON public.app_settings FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY "read own generations" ON public.generations;
CREATE POLICY "read own generations" ON public.generations FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.is_staff(auth.uid()));
DROP POLICY "update own generations" ON public.generations;
CREATE POLICY "update own generations" ON public.generations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR private.is_staff(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR private.is_staff(auth.uid()));
DROP POLICY "delete own generations" ON public.generations;
CREATE POLICY "delete own generations" ON public.generations FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR private.is_staff(auth.uid()));

DROP POLICY "read own usage" ON public.credit_usage;
CREATE POLICY "read own usage" ON public.credit_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.is_staff(auth.uid()));

DROP POLICY "read own or staff reports" ON public.reports;
CREATE POLICY "read own or staff reports" ON public.reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR private.is_staff(auth.uid()));
DROP POLICY "staff update reports" ON public.reports;
CREATE POLICY "staff update reports" ON public.reports FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- repoint remaining functions at the private helpers
CREATE OR REPLACE FUNCTION public.credit_status(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_free int; v_used int; v_purchased int; v_unlimited boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  IF _user_id <> auth.uid() AND NOT private.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT COALESCE((value->>'daily_free_credits')::int, 5) INTO v_free FROM public.app_settings WHERE key = 'credits';
  v_free := COALESCE(v_free, 5);
  SELECT COALESCE(credits_used, 0) INTO v_used FROM public.credit_usage WHERE user_id = _user_id AND usage_date = current_date;
  v_used := COALESCE(v_used, 0);
  SELECT COALESCE(purchased_credits, 0) INTO v_purchased FROM public.profiles WHERE id = _user_id;
  v_purchased := COALESCE(v_purchased, 0);
  v_unlimited := private.is_staff(_user_id);
  RETURN jsonb_build_object(
    'unlimited', v_unlimited,
    'daily_free', v_free,
    'used_today', v_used,
    'free_remaining', GREATEST(v_free - v_used, 0),
    'purchased_credits', v_purchased,
    'total_available', GREATEST(v_free - v_used, 0) + v_purchased
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_credits(_cost integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  v_free int; v_used int; v_purchased int; v_from_free int; v_from_purchased int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _cost < 0 THEN RAISE EXCEPTION 'Invalid cost'; END IF;
  IF private.is_staff(uid) THEN
    RETURN jsonb_build_object('ok', true, 'unlimited', true, 'charged', 0);
  END IF;
  SELECT COALESCE((value->>'daily_free_credits')::int, 5) INTO v_free FROM public.app_settings WHERE key = 'credits';
  v_free := COALESCE(v_free, 5);
  INSERT INTO public.credit_usage (user_id, usage_date, credits_used) VALUES (uid, current_date, 0)
    ON CONFLICT (user_id, usage_date) DO NOTHING;
  SELECT credits_used INTO v_used FROM public.credit_usage WHERE user_id = uid AND usage_date = current_date FOR UPDATE;
  SELECT purchased_credits INTO v_purchased FROM public.profiles WHERE id = uid FOR UPDATE;
  v_purchased := COALESCE(v_purchased, 0);
  v_from_free := LEAST(GREATEST(v_free - v_used, 0), _cost);
  v_from_purchased := _cost - v_from_free;
  IF v_from_purchased > v_purchased THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_credits',
      'needed', _cost, 'available', GREATEST(v_free - v_used, 0) + v_purchased);
  END IF;
  UPDATE public.credit_usage SET credits_used = v_used + v_from_free WHERE user_id = uid AND usage_date = current_date;
  IF v_from_purchased > 0 THEN
    UPDATE public.profiles SET purchased_credits = v_purchased - v_from_purchased WHERE id = uid;
  END IF;
  RETURN jsonb_build_object('ok', true, 'unlimited', false, 'charged', _cost,
    'from_free', v_from_free, 'from_purchased', v_from_purchased);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_credits(_user_id uuid, _delta integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new int;
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.profiles SET purchased_credits = GREATEST(COALESCE(purchased_credits,0) + _delta, 0)
  WHERE id = _user_id RETURNING purchased_credits INTO v_new;
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role public.app_role, _enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only the owner can change roles'; END IF;
  IF _role = 'owner' THEN RAISE EXCEPTION 'Owner role is designated via the secure setup token'; END IF;
  IF _enabled THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN jsonb_build_object(
    'total_users', (SELECT count(*) FROM public.profiles),
    'total_generations', (SELECT count(*) FROM public.generations),
    'images', (SELECT count(*) FROM public.generations WHERE kind = 'image'),
    'videos', (SELECT count(*) FROM public.generations WHERE kind = 'video'),
    'failed', (SELECT count(*) FROM public.generations WHERE status = 'failed'),
    'generations_today', (SELECT count(*) FROM public.generations WHERE created_at >= current_date),
    'credits_used_today', (SELECT COALESCE(sum(credits_used),0) FROM public.credit_usage WHERE usage_date = current_date),
    'open_reports', (SELECT count(*) FROM public.reports WHERE status = 'open')
  );
END;
$$;

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_staff(uuid);

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_credits(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_adjust_credits(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_stats() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.credit_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_credits(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_adjust_credits(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer) TO service_role;
