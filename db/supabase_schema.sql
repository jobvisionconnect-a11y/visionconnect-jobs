-- VisionConnect Job Portal — Supabase (PostgreSQL) Schema
-- This schema includes Row Level Security (RLS) policies for data isolation.

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('seeker', 'employer', 'admin')),
    name TEXT NOT NULL,
    is_approved BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PROFILES TABLE (Seekers)
CREATE TABLE IF NOT EXISTS profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    skills TEXT,
    education TEXT,
    disability_type TEXT,
    phone TEXT,
    location TEXT,
    resume_path TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 3. JOBS TABLE
CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    employer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    job_type TEXT NOT NULL,
    description TEXT NOT NULL,
    requirements TEXT,
    salary_range TEXT,
    accessibility_features TEXT,
    is_approved BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. APPLICATIONS TABLE
CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    seeker_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'applied' CHECK (status IN ('applied', 'reviewed', 'shortlisted', 'rejected', 'hired')),
    cover_letter TEXT,
    is_quick_apply BOOLEAN DEFAULT FALSE,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SAVED JOBS TABLE (New Feature)
CREATE TABLE IF NOT EXISTS saved_jobs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, job_id)
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_jobs ENABLE ROW LEVEL SECURITY;

-- 1. USERS POLICIES
-- Allow anonymous users to Register (INSERT)
CREATE POLICY "Enable registration for anonymous users" ON users 
FOR INSERT TO anon WITH CHECK (true);

-- Allow users to see their own record (mostly for auth checks via service role, but good practice)
-- Note: 'anon' role can select to check if email exists during registration
CREATE POLICY "Enable select for email checking" ON users
FOR SELECT TO anon USING (true);

-- 2. PROFILES POLICIES
-- Allow profile creation during registration
CREATE POLICY "Enable profile creation for anonymous seekers" ON profiles
FOR INSERT TO anon WITH CHECK (true);

-- Allow users to manage their own profile (requires auth.uid() if using Supabase Auth)
-- For this Express app, we usually use the Service Role, but we can set this for future-proofing:
CREATE POLICY "Profiles are manageable by owners" ON profiles
FOR ALL TO authenticated USING (auth.uid()::text = user_id::text);

-- 3. JOBS POLICIES
-- Everyone (including anon) can see approved and active jobs
CREATE POLICY "Anyone can view approved jobs" ON jobs
FOR SELECT TO anon, authenticated USING (is_approved = true AND is_active = true);

-- Employers manage their own (if using Supabase Auth)
CREATE POLICY "Employers manage their own jobs" ON jobs
FOR ALL TO authenticated USING (auth.uid()::text = employer_id::text);

-- 4. APPLICATIONS & SAVED JOBS
-- (Similarly, these policies work best with Supabase Auth)
CREATE POLICY "Seekers see their own applications" ON applications
FOR SELECT TO authenticated USING (auth.uid()::text = seeker_id::text);

CREATE POLICY "Users manage their own saved jobs" ON saved_jobs
FOR ALL TO authenticated USING (auth.uid()::text = user_id::text);

