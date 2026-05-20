/**
 * The Odds API v4 — minimal types covering our usage.
 *
 * We poll one sport (soccer_fifa_world_cup), filter events by name match
 * for the three markets we surface: tournament winner, golden boot, group
 * winners.
 *
 * Docs: https://the-odds-api.com/liveapi/guides/v4/
 */

export interface OddsApiOutcome {
  name: string;     // outcome label (team / player / yes-no)
  price: number;    // decimal odds, e.g. 5.5 = "+450" american
}

export interface OddsApiMarket {
  key: string;      // 'outrights' for our use
  last_update: string;
  outcomes: OddsApiOutcome[];
}

export interface OddsApiBookmaker {
  key: string;      // e.g. 'draftkings', 'fanduel'
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
}

export interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}
