-- VATh Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- 1. User profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Datasets (uploaded files + analysis results)
CREATE TABLE IF NOT EXISTS public.datasets (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  sheet_name TEXT DEFAULT 'Sheet1',
  metadata JSONB DEFAULT '{}',
  schema_info JSONB DEFAULT '{}',
  summary JSONB DEFAULT '{}',
  charts JSONB DEFAULT '{}',
  anomalies JSONB DEFAULT '[]',
  employee_reports JSONB DEFAULT '[]',
  shift_sessions JSONB DEFAULT '[]',
  vulnerability_summary JSONB DEFAULT '{}',
  ai JSONB DEFAULT '{}',
  records JSONB DEFAULT '[]',
  algorithms JSONB DEFAULT '[]',
  shift_config JSONB DEFAULT '{}',
  anomaly_limit JSONB DEFAULT '{}',
  status TEXT DEFAULT 'uploaded',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. AI Config (per-user)
CREATE TABLE IF NOT EXISTS public.ai_configs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  provider TEXT DEFAULT 'mimo',
  compatibility TEXT DEFAULT 'anthropic',
  model TEXT DEFAULT 'mimo-v2.5-pro',
  base_url TEXT DEFAULT 'https://api.xiaomimimo.com/anthropic',
  api_key TEXT DEFAULT '',
  max_tokens INT DEFAULT 4000,
  anthropic_version TEXT DEFAULT '2023-06-01',
  prompt TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Activity logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details TEXT DEFAULT '',
  level TEXT DEFAULT 'info',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_datasets_user ON public.datasets(user_id);
CREATE INDEX IF NOT EXISTS idx_datasets_created ON public.datasets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user ON public.activity_logs(user_id, created_at DESC);

-- 6. RLS (Row Level Security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Datasets: users can CRUD their own
CREATE POLICY "Users can view own datasets" ON public.datasets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own datasets" ON public.datasets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own datasets" ON public.datasets
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own datasets" ON public.datasets
  FOR DELETE USING (auth.uid() = user_id);

-- AI Configs: users can CRUD their own
CREATE POLICY "Users can view own ai_config" ON public.ai_configs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own ai_config" ON public.ai_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ai_config" ON public.ai_configs
  FOR UPDATE USING (auth.uid() = user_id);

-- Activity logs: users can view/insert their own
CREATE POLICY "Users can view own logs" ON public.activity_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own logs" ON public.activity_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 7. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'email', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Storage bucket for dataset files
INSERT INTO storage.buckets (id, name, public)
VALUES ('datasets', 'datasets', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload own files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'datasets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own files" ON storage.objects
  FOR SELECT USING (bucket_id = 'datasets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own files" ON storage.objects
  FOR DELETE USING (bucket_id = 'datasets' AND auth.uid()::text = (storage.foldername(name))[1]);
