ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS provider_job_id text;

CREATE TABLE public.generation_charges (
  generation_id uuid PRIMARY KEY REFERENCES public.generations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  provider_job_id text,
  from_free integer NOT NULL DEFAULT 0,
  from_purchased integer NOT NULL DEFAULT 0,
  usage_date date NOT NULL DEFAULT current_date,
  refunded boolean NOT NULL DEFAULT false,
  finalized boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.generation_charges TO service_role;
ALTER TABLE public.generation_charges ENABLE ROW LEVEL SECURITY;