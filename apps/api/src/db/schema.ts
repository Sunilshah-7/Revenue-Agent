// Named constants for the three table names used in raw SQL query strings
// elsewhere in the codebase, so a rename only has to happen in one place
// (SQL strings still have to be updated by hand — there's no query builder
// generating them from this object).
export const tables = {
  documents: "documents",
  documentChunks: "document_chunks",
  sessions: "sessions",
} as const;
