/**
 * Outcome of checking a TMDB API key against TMDB itself.
 *
 * "rejected" and "unreachable" are kept apart because they ask different
 * things of the user: fix the key, or try again later.
 */
export type TmdbKeyCheck = "valid" | "rejected" | "unreachable"
