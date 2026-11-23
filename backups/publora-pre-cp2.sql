--
-- PostgreSQL database dump
--

\restrict b0Ijxv4SRi1DCjYMgykzEbaB6vTBDopPIOy4FnbVPsxGb772bxSfUezhhYYcXae

-- Dumped from database version 16.16
-- Dumped by pg_dump version 16.16

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: account_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.account_status AS ENUM (
    'connected',
    'expired',
    'revoked',
    'needs_reconnect',
    'error'
);


ALTER TYPE public.account_status OWNER TO postgres;

--
-- Name: automation_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.automation_status AS ENUM (
    'draft',
    'active',
    'paused',
    'archived'
);


ALTER TYPE public.automation_status OWNER TO postgres;

--
-- Name: billing_cycle; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.billing_cycle AS ENUM (
    'monthly',
    'yearly'
);


ALTER TYPE public.billing_cycle OWNER TO postgres;

--
-- Name: brand_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.brand_status AS ENUM (
    'active',
    'archived'
);


ALTER TYPE public.brand_status OWNER TO postgres;

--
-- Name: media_kind; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.media_kind AS ENUM (
    'video',
    'image',
    'audio',
    'document',
    'other'
);


ALTER TYPE public.media_kind OWNER TO postgres;

--
-- Name: member_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.member_status AS ENUM (
    'active',
    'invited',
    'suspended'
);


ALTER TYPE public.member_status OWNER TO postgres;

--
-- Name: plan_tier; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.plan_tier AS ENUM (
    'free',
    'starter',
    'growth',
    'pro',
    'enterprise'
);


ALTER TYPE public.plan_tier OWNER TO postgres;

--
-- Name: post_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.post_status AS ENUM (
    'draft',
    'scheduled',
    'publishing',
    'published',
    'failed',
    'cancelled',
    'needs_reconnect'
);


ALTER TYPE public.post_status OWNER TO postgres;

--
-- Name: post_target_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.post_target_status AS ENUM (
    'scheduled',
    'publishing',
    'published',
    'failed',
    'cancelled',
    'needs_reconnect'
);


ALTER TYPE public.post_target_status OWNER TO postgres;

--
-- Name: provider; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.provider AS ENUM (
    'youtube',
    'facebook',
    'instagram',
    'tiktok',
    'google_drive'
);


ALTER TYPE public.provider OWNER TO postgres;

--
-- Name: security_severity; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.security_severity AS ENUM (
    'info',
    'low',
    'medium',
    'high',
    'critical'
);


ALTER TYPE public.security_severity OWNER TO postgres;

--
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.subscription_status AS ENUM (
    'trialing',
    'active',
    'past_due',
    'canceled',
    'incomplete'
);


ALTER TYPE public.subscription_status OWNER TO postgres;

--
-- Name: token_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.token_type AS ENUM (
    'email_verification',
    'password_reset',
    'magic_link',
    'email_change',
    'workspace_invite'
);


ALTER TYPE public.token_type OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'user',
    'creator',
    'admin',
    'super_admin',
    'platform_admin',
    'god',
    'moderator',
    'support'
);


ALTER TYPE public.user_role OWNER TO postgres;

--
-- Name: user_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_status AS ENUM (
    'active',
    'suspended',
    'pending_verification',
    'deleted'
);


ALTER TYPE public.user_status OWNER TO postgres;

--
-- Name: workspace_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.workspace_role AS ENUM (
    'owner',
    'admin',
    'editor',
    'viewer',
    'manager',
    'publisher',
    'analyst',
    'member'
);


ALTER TYPE public.workspace_role OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: analytics_snapshots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analytics_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    post_target_id uuid,
    social_account_id uuid,
    video_id uuid,
    metric text NOT NULL,
    value numeric NOT NULL,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    source text DEFAULT 'sync'::text NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.analytics_snapshots OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    user_id uuid,
    user_email text,
    action text NOT NULL,
    details text,
    severity public.security_severity DEFAULT 'info'::public.security_severity NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
)
PARTITION BY RANGE (created_at);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: audit_logs_2026_11; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs_2026_11 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    user_id uuid,
    user_email text,
    action text NOT NULL,
    details text,
    severity public.security_severity DEFAULT 'info'::public.security_severity NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs_2026_11 OWNER TO postgres;

--
-- Name: audit_logs_2026_12; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs_2026_12 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    user_id uuid,
    user_email text,
    action text NOT NULL,
    details text,
    severity public.security_severity DEFAULT 'info'::public.security_severity NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs_2026_12 OWNER TO postgres;

--
-- Name: audit_logs_default; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs_default (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    user_id uuid,
    user_email text,
    action text NOT NULL,
    details text,
    severity public.security_severity DEFAULT 'info'::public.security_severity NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs_default OWNER TO postgres;

--
-- Name: auth_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.auth_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type public.token_type NOT NULL,
    token_hash text NOT NULL,
    user_id uuid,
    email public.citext,
    payload jsonb,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.auth_tokens OWNER TO postgres;

--
-- Name: automation_approvals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.automation_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    execution_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.automation_approvals OWNER TO postgres;

--
-- Name: automation_executions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.automation_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid,
    workspace_id uuid NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    trigger_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone
);


ALTER TABLE public.automation_executions OWNER TO postgres;

--
-- Name: automation_workflows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.automation_workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    trigger jsonb DEFAULT '{}'::jsonb NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    status public.automation_status DEFAULT 'draft'::public.automation_status NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_trigger_hash text,
    last_triggered_at timestamp with time zone
);


ALTER TABLE public.automation_workflows OWNER TO postgres;

--
-- Name: brands; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    logo_url text,
    website text,
    status public.brand_status DEFAULT 'active'::public.brand_status NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    logo_media_id uuid,
    avatar_media_id uuid,
    cover_media_id uuid
);


ALTER TABLE public.brands OWNER TO postgres;

--
-- Name: brute_force_state; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.brute_force_state (
    scope text NOT NULL,
    identifier text NOT NULL,
    failures integer DEFAULT 0 NOT NULL,
    restricted_until timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.brute_force_state OWNER TO postgres;

--
-- Name: content_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.content_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.content_categories OWNER TO postgres;

--
-- Name: drive_connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.drive_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    google_account text,
    encrypted_token text NOT NULL,
    token_expires_at timestamp with time zone,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    status public.account_status DEFAULT 'connected'::public.account_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.drive_connections OWNER TO postgres;

--
-- Name: drive_imports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.drive_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    drive_file_id text NOT NULL,
    name text,
    mime text,
    size_bytes bigint,
    media_asset_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.drive_imports OWNER TO postgres;

--
-- Name: media_assets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.media_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    workspace_id uuid NOT NULL,
    brand_id uuid,
    uploaded_by uuid,
    storage_key text NOT NULL,
    original_name text,
    mime text NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 text,
    kind public.media_kind DEFAULT 'video'::public.media_kind NOT NULL,
    duration_sec numeric,
    width integer,
    height integer,
    status text DEFAULT 'ready'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.media_assets OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: oauth_attempts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.oauth_attempts (
    id text NOT NULL,
    provider text NOT NULL,
    user_id uuid,
    state text NOT NULL,
    pkce_verifier text,
    redirect_after text,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.oauth_attempts OWNER TO postgres;

--
-- Name: outbox_emails; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.outbox_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    to_email public.citext NOT NULL,
    template text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone
);


ALTER TABLE public.outbox_emails OWNER TO postgres;

--
-- Name: post_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.post_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_target_id uuid NOT NULL,
    type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.post_events OWNER TO postgres;

--
-- Name: post_targets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.post_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    post_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    social_account_id uuid NOT NULL,
    platform public.provider NOT NULL,
    status public.post_target_status DEFAULT 'scheduled'::public.post_target_status NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    next_retry_at timestamp with time zone,
    lock_id uuid,
    locked_at timestamp with time zone,
    external_id text,
    external_url text,
    error_code text,
    error_message text,
    idempotency_key uuid DEFAULT gen_random_uuid() NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_by text,
    attempt_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.post_targets OWNER TO postgres;

--
-- Name: posts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    workspace_id uuid NOT NULL,
    brand_id uuid,
    project_id uuid,
    video_id uuid,
    title text,
    caption text,
    media_asset_id uuid,
    status public.post_status DEFAULT 'draft'::public.post_status NOT NULL,
    scheduled_at timestamp with time zone,
    published_at timestamp with time zone,
    timezone text,
    version integer DEFAULT 1 NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_by text,
    locked_at timestamp with time zone
);


ALTER TABLE public.posts OWNER TO postgres;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    workspace_id uuid NOT NULL,
    brand_id uuid,
    name text NOT NULL,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.projects OWNER TO postgres;

--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rate_limits (
    bucket text NOT NULL,
    key text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.rate_limits OWNER TO postgres;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schema_migrations (
    version text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO postgres;

--
-- Name: security_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.security_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    user_id uuid,
    user_email text,
    action text NOT NULL,
    details text,
    severity public.security_severity DEFAULT 'medium'::public.security_severity NOT NULL,
    ip inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
)
PARTITION BY RANGE (created_at);


ALTER TABLE public.security_events OWNER TO postgres;

--
-- Name: security_events_2026_11; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.security_events_2026_11 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    user_id uuid,
    user_email text,
    action text NOT NULL,
    details text,
    severity public.security_severity DEFAULT 'medium'::public.security_severity NOT NULL,
    ip inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.security_events_2026_11 OWNER TO postgres;

--
-- Name: security_events_2026_12; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.security_events_2026_12 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    user_id uuid,
    user_email text,
    action text NOT NULL,
    details text,
    severity public.security_severity DEFAULT 'medium'::public.security_severity NOT NULL,
    ip inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.security_events_2026_12 OWNER TO postgres;

--
-- Name: security_events_default; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.security_events_default (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    user_id uuid,
    user_email text,
    action text NOT NULL,
    details text,
    severity public.security_severity DEFAULT 'medium'::public.security_severity NOT NULL,
    ip inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.security_events_default OWNER TO postgres;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    ip inet,
    user_agent text,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sessions OWNER TO postgres;

--
-- Name: social_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.social_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    workspace_id uuid NOT NULL,
    brand_id uuid,
    provider public.provider NOT NULL,
    platform_account_id text,
    account_name text,
    handle text,
    avatar_url text,
    encrypted_token text,
    token_key_version integer DEFAULT 1 NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    status public.account_status DEFAULT 'connected'::public.account_status NOT NULL,
    token_expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    connected_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.social_accounts OWNER TO postgres;

--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.system_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


ALTER TABLE public.system_settings OWNER TO postgres;

--
-- Name: upload_session_chunks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.upload_session_chunks (
    session_id text NOT NULL,
    chunk_index integer NOT NULL,
    data bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.upload_session_chunks OWNER TO postgres;

--
-- Name: upload_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.upload_sessions (
    id text NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    user_email text,
    filename text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    chunk_size integer NOT NULL,
    total_chunks integer NOT NULL,
    received_chunks jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT upload_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text, 'expired'::text])))
);


ALTER TABLE public.upload_sessions OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    email public.citext NOT NULL,
    password_hash text,
    full_name text,
    avatar_url text,
    username text,
    phone text,
    bio text,
    country text,
    city text,
    timezone text,
    language text DEFAULT 'en'::text,
    role public.user_role DEFAULT 'user'::public.user_role NOT NULL,
    status public.user_status DEFAULT 'pending_verification'::public.user_status NOT NULL,
    is_email_verified boolean DEFAULT false NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    avatar_media_id uuid
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: videos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.videos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    workspace_id uuid NOT NULL,
    brand_id uuid,
    project_id uuid,
    media_asset_id uuid,
    title text NOT NULL,
    description text,
    category_id uuid,
    duration_sec numeric,
    width integer,
    height integer,
    file_size_bytes bigint,
    thumbnail_url text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'uploaded'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    media_id uuid
);


ALTER TABLE public.videos OWNER TO postgres;

--
-- Name: workspace_invitations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspace_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    email public.citext NOT NULL,
    role public.workspace_role DEFAULT 'editor'::public.workspace_role NOT NULL,
    token_hash text NOT NULL,
    invited_by uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.workspace_invitations OWNER TO postgres;

--
-- Name: workspace_kv; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspace_kv (
    workspace_id uuid NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.workspace_kv OWNER TO postgres;

--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspace_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.workspace_role DEFAULT 'editor'::public.workspace_role NOT NULL,
    status public.member_status DEFAULT 'active'::public.member_status NOT NULL,
    invited_by uuid,
    joined_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.workspace_members OWNER TO postgres;

--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_id text,
    name text NOT NULL,
    slug text NOT NULL,
    owner_id uuid NOT NULL,
    plan public.plan_tier DEFAULT 'free'::public.plan_tier NOT NULL,
    billing_cycle public.billing_cycle DEFAULT 'monthly'::public.billing_cycle NOT NULL,
    subscription_status public.subscription_status DEFAULT 'active'::public.subscription_status NOT NULL,
    trial_ends_at timestamp with time zone,
    current_period_end timestamp with time zone,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    state_version bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.workspaces OWNER TO postgres;

--
-- Name: audit_logs_2026_11; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs ATTACH PARTITION public.audit_logs_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+02') TO ('2026-12-01 00:00:00+02');


--
-- Name: audit_logs_2026_12; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs ATTACH PARTITION public.audit_logs_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+02') TO ('2027-01-01 00:00:00+02');


--
-- Name: audit_logs_default; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs ATTACH PARTITION public.audit_logs_default DEFAULT;


--
-- Name: security_events_2026_11; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.security_events ATTACH PARTITION public.security_events_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+02') TO ('2026-12-01 00:00:00+02');


--
-- Name: security_events_2026_12; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.security_events ATTACH PARTITION public.security_events_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+02') TO ('2027-01-01 00:00:00+02');


--
-- Name: security_events_default; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.security_events ATTACH PARTITION public.security_events_default DEFAULT;


--
-- Data for Name: analytics_snapshots; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.analytics_snapshots (id, workspace_id, post_target_id, social_account_id, video_id, metric, value, period_start, period_end, source, synced_at, created_at) FROM stdin;
\.


--
-- Data for Name: audit_logs_2026_11; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs_2026_11 (id, workspace_id, user_id, user_email, action, details, severity, created_at) FROM stdin;
\.


--
-- Data for Name: audit_logs_2026_12; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs_2026_12 (id, workspace_id, user_id, user_email, action, details, severity, created_at) FROM stdin;
\.


--
-- Data for Name: audit_logs_default; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs_default (id, workspace_id, user_id, user_email, action, details, severity, created_at) FROM stdin;
\.


--
-- Data for Name: auth_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.auth_tokens (id, type, token_hash, user_id, email, payload, expires_at, used_at, attempts, created_at) FROM stdin;
\.


--
-- Data for Name: automation_approvals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.automation_approvals (id, execution_id, workspace_id, status, decided_by, decided_at, created_at) FROM stdin;
\.


--
-- Data for Name: automation_executions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.automation_executions (id, workflow_id, workspace_id, status, trigger_payload, result, error, started_at, finished_at) FROM stdin;
\.


--
-- Data for Name: automation_workflows; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.automation_workflows (id, legacy_id, workspace_id, name, description, trigger, steps, status, version, created_by, created_at, updated_at, last_trigger_hash, last_triggered_at) FROM stdin;
\.


--
-- Data for Name: brands; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.brands (id, legacy_id, workspace_id, name, description, logo_url, website, status, settings, created_at, updated_at, logo_media_id, avatar_media_id, cover_media_id) FROM stdin;
\.


--
-- Data for Name: brute_force_state; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.brute_force_state (scope, identifier, failures, restricted_until, updated_at) FROM stdin;
\.


--
-- Data for Name: content_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.content_categories (id, workspace_id, name, color, created_at) FROM stdin;
\.


--
-- Data for Name: drive_connections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.drive_connections (id, workspace_id, user_id, google_account, encrypted_token, token_expires_at, scopes, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: drive_imports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.drive_imports (id, connection_id, workspace_id, drive_file_id, name, mime, size_bytes, media_asset_id, status, error, created_at) FROM stdin;
\.


--
-- Data for Name: media_assets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.media_assets (id, legacy_id, workspace_id, brand_id, uploaded_by, storage_key, original_name, mime, size_bytes, sha256, kind, duration_sec, width, height, status, created_at) FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, user_id, workspace_id, type, title, body, payload, read_at, created_at) FROM stdin;
\.


--
-- Data for Name: oauth_attempts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.oauth_attempts (id, provider, user_id, state, pkce_verifier, redirect_after, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: outbox_emails; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.outbox_emails (id, to_email, template, payload, status, attempts, next_attempt_at, last_error, created_at, sent_at) FROM stdin;
\.


--
-- Data for Name: post_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.post_events (id, post_target_id, type, payload, created_at) FROM stdin;
\.


--
-- Data for Name: post_targets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.post_targets (id, legacy_id, post_id, workspace_id, social_account_id, platform, status, scheduled_at, attempts, max_attempts, next_retry_at, lock_id, locked_at, external_id, external_url, error_code, error_message, idempotency_key, payload, created_at, updated_at, locked_by, attempt_count) FROM stdin;
\.


--
-- Data for Name: posts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.posts (id, legacy_id, workspace_id, brand_id, project_id, video_id, title, caption, media_asset_id, status, scheduled_at, published_at, timezone, version, settings, created_by, created_at, updated_at, locked_by, locked_at) FROM stdin;
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.projects (id, legacy_id, workspace_id, brand_id, name, description, status, settings, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: rate_limits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.rate_limits (bucket, key, window_start, count) FROM stdin;
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.schema_migrations (version, applied_at) FROM stdin;
0001_schema_v2.sql	2026-11-23 17:22:34.334646+02
0002_phase_a_deltas.sql	2026-11-23 17:22:37.718597+02
\.


--
-- Data for Name: security_events_2026_11; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.security_events_2026_11 (id, workspace_id, user_id, user_email, action, details, severity, ip, user_agent, created_at) FROM stdin;
\.


--
-- Data for Name: security_events_2026_12; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.security_events_2026_12 (id, workspace_id, user_id, user_email, action, details, severity, ip, user_agent, created_at) FROM stdin;
\.


--
-- Data for Name: security_events_default; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.security_events_default (id, workspace_id, user_id, user_email, action, details, severity, ip, user_agent, created_at) FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sessions (id, user_id, token_hash, ip, user_agent, expires_at, revoked_at, created_at) FROM stdin;
\.


--
-- Data for Name: social_accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.social_accounts (id, legacy_id, workspace_id, brand_id, provider, platform_account_id, account_name, handle, avatar_url, encrypted_token, token_key_version, scopes, status, token_expires_at, metadata, connected_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.system_settings (key, value, updated_at, updated_by) FROM stdin;
\.


--
-- Data for Name: upload_session_chunks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.upload_session_chunks (session_id, chunk_index, data, created_at) FROM stdin;
\.


--
-- Data for Name: upload_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.upload_sessions (id, workspace_id, user_id, user_email, filename, mime_type, size_bytes, chunk_size, total_chunks, received_chunks, status, created_at, updated_at, expires_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, legacy_id, email, password_hash, full_name, avatar_url, username, phone, bio, country, city, timezone, language, role, status, is_email_verified, preferences, created_at, updated_at, last_login_at, avatar_media_id) FROM stdin;
\.


--
-- Data for Name: videos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.videos (id, legacy_id, workspace_id, brand_id, project_id, media_asset_id, title, description, category_id, duration_sec, width, height, file_size_bytes, thumbnail_url, tags, status, metadata, created_at, updated_at, media_id) FROM stdin;
\.


--
-- Data for Name: workspace_invitations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.workspace_invitations (id, workspace_id, email, role, token_hash, invited_by, expires_at, accepted_at, revoked_at, created_at) FROM stdin;
\.


--
-- Data for Name: workspace_kv; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.workspace_kv (workspace_id, key, value, updated_at) FROM stdin;
\.


--
-- Data for Name: workspace_members; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.workspace_members (id, workspace_id, user_id, role, status, invited_by, joined_at, created_at) FROM stdin;
\.


--
-- Data for Name: workspaces; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.workspaces (id, legacy_id, name, slug, owner_id, plan, billing_cycle, subscription_status, trial_ends_at, current_period_end, settings, state_version, created_at, updated_at) FROM stdin;
\.


--
-- Name: analytics_snapshots analytics_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_snapshots
    ADD CONSTRAINT analytics_snapshots_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_logs_2026_11 audit_logs_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs_2026_11
    ADD CONSTRAINT audit_logs_2026_11_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_logs_2026_12 audit_logs_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs_2026_12
    ADD CONSTRAINT audit_logs_2026_12_pkey PRIMARY KEY (id, created_at);


--
-- Name: audit_logs_default audit_logs_default_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs_default
    ADD CONSTRAINT audit_logs_default_pkey PRIMARY KEY (id, created_at);


--
-- Name: auth_tokens auth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_pkey PRIMARY KEY (id);


--
-- Name: automation_approvals automation_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_approvals
    ADD CONSTRAINT automation_approvals_pkey PRIMARY KEY (id);


--
-- Name: automation_executions automation_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_executions
    ADD CONSTRAINT automation_executions_pkey PRIMARY KEY (id);


--
-- Name: automation_workflows automation_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_workflows
    ADD CONSTRAINT automation_workflows_pkey PRIMARY KEY (id);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: brands brands_workspace_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_workspace_id_name_key UNIQUE (workspace_id, name);


--
-- Name: brute_force_state brute_force_state_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brute_force_state
    ADD CONSTRAINT brute_force_state_pkey PRIMARY KEY (scope, identifier);


--
-- Name: content_categories content_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.content_categories
    ADD CONSTRAINT content_categories_pkey PRIMARY KEY (id);


--
-- Name: content_categories content_categories_workspace_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.content_categories
    ADD CONSTRAINT content_categories_workspace_id_name_key UNIQUE (workspace_id, name);


--
-- Name: drive_connections drive_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drive_connections
    ADD CONSTRAINT drive_connections_pkey PRIMARY KEY (id);


--
-- Name: drive_imports drive_imports_connection_id_drive_file_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drive_imports
    ADD CONSTRAINT drive_imports_connection_id_drive_file_id_key UNIQUE (connection_id, drive_file_id);


--
-- Name: drive_imports drive_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drive_imports
    ADD CONSTRAINT drive_imports_pkey PRIMARY KEY (id);


--
-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: oauth_attempts oauth_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oauth_attempts
    ADD CONSTRAINT oauth_attempts_pkey PRIMARY KEY (id);


--
-- Name: outbox_emails outbox_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.outbox_emails
    ADD CONSTRAINT outbox_emails_pkey PRIMARY KEY (id);


--
-- Name: post_events post_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_events
    ADD CONSTRAINT post_events_pkey PRIMARY KEY (id);


--
-- Name: post_targets post_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_targets
    ADD CONSTRAINT post_targets_pkey PRIMARY KEY (id);


--
-- Name: post_targets post_targets_post_id_social_account_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_targets
    ADD CONSTRAINT post_targets_post_id_social_account_id_key UNIQUE (post_id, social_account_id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (bucket, key, window_start);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: security_events security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id, created_at);


--
-- Name: security_events_2026_11 security_events_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.security_events_2026_11
    ADD CONSTRAINT security_events_2026_11_pkey PRIMARY KEY (id, created_at);


--
-- Name: security_events_2026_12 security_events_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.security_events_2026_12
    ADD CONSTRAINT security_events_2026_12_pkey PRIMARY KEY (id, created_at);


--
-- Name: security_events_default security_events_default_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.security_events_default
    ADD CONSTRAINT security_events_default_pkey PRIMARY KEY (id, created_at);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: social_accounts social_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_accounts
    ADD CONSTRAINT social_accounts_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: upload_session_chunks upload_session_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.upload_session_chunks
    ADD CONSTRAINT upload_session_chunks_pkey PRIMARY KEY (session_id, chunk_index);


--
-- Name: upload_sessions upload_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_legacy_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_legacy_id_key UNIQUE (legacy_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: videos videos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_pkey PRIMARY KEY (id);


--
-- Name: workspace_invitations workspace_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_pkey PRIMARY KEY (id);


--
-- Name: workspace_invitations workspace_invitations_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_token_hash_key UNIQUE (token_hash);


--
-- Name: workspace_kv workspace_kv_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_kv
    ADD CONSTRAINT workspace_kv_pkey PRIMARY KEY (workspace_id, key);


--
-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id);


--
-- Name: workspace_members workspace_members_workspace_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_user_id_key UNIQUE (workspace_id, user_id);


--
-- Name: workspaces workspaces_legacy_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_legacy_id_key UNIQUE (legacy_id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: workspaces workspaces_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_slug_key UNIQUE (slug);


--
-- Name: analytics_ws_metric_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX analytics_ws_metric_idx ON public.analytics_snapshots USING btree (workspace_id, metric, synced_at DESC);


--
-- Name: audit_logs_action_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_action_idx ON ONLY public.audit_logs USING btree (action, created_at DESC);


--
-- Name: audit_logs_2026_11_action_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_2026_11_action_created_at_idx ON public.audit_logs_2026_11 USING btree (action, created_at DESC);


--
-- Name: audit_logs_ws_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_ws_idx ON ONLY public.audit_logs USING btree (workspace_id, created_at DESC);


--
-- Name: audit_logs_2026_11_workspace_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_2026_11_workspace_id_created_at_idx ON public.audit_logs_2026_11 USING btree (workspace_id, created_at DESC);


--
-- Name: audit_logs_2026_12_action_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_2026_12_action_created_at_idx ON public.audit_logs_2026_12 USING btree (action, created_at DESC);


--
-- Name: audit_logs_2026_12_workspace_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_2026_12_workspace_id_created_at_idx ON public.audit_logs_2026_12 USING btree (workspace_id, created_at DESC);


--
-- Name: audit_logs_default_action_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_default_action_created_at_idx ON public.audit_logs_default USING btree (action, created_at DESC);


--
-- Name: audit_logs_default_workspace_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_default_workspace_id_created_at_idx ON public.audit_logs_default USING btree (workspace_id, created_at DESC);


--
-- Name: auth_tokens_expiry_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX auth_tokens_expiry_idx ON public.auth_tokens USING btree (expires_at) WHERE (used_at IS NULL);


--
-- Name: auth_tokens_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX auth_tokens_hash_idx ON public.auth_tokens USING btree (type, token_hash);


--
-- Name: automation_exec_ws_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX automation_exec_ws_idx ON public.automation_executions USING btree (workspace_id, started_at DESC);


--
-- Name: automation_ws_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX automation_ws_idx ON public.automation_workflows USING btree (workspace_id, status);


--
-- Name: brands_ws_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX brands_ws_idx ON public.brands USING btree (workspace_id);


--
-- Name: drive_conn_ws_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX drive_conn_ws_idx ON public.drive_connections USING btree (workspace_id);


--
-- Name: media_assets_sha_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX media_assets_sha_idx ON public.media_assets USING btree (workspace_id, sha256) WHERE (sha256 IS NOT NULL);


--
-- Name: media_assets_ws_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX media_assets_ws_idx ON public.media_assets USING btree (workspace_id, created_at DESC);


--
-- Name: notifications_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);


--
-- Name: oauth_attempts_expiry; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX oauth_attempts_expiry ON public.oauth_attempts USING btree (expires_at);


--
-- Name: outbox_due_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX outbox_due_idx ON public.outbox_emails USING btree (next_attempt_at) WHERE (status = 'pending'::text);


--
-- Name: outbox_emails_pending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX outbox_emails_pending ON public.outbox_emails USING btree (status, created_at) WHERE (status = 'pending'::text);


--
-- Name: post_events_target_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX post_events_target_idx ON public.post_events USING btree (post_target_id, created_at);


--
-- Name: post_targets_due_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX post_targets_due_idx ON public.post_targets USING btree (scheduled_at) WHERE (status = 'scheduled'::public.post_target_status);


--
-- Name: post_targets_lock_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX post_targets_lock_idx ON public.post_targets USING btree (locked_at) WHERE (lock_id IS NOT NULL);


--
-- Name: post_targets_ws_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX post_targets_ws_idx ON public.post_targets USING btree (workspace_id, status);


--
-- Name: posts_brand_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX posts_brand_idx ON public.posts USING btree (brand_id);


--
-- Name: posts_ws_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX posts_ws_status_idx ON public.posts USING btree (workspace_id, status, scheduled_at);


--
-- Name: projects_ws_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX projects_ws_idx ON public.projects USING btree (workspace_id);


--
-- Name: rate_limits_window; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rate_limits_window ON public.rate_limits USING btree (bucket, key, window_start DESC);


--
-- Name: security_events_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX security_events_created_idx ON ONLY public.security_events USING btree (created_at DESC);


--
-- Name: security_events_2026_11_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX security_events_2026_11_created_at_idx ON public.security_events_2026_11 USING btree (created_at DESC);


--
-- Name: security_events_2026_12_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX security_events_2026_12_created_at_idx ON public.security_events_2026_12 USING btree (created_at DESC);


--
-- Name: security_events_default_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX security_events_default_created_at_idx ON public.security_events_default USING btree (created_at DESC);


--
-- Name: sessions_expiry_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sessions_expiry_idx ON public.sessions USING btree (expires_at) WHERE (revoked_at IS NULL);


--
-- Name: sessions_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sessions_user_idx ON public.sessions USING btree (user_id);


--
-- Name: social_accounts_brand_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX social_accounts_brand_idx ON public.social_accounts USING btree (brand_id);


--
-- Name: social_accounts_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX social_accounts_unique_idx ON public.social_accounts USING btree (workspace_id, provider, platform_account_id) WHERE (status <> 'revoked'::public.account_status);


--
-- Name: social_accounts_ws_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX social_accounts_ws_idx ON public.social_accounts USING btree (workspace_id, provider);


--
-- Name: upload_sessions_expiry; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX upload_sessions_expiry ON public.upload_sessions USING btree (expires_at) WHERE (status = 'active'::text);


--
-- Name: upload_sessions_ws; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX upload_sessions_ws ON public.upload_sessions USING btree (workspace_id, status);


--
-- Name: users_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX users_status_idx ON public.users USING btree (status);


--
-- Name: videos_brand_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX videos_brand_idx ON public.videos USING btree (brand_id);


--
-- Name: videos_ws_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX videos_ws_idx ON public.videos USING btree (workspace_id, created_at DESC);


--
-- Name: workspace_members_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workspace_members_user_idx ON public.workspace_members USING btree (user_id);


--
-- Name: workspaces_owner_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workspaces_owner_idx ON public.workspaces USING btree (owner_id);


--
-- Name: ws_invites_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ws_invites_email_idx ON public.workspace_invitations USING btree (email) WHERE (accepted_at IS NULL);


--
-- Name: audit_logs_2026_11_action_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.audit_logs_action_idx ATTACH PARTITION public.audit_logs_2026_11_action_created_at_idx;


--
-- Name: audit_logs_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.audit_logs_pkey ATTACH PARTITION public.audit_logs_2026_11_pkey;


--
-- Name: audit_logs_2026_11_workspace_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.audit_logs_ws_idx ATTACH PARTITION public.audit_logs_2026_11_workspace_id_created_at_idx;


--
-- Name: audit_logs_2026_12_action_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.audit_logs_action_idx ATTACH PARTITION public.audit_logs_2026_12_action_created_at_idx;


--
-- Name: audit_logs_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.audit_logs_pkey ATTACH PARTITION public.audit_logs_2026_12_pkey;


--
-- Name: audit_logs_2026_12_workspace_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.audit_logs_ws_idx ATTACH PARTITION public.audit_logs_2026_12_workspace_id_created_at_idx;


--
-- Name: audit_logs_default_action_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.audit_logs_action_idx ATTACH PARTITION public.audit_logs_default_action_created_at_idx;


--
-- Name: audit_logs_default_pkey; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.audit_logs_pkey ATTACH PARTITION public.audit_logs_default_pkey;


--
-- Name: audit_logs_default_workspace_id_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.audit_logs_ws_idx ATTACH PARTITION public.audit_logs_default_workspace_id_created_at_idx;


--
-- Name: security_events_2026_11_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.security_events_created_idx ATTACH PARTITION public.security_events_2026_11_created_at_idx;


--
-- Name: security_events_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.security_events_pkey ATTACH PARTITION public.security_events_2026_11_pkey;


--
-- Name: security_events_2026_12_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.security_events_created_idx ATTACH PARTITION public.security_events_2026_12_created_at_idx;


--
-- Name: security_events_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.security_events_pkey ATTACH PARTITION public.security_events_2026_12_pkey;


--
-- Name: security_events_default_created_at_idx; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.security_events_created_idx ATTACH PARTITION public.security_events_default_created_at_idx;


--
-- Name: security_events_default_pkey; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.security_events_pkey ATTACH PARTITION public.security_events_default_pkey;


--
-- Name: analytics_snapshots analytics_snapshots_post_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_snapshots
    ADD CONSTRAINT analytics_snapshots_post_target_id_fkey FOREIGN KEY (post_target_id) REFERENCES public.post_targets(id) ON DELETE CASCADE;


--
-- Name: analytics_snapshots analytics_snapshots_social_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_snapshots
    ADD CONSTRAINT analytics_snapshots_social_account_id_fkey FOREIGN KEY (social_account_id) REFERENCES public.social_accounts(id) ON DELETE CASCADE;


--
-- Name: analytics_snapshots analytics_snapshots_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_snapshots
    ADD CONSTRAINT analytics_snapshots_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- Name: analytics_snapshots analytics_snapshots_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_snapshots
    ADD CONSTRAINT analytics_snapshots_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: auth_tokens auth_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: automation_approvals automation_approvals_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_approvals
    ADD CONSTRAINT automation_approvals_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.users(id);


--
-- Name: automation_approvals automation_approvals_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_approvals
    ADD CONSTRAINT automation_approvals_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.automation_executions(id) ON DELETE CASCADE;


--
-- Name: automation_approvals automation_approvals_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_approvals
    ADD CONSTRAINT automation_approvals_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: automation_executions automation_executions_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_executions
    ADD CONSTRAINT automation_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.automation_workflows(id) ON DELETE CASCADE;


--
-- Name: automation_executions automation_executions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_executions
    ADD CONSTRAINT automation_executions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: automation_workflows automation_workflows_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_workflows
    ADD CONSTRAINT automation_workflows_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: automation_workflows automation_workflows_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_workflows
    ADD CONSTRAINT automation_workflows_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: brands brands_avatar_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_avatar_media_id_fkey FOREIGN KEY (avatar_media_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: brands brands_cover_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_cover_media_id_fkey FOREIGN KEY (cover_media_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: brands brands_logo_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_logo_media_id_fkey FOREIGN KEY (logo_media_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: brands brands_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: content_categories content_categories_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.content_categories
    ADD CONSTRAINT content_categories_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: drive_connections drive_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drive_connections
    ADD CONSTRAINT drive_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: drive_connections drive_connections_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drive_connections
    ADD CONSTRAINT drive_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: drive_imports drive_imports_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drive_imports
    ADD CONSTRAINT drive_imports_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.drive_connections(id) ON DELETE CASCADE;


--
-- Name: drive_imports drive_imports_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drive_imports
    ADD CONSTRAINT drive_imports_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: drive_imports drive_imports_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drive_imports
    ADD CONSTRAINT drive_imports_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: media_assets media_assets_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;


--
-- Name: media_assets media_assets_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: media_assets media_assets_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: oauth_attempts oauth_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oauth_attempts
    ADD CONSTRAINT oauth_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: post_events post_events_post_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_events
    ADD CONSTRAINT post_events_post_target_id_fkey FOREIGN KEY (post_target_id) REFERENCES public.post_targets(id) ON DELETE CASCADE;


--
-- Name: post_targets post_targets_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_targets
    ADD CONSTRAINT post_targets_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_targets post_targets_social_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_targets
    ADD CONSTRAINT post_targets_social_account_id_fkey FOREIGN KEY (social_account_id) REFERENCES public.social_accounts(id);


--
-- Name: post_targets post_targets_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.post_targets
    ADD CONSTRAINT post_targets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: posts posts_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;


--
-- Name: posts posts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: posts posts_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: posts posts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: posts posts_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE SET NULL;


--
-- Name: posts posts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: projects projects_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;


--
-- Name: projects projects_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: social_accounts social_accounts_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_accounts
    ADD CONSTRAINT social_accounts_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;


--
-- Name: social_accounts social_accounts_connected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_accounts
    ADD CONSTRAINT social_accounts_connected_by_fkey FOREIGN KEY (connected_by) REFERENCES public.users(id);


--
-- Name: social_accounts social_accounts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_accounts
    ADD CONSTRAINT social_accounts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: system_settings system_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: upload_session_chunks upload_session_chunks_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.upload_session_chunks
    ADD CONSTRAINT upload_session_chunks_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.upload_sessions(id) ON DELETE CASCADE;


--
-- Name: upload_sessions upload_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: upload_sessions upload_sessions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: users users_avatar_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_avatar_media_id_fkey FOREIGN KEY (avatar_media_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: videos videos_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;


--
-- Name: videos videos_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.content_categories(id) ON DELETE SET NULL;


--
-- Name: videos videos_media_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_media_asset_id_fkey FOREIGN KEY (media_asset_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: videos videos_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_assets(id) ON DELETE SET NULL;


--
-- Name: videos videos_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: videos videos_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_invitations workspace_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id);


--
-- Name: workspace_invitations workspace_invitations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT workspace_invitations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_kv workspace_kv_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_kv
    ADD CONSTRAINT workspace_kv_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id);


--
-- Name: workspace_members workspace_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspaces workspaces_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict b0Ijxv4SRi1DCjYMgykzEbaB6vTBDopPIOy4FnbVPsxGb772bxSfUezhhYYcXae

