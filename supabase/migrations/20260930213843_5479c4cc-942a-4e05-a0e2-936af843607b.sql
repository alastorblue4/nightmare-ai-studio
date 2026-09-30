
-- ROLES
CREATE TYPE public.app_role AS ENUM ('owner','admin','user');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  purchased_credits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','admin'));
$$;

CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_staff(auth.uid()));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

-- SETTINGS
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public settings readable" ON public.app_settings FOR SELECT TO anon, authenticated
  USING (is_public OR public.is_staff(auth.uid()));
CREATE POLICY "staff manage settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO public.app_settings (key, value, is_public) VALUES
  ('credits', '{"daily_free_credits":5,"image_cost":1,"video_cost":3}'::jsonb, true),
  ('pricing', '{"currency":"USD","packs":[{"id":"starter","name":"Starter","credits":50,"price":5},{"id":"pro","name":"Pro","credits":250,"price":20},{"id":"studio","name":"Studio","credits":1000,"price":60}],"payments_enabled":false}'::jsonb, true),
  ('providers', '{"image":{"provider":"demo","endpoint":"","model":"nightmare-diffusion-xl"},"video":{"provider":"demo","endpoint":"","model":"nightmare-motion-v1"}}'::jsonb, false);

-- GENERATIONS
CREATE TABLE public.generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('image','video')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  prompt text NOT NULL,
  negative_prompt text,
  model text,
  provider text NOT NULL DEFAULT 'demo',
  aspect_ratio text NOT NULL DEFAULT '1:1',
  quality text NOT NULL DEFAULT 'standard',
  duration_seconds integer,
  output_count integer NOT NULL DEFAULT 1,
  credits_cost integer NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT true,
  outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_image_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX generations_user_created_idx ON public.generations (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generations TO authenticated;
GRANT ALL ON public.generations TO service_role;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own generations" ON public.generations FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));
CREATE POLICY "insert own generations" ON public.generations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own generations" ON public.generations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_staff(auth.uid()));
CREATE POLICY "delete own generations" ON public.generations FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

-- CREDIT USAGE
CREATE TABLE public.credit_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT current_date,
  credits_used integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);
GRANT SELECT ON public.credit_usage TO authenticated;
GRANT ALL ON public.credit_usage TO service_role;
ALTER TABLE public.credit_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own usage" ON public.credit_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

-- REPORTS
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generation_id uuid REFERENCES public.generations(id) ON DELETE SET NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "create reports" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "read own or staff reports" ON public.reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR public.is_staff(auth.uid()));
CREATE POLICY "staff update reports" ON public.reports FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- NEW USER TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(COALESCE(NEW.email,'creator'), '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CREDIT FUNCTIONS
CREATE OR REPLACE FUNCTION public.credit_status(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_free int; v_used int; v_purchased int; v_unlimited boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  IF _user_id <> auth.uid() AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT COALESCE((value->>'daily_free_credits')::int, 5) INTO v_free FROM public.app_settings WHERE key = 'credits';
  v_free := COALESCE(v_free, 5);
  SELECT COALESCE(credits_used, 0) INTO v_used FROM public.credit_usage WHERE user_id = _user_id AND usage_date = current_date;
  v_used := COALESCE(v_used, 0);
  SELECT COALESCE(purchased_credits, 0) INTO v_purchased FROM public.profiles WHERE id = _user_id;
  v_purchased := COALESCE(v_purchased, 0);
  v_unlimited := public.is_staff(_user_id);
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
  IF public.is_staff(uid) THEN
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

CREATE OR REPLACE FUNCTION public.refund_credits(_user_id uuid, _amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_used int;
BEGIN
  IF _amount <= 0 THEN RETURN; END IF;
  SELECT credits_used INTO v_used FROM public.credit_usage WHERE user_id = _user_id AND usage_date = current_date FOR UPDATE;
  IF v_used IS NOT NULL AND v_used > 0 THEN
    UPDATE public.credit_usage SET credits_used = GREATEST(v_used - _amount, 0) WHERE user_id = _user_id AND usage_date = current_date;
  END IF;
END;
$$;

-- ADMIN HELPERS
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(_user_id uuid, _delta integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new int;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.profiles SET purchased_credits = GREATEST(COALESCE(purchased_credits,0) + _delta, 0)
  WHERE id = _user_id RETURNING purchased_credits INTO v_new;
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role public.app_role, _enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only the owner can change roles'; END IF;
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
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
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
