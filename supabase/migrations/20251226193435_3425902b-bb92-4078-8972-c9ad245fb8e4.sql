-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types/enums
CREATE TYPE public.trade_side AS ENUM ('LONG', 'SHORT');
CREATE TYPE public.attachment_kind AS ENUM ('BEFORE', 'AFTER', 'OTHER');
CREATE TYPE public.checklist_value AS ENUM ('YES', 'NO', 'NA');
CREATE TYPE public.import_source_type AS ENUM ('ThinkOrSwim', 'TraderVue', 'Custom');

-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  default_account_id UUID,
  default_currency TEXT DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Accounts table
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  broker TEXT,
  currency TEXT DEFAULT 'USD',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Strategies table
CREATE TABLE public.strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tags table
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#0ea5e9',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Mistakes table
CREATE TABLE public.mistakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  severity INTEGER DEFAULT 1 CHECK (severity >= 1 AND severity <= 5),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trades table
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  source TEXT,
  source_trade_id TEXT,
  stable_hash TEXT,
  symbol TEXT NOT NULL,
  side trade_side NOT NULL,
  entry_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  exit_datetime TIMESTAMP WITH TIME ZONE,
  entry_price NUMERIC(18,6) NOT NULL,
  exit_price NUMERIC(18,6),
  quantity NUMERIC(18,6) NOT NULL,
  fees NUMERIC(18,6) DEFAULT 0,
  commissions NUMERIC(18,6) DEFAULT 0,
  stop_loss NUMERIC(18,6),
  planned_risk_override NUMERIC(18,6),
  planned_r_override NUMERIC(18,6),
  mae NUMERIC(18,6),
  mfe NUMERIC(18,6),
  notes TEXT,
  followed_plan BOOLEAN,
  what_went_well TEXT,
  what_to_improve TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, stable_hash)
);

-- Trade targets
CREATE TABLE public.trade_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  target_price NUMERIC(18,6) NOT NULL,
  target_qty NUMERIC(18,6),
  ordering INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trade tags junction
CREATE TABLE public.trade_tags (
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (trade_id, tag_id)
);

-- Trade mistakes junction
CREATE TABLE public.trade_mistakes (
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  mistake_id UUID NOT NULL REFERENCES public.mistakes(id) ON DELETE CASCADE,
  PRIMARY KEY (trade_id, mistake_id)
);

-- Attachments table
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES public.trades(id) ON DELETE CASCADE,
  kind attachment_kind DEFAULT 'OTHER',
  filename TEXT NOT NULL,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Checklist templates
CREATE TABLE public.checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Checklist items
CREATE TABLE public.checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  ordering INTEGER DEFAULT 1,
  is_required BOOLEAN DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trade checklist responses
CREATE TABLE public.trade_checklist_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  value checklist_value DEFAULT 'NA',
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(trade_id, item_id)
);

-- Journal entries
CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  pre_market TEXT,
  post_market TEXT,
  daily_max_loss NUMERIC(18,6),
  daily_profit_target NUMERIC(18,6),
  mood INTEGER CHECK (mood >= 1 AND mood <= 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Import mapping templates
CREATE TABLE public.import_mapping_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_name import_source_type NOT NULL,
  template_name TEXT NOT NULL,
  mapping_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Imports history
CREATE TABLE public.imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_name import_source_type NOT NULL,
  filename TEXT NOT NULL,
  imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  rows_total INTEGER DEFAULT 0,
  rows_new INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0
);

-- Reports table
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  report_type TEXT DEFAULT 'weekly',
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  storage_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Filter presets
CREATE TABLE public.filter_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_mistakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_checklist_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_mapping_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filter_presets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for accounts
CREATE POLICY "Users can view own accounts" ON public.accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own accounts" ON public.accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own accounts" ON public.accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own accounts" ON public.accounts FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for strategies
CREATE POLICY "Users can view own strategies" ON public.strategies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own strategies" ON public.strategies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own strategies" ON public.strategies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own strategies" ON public.strategies FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for tags
CREATE POLICY "Users can view own tags" ON public.tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tags" ON public.tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tags" ON public.tags FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tags" ON public.tags FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for mistakes
CREATE POLICY "Users can view own mistakes" ON public.mistakes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own mistakes" ON public.mistakes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own mistakes" ON public.mistakes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own mistakes" ON public.mistakes FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for trades
CREATE POLICY "Users can view own trades" ON public.trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trades" ON public.trades FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trades" ON public.trades FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trades" ON public.trades FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for trade_targets
CREATE POLICY "Users can view own trade targets" ON public.trade_targets FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_targets.trade_id AND trades.user_id = auth.uid())
);
CREATE POLICY "Users can insert own trade targets" ON public.trade_targets FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_targets.trade_id AND trades.user_id = auth.uid())
);
CREATE POLICY "Users can update own trade targets" ON public.trade_targets FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_targets.trade_id AND trades.user_id = auth.uid())
);
CREATE POLICY "Users can delete own trade targets" ON public.trade_targets FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_targets.trade_id AND trades.user_id = auth.uid())
);

-- RLS Policies for trade_tags
CREATE POLICY "Users can view own trade tags" ON public.trade_tags FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_tags.trade_id AND trades.user_id = auth.uid())
);
CREATE POLICY "Users can insert own trade tags" ON public.trade_tags FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_tags.trade_id AND trades.user_id = auth.uid())
);
CREATE POLICY "Users can delete own trade tags" ON public.trade_tags FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_tags.trade_id AND trades.user_id = auth.uid())
);

-- RLS Policies for trade_mistakes
CREATE POLICY "Users can view own trade mistakes" ON public.trade_mistakes FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_mistakes.trade_id AND trades.user_id = auth.uid())
);
CREATE POLICY "Users can insert own trade mistakes" ON public.trade_mistakes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_mistakes.trade_id AND trades.user_id = auth.uid())
);
CREATE POLICY "Users can delete own trade mistakes" ON public.trade_mistakes FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_mistakes.trade_id AND trades.user_id = auth.uid())
);

-- RLS Policies for attachments
CREATE POLICY "Users can view own attachments" ON public.attachments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own attachments" ON public.attachments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own attachments" ON public.attachments FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for checklist_templates
CREATE POLICY "Users can view own checklist templates" ON public.checklist_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own checklist templates" ON public.checklist_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own checklist templates" ON public.checklist_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own checklist templates" ON public.checklist_templates FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for checklist_items
CREATE POLICY "Users can view own checklist items" ON public.checklist_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.checklist_templates WHERE checklist_templates.id = checklist_items.template_id AND checklist_templates.user_id = auth.uid())
);
CREATE POLICY "Users can insert own checklist items" ON public.checklist_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.checklist_templates WHERE checklist_templates.id = checklist_items.template_id AND checklist_templates.user_id = auth.uid())
);
CREATE POLICY "Users can update own checklist items" ON public.checklist_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.checklist_templates WHERE checklist_templates.id = checklist_items.template_id AND checklist_templates.user_id = auth.uid())
);
CREATE POLICY "Users can delete own checklist items" ON public.checklist_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.checklist_templates WHERE checklist_templates.id = checklist_items.template_id AND checklist_templates.user_id = auth.uid())
);

-- RLS Policies for trade_checklist_responses
CREATE POLICY "Users can view own checklist responses" ON public.trade_checklist_responses FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_checklist_responses.trade_id AND trades.user_id = auth.uid())
);
CREATE POLICY "Users can insert own checklist responses" ON public.trade_checklist_responses FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_checklist_responses.trade_id AND trades.user_id = auth.uid())
);
CREATE POLICY "Users can update own checklist responses" ON public.trade_checklist_responses FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_checklist_responses.trade_id AND trades.user_id = auth.uid())
);
CREATE POLICY "Users can delete own checklist responses" ON public.trade_checklist_responses FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.trades WHERE trades.id = trade_checklist_responses.trade_id AND trades.user_id = auth.uid())
);

-- RLS Policies for journal_entries
CREATE POLICY "Users can view own journal entries" ON public.journal_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own journal entries" ON public.journal_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own journal entries" ON public.journal_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own journal entries" ON public.journal_entries FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for import_mapping_templates
CREATE POLICY "Users can view own import templates" ON public.import_mapping_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own import templates" ON public.import_mapping_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own import templates" ON public.import_mapping_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own import templates" ON public.import_mapping_templates FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for imports
CREATE POLICY "Users can view own imports" ON public.imports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own imports" ON public.imports FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for reports
CREATE POLICY "Users can view own reports" ON public.reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reports" ON public.reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reports" ON public.reports FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for filter_presets
CREATE POLICY "Users can view own filter presets" ON public.filter_presets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own filter presets" ON public.filter_presets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own filter presets" ON public.filter_presets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own filter presets" ON public.filter_presets FOR DELETE USING (auth.uid() = user_id);

-- Create function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

-- Create trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON public.trades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_journal_entries_updated_at BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_trades_user_id ON public.trades(user_id);
CREATE INDEX idx_trades_symbol ON public.trades(symbol);
CREATE INDEX idx_trades_entry_datetime ON public.trades(entry_datetime);
CREATE INDEX idx_trades_exit_datetime ON public.trades(exit_datetime);
CREATE INDEX idx_trades_stable_hash ON public.trades(stable_hash);
CREATE INDEX idx_journal_entries_user_date ON public.journal_entries(user_id, date);
CREATE INDEX idx_accounts_user_id ON public.accounts(user_id);
CREATE INDEX idx_strategies_user_id ON public.strategies(user_id);
CREATE INDEX idx_tags_user_id ON public.tags(user_id);
CREATE INDEX idx_mistakes_user_id ON public.mistakes(user_id);