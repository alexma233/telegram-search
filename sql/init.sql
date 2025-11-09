-- Enable pgvector compatibility mode for pgvecto.rs
ALTER SYSTEM SET vectors.pgvector_compatibility=on;

-- Reload configuration to apply the setting
SELECT pg_reload_conf();

-- Drop existing extension if any
DROP EXTENSION IF EXISTS vectors CASCADE;

-- Create the vectors extension
CREATE EXTENSION IF NOT EXISTS vectors;

-- Verify the extension is installed
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vectors') THEN
        RAISE EXCEPTION 'Failed to create vectors extension';
    END IF;
    RAISE NOTICE 'vectors extension successfully installed';
END
$$;
