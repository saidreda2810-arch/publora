-- WP10: chunk payloads for resumable uploads — makes chunked uploads
-- safe across multiple app instances (chunks were previously local-disk only).
CREATE TABLE IF NOT EXISTS upload_session_chunks (
  session_id  text NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  data        bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, chunk_index)
);
