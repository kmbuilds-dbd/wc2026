import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";

// ── Users ────────────────────────────────────────────────────────────────
// Lazy-created on first authenticated request after CF Access auth.
export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  avatarEmoji: text("avatar_emoji"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

// ── Teams ────────────────────────────────────────────────────────────────
// Seeded once from teams.json + api-sports/teams.
export const teams = sqliteTable(
  "teams",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    flag: text("flag"),
    groupLetter: text("group_letter").notNull(),
    coach: text("coach"),
    // Raw squad + metadata for the /teams page render (mirrors compact keys
    // from the existing wc2026_worker teams.json).
    apiSportsData: text("api_sports_data", { mode: "json" }),
  },
  (t) => [index("teams_group_idx").on(t.groupLetter)],
);

// ── Matches ──────────────────────────────────────────────────────────────
// Synced from api-sports/fixtures at season start; updated by ingest cron.
export const matches = sqliteTable(
  "matches",
  {
    id: integer("id").primaryKey(),
    stage: text("stage", { enum: ["group", "r32", "r16", "qf", "sf", "final", "3p"] }).notNull(),
    groupLetter: text("group_letter"),
    homeTeamId: integer("home_team_id").references(() => teams.id),
    awayTeamId: integer("away_team_id").references(() => teams.id),
    kickoffUtc: integer("kickoff_utc").notNull(),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    status: text("status", { enum: ["scheduled", "live", "finished"] }).notNull(),
    ingestedAt: integer("ingested_at"),
    rawEvents: text("raw_events", { mode: "json" }),
  },
  (t) => [
    index("matches_kickoff_idx").on(t.kickoffUtc),
    index("matches_stage_status_idx").on(t.stage, t.status),
  ],
);

// ── Lineup picks (one row per user × round × position) ──────────────────
export const lineupPicks = sqliteTable(
  "lineup_picks",
  {
    userEmail: text("user_email").notNull().references(() => users.email),
    round: text("round", { enum: ["r32", "r16", "qf", "sf", "final"] }).notNull(),
    position: text("position", { enum: ["GK", "DEF", "MID", "FWD"] }).notNull(),
    playerId: integer("player_id").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userEmail, t.round, t.position] })],
);

// ── Group picks: 1st & 2nd per group ────────────────────────────────────
export const groupPicks = sqliteTable(
  "group_picks",
  {
    userEmail: text("user_email").notNull().references(() => users.email),
    groupLetter: text("group_letter").notNull(),
    rank: integer("rank").notNull(), // 1 or 2
    teamId: integer("team_id").notNull().references(() => teams.id),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userEmail, t.groupLetter, t.rank] })],
);

// ── Wildcard picks: 8 best-3rd teams ────────────────────────────────────
export const wildcardPicks = sqliteTable(
  "wildcard_picks",
  {
    userEmail: text("user_email").notNull().references(() => users.email),
    slot: integer("slot").notNull(), // 1..8
    teamId: integer("team_id").notNull().references(() => teams.id),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userEmail, t.slot] })],
);

// ── Bracket picks: winner of each KO match slot ─────────────────────────
// matchSlot examples: 'r32-1'..'r32-16', 'r16-1'..'r16-8', 'qf-1'..'qf-4',
// 'sf-1', 'sf-2', 'final'.
export const bracketPicks = sqliteTable(
  "bracket_picks",
  {
    userEmail: text("user_email").notNull().references(() => users.email),
    matchSlot: text("match_slot").notNull(),
    teamId: integer("team_id").notNull().references(() => teams.id),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userEmail, t.matchSlot] })],
);

// ── Tournament-level picks ──────────────────────────────────────────────
export const tournamentPicks = sqliteTable("tournament_picks", {
  userEmail: text("user_email").primaryKey().references(() => users.email),
  winnerTeamId: integer("winner_team_id").references(() => teams.id),
  topScorerPlayerId: integer("top_scorer_player_id"),
  goldenGlovePlayerId: integer("golden_glove_player_id"),
  updatedAt: integer("updated_at").notNull(),
});

// ── Scores: idempotent — one row per (user, category, key) ──────────────
// Re-running the scoring engine produces the same rows.
export const scores = sqliteTable(
  "scores",
  {
    userEmail: text("user_email").notNull().references(() => users.email),
    // 'group' | 'wildcard' | 'bracket' | 'lineup' | 'tournament'
    category: text("category").notNull(),
    // e.g. 'group:A:1', 'bracket:qf-3', 'lineup:r16:FWD', 'tournament:winner'
    key: text("key").notNull(),
    points: integer("points").notNull(),
    computedAt: integer("computed_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userEmail, t.category, t.key] }),
    index("scores_user_idx").on(t.userEmail),
  ],
);

// ── Odds snapshots: daily refresh, history retained ─────────────────────
// market examples: 'tournament_winner', 'top_scorer', 'group_winner:A'..
export const oddsSnapshots = sqliteTable(
  "odds_snapshots",
  {
    market: text("market").notNull(),
    snapshotAt: integer("snapshot_at").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.market, t.snapshotAt] })],
);

// ── Type exports ────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type LineupPick = typeof lineupPicks.$inferSelect;
export type GroupPick = typeof groupPicks.$inferSelect;
export type WildcardPick = typeof wildcardPicks.$inferSelect;
export type BracketPick = typeof bracketPicks.$inferSelect;
export type TournamentPick = typeof tournamentPicks.$inferSelect;
export type Score = typeof scores.$inferSelect;
export type OddsSnapshot = typeof oddsSnapshots.$inferSelect;
