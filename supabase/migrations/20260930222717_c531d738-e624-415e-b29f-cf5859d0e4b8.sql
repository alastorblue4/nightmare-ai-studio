CREATE OR REPLACE FUNCTION public.refund_credit_split(_user_id uuid, _from_free integer, _from_purchased integer, _usage_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(_from_free,0) > 0 THEN
    UPDATE public.credit_usage SET credits_used = GREATEST(credits_used - _from_free, 0)
    WHERE user_id = _user_id AND usage_date = _usage_date;
  END IF;
  IF COALESCE(_from_purchased,0) > 0 THEN
    UPDATE public.profiles SET purchased_credits = COALESCE(purchased_credits,0) + _from_purchased WHERE id = _user_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.refund_credit_split(uuid, integer, integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credit_split(uuid, integer, integer, date) TO service_role;