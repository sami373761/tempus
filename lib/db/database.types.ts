/**
 * Shape of the `public` schema, in the format emitted by
 * `supabase gen types typescript`.
 *
 * Regenerate after every migration:  npm run db:types
 * Do not hand-edit beyond that — it is meant to track the database exactly.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      locale: {
        Row: {
          code: string;
          name: string;
          english_name: string;
          fallback_code: string | null;
          is_active: boolean;
          sort_order: number;
        };
        Insert: {
          code: string;
          name: string;
          english_name: string;
          fallback_code?: string | null;
          is_active?: boolean;
          sort_order?: number;
        };
        Update: {
          code?: string;
          name?: string;
          english_name?: string;
          fallback_code?: string | null;
          is_active?: boolean;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "locale_fallback_code_fkey";
            columns: ["fallback_code"];
            isOneToOne: false;
            referencedRelation: "locale";
            referencedColumns: ["code"];
          },
        ];
      };
      event: {
        Row: {
          id: string;
          slug: string;
          year: number;
          month: number | null;
          day: number | null;
          precision: Database["public"]["Enums"]["date_precision"];
          sort_key: number;
          status: Database["public"]["Enums"]["publication_status"];
          is_sensitive: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          year: number;
          month?: number | null;
          day?: number | null;
          precision?: Database["public"]["Enums"]["date_precision"];
          status?: Database["public"]["Enums"]["publication_status"];
          is_sensitive?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          year?: number;
          month?: number | null;
          day?: number | null;
          precision?: Database["public"]["Enums"]["date_precision"];
          status?: Database["public"]["Enums"]["publication_status"];
          is_sensitive?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      event_translation: {
        Row: {
          event_id: string;
          locale_code: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          event_id: string;
          locale_code: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          event_id?: string;
          locale_code?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_translation_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_translation_locale_code_fkey";
            columns: ["locale_code"];
            isOneToOne: false;
            referencedRelation: "locale";
            referencedColumns: ["code"];
          },
        ];
      };
      category: {
        Row: {
          id: string;
          slug: string;
          kind: Database["public"]["Enums"]["category_kind"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          kind?: Database["public"]["Enums"]["category_kind"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          kind?: Database["public"]["Enums"]["category_kind"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      category_translation: {
        Row: {
          category_id: string;
          locale_code: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          category_id: string;
          locale_code: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string;
          locale_code?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "category_translation_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "category_translation_locale_code_fkey";
            columns: ["locale_code"];
            isOneToOne: false;
            referencedRelation: "locale";
            referencedColumns: ["code"];
          },
        ];
      };
      event_category: {
        Row: {
          event_id: string;
          category_id: string;
          created_at: string;
        };
        Insert: {
          event_id: string;
          category_id: string;
          created_at?: string;
        };
        Update: {
          event_id?: string;
          category_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_category_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_category_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category";
            referencedColumns: ["id"];
          },
        ];
      };
      license: {
        Row: {
          code: string;
          name: string;
          url: string | null;
          requires_attribution: boolean;
          allows_commercial: boolean;
          sort_order: number;
        };
        Insert: {
          code: string;
          name: string;
          url?: string | null;
          requires_attribution?: boolean;
          allows_commercial?: boolean;
          sort_order?: number;
        };
        Update: {
          code?: string;
          name?: string;
          url?: string | null;
          requires_attribution?: boolean;
          allows_commercial?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      image: {
        Row: {
          id: string;
          event_id: string;
          is_primary: boolean;
          r2_bucket: string;
          r2_object_key: string;
          mime_type: string;
          byte_size: number | null;
          width: number | null;
          height: number | null;
          checksum_sha256: string | null;
          source_name: string | null;
          source_page_url: string;
          author: string | null;
          license_code: string;
          attribution_text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          is_primary?: boolean;
          r2_bucket: string;
          r2_object_key: string;
          mime_type: string;
          byte_size?: number | null;
          width?: number | null;
          height?: number | null;
          checksum_sha256?: string | null;
          source_name?: string | null;
          source_page_url: string;
          author?: string | null;
          license_code: string;
          attribution_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          is_primary?: boolean;
          r2_bucket?: string;
          r2_object_key?: string;
          mime_type?: string;
          byte_size?: number | null;
          width?: number | null;
          height?: number | null;
          checksum_sha256?: string | null;
          source_name?: string | null;
          source_page_url?: string;
          author?: string | null;
          license_code?: string;
          attribution_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "image_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "image_license_code_fkey";
            columns: ["license_code"];
            isOneToOne: false;
            referencedRelation: "license";
            referencedColumns: ["code"];
          },
        ];
      };
      match: {
        Row: {
          id: string;
          code: string;
          mode: string;
          phase: Database["public"]["Enums"]["match_phase"];
          generation: number;
          total_rounds: number;
          round_seconds: number;
          reveal_seconds: number;
          current_idx: number;
          round_started_at: string | null;
          round_deadline_at: string | null;
          reveal_until_at: string | null;
          answered_count: number;
          seat1_joined: boolean;
          seat2_joined: boolean;
          seat1_ready: boolean;
          seat2_ready: boolean;
          seat1_score: number;
          seat2_score: number;
          history: Json;
          rematch_by: number | null;
          rematch_declined_by: number | null;
          version: number;
          created_at: string;
          updated_at: string;
          /** Online matchmaking match (history mode only). No rematch. */
          is_public: boolean;
          /** Matchmaking league of the host, set once the lobby is dealt. Not granted to clients. */
          public_tier: number | null;
          /** Display names; null is a guest. Public matches only. */
          seat1_name: string | null;
          seat2_name: string | null;
          /** Chrono Rating snapshot at seating; null is a guest. */
          seat1_rating: number | null;
          seat2_rating: number | null;
          /** Rating change applied when the match settled; null for a guest. */
          seat1_rating_delta: number | null;
          seat2_rating_delta: number | null;
          /** The seat that forfeited a started public match, if any. */
          forfeit_seat: number | null;
        };
        Insert: {
          id?: string;
          code: string;
          mode?: string;
          phase?: Database["public"]["Enums"]["match_phase"];
          generation?: number;
          total_rounds: number;
          round_seconds: number;
          reveal_seconds: number;
          current_idx?: number;
          round_started_at?: string | null;
          round_deadline_at?: string | null;
          reveal_until_at?: string | null;
          answered_count?: number;
          seat1_joined?: boolean;
          seat2_joined?: boolean;
          seat1_ready?: boolean;
          seat2_ready?: boolean;
          seat1_score?: number;
          seat2_score?: number;
          history?: Json;
          rematch_by?: number | null;
          rematch_declined_by?: number | null;
          version?: number;
          created_at?: string;
          updated_at?: string;
          is_public?: boolean;
          public_tier?: number | null;
          seat1_name?: string | null;
          seat2_name?: string | null;
          seat1_rating?: number | null;
          seat2_rating?: number | null;
          seat1_rating_delta?: number | null;
          seat2_rating_delta?: number | null;
          forfeit_seat?: number | null;
        };
        Update: {
          mode?: string;
          phase?: Database["public"]["Enums"]["match_phase"];
          generation?: number;
          current_idx?: number;
          round_started_at?: string | null;
          round_deadline_at?: string | null;
          reveal_until_at?: string | null;
          answered_count?: number;
          seat1_joined?: boolean;
          seat2_joined?: boolean;
          seat1_ready?: boolean;
          seat2_ready?: boolean;
          seat1_score?: number;
          seat2_score?: number;
          history?: Json;
          rematch_by?: number | null;
          rematch_declined_by?: number | null;
          public_tier?: number | null;
          seat1_name?: string | null;
          seat2_name?: string | null;
          seat1_rating?: number | null;
          seat2_rating?: number | null;
          forfeit_seat?: number | null;
        };
        Relationships: [];
      };
      match_player: {
        Row: {
          match_id: string;
          seat: number;
          token_hash: string;
          created_at: string;
          last_seen_at: string;
          /** The account that took the seat, if signed in. Read by the TP trigger. */
          user_id: string | null;
          /** A bot's archetype (lib/game/versus-bot.ts); null for a person. Never client-readable. */
          bot_archetype: string | null;
          /** A bot's level, 1-3; null for a person. Never client-readable. */
          bot_level: number | null;
          /** A public lobby host's just-finished public match (the back-to-back rule). */
          prev_match_id: string | null;
          /** For the host of a lobby closed by a merge: the match it was moved into. */
          moved_to: string | null;
        };
        Insert: {
          match_id: string;
          seat: number;
          token_hash: string;
          created_at?: string;
          last_seen_at?: string;
          user_id?: string | null;
          bot_archetype?: string | null;
          bot_level?: number | null;
          prev_match_id?: string | null;
          moved_to?: string | null;
        };
        Update: {
          token_hash?: string;
          last_seen_at?: string;
          user_id?: string | null;
          prev_match_id?: string | null;
          moved_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "match_player_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "match";
            referencedColumns: ["id"];
          },
        ];
      };
      match_round: {
        Row: {
          match_id: string;
          generation: number;
          idx: number;
          event_id: string;
          /** The bot seat's planned answer for this round; null without a bot. */
          bot_guess: number | null;
          bot_verdict: string | null;
          bot_points: number | null;
          /** Milliseconds after round_started_at the bot locks in. */
          bot_think_ms: number | null;
          /** round_started_at + bot_think_ms, stamped when the round starts. */
          bot_commit_at: string | null;
        };
        Insert: {
          match_id: string;
          generation: number;
          idx: number;
          event_id: string;
          bot_guess?: number | null;
          bot_verdict?: string | null;
          bot_points?: number | null;
          bot_think_ms?: number | null;
          bot_commit_at?: string | null;
        };
        Update: {
          event_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_round_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "match";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_round_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
        ];
      };
      match_answer: {
        Row: {
          match_id: string;
          generation: number;
          idx: number;
          seat: number;
          guess: number;
          verdict: string;
          points: number;
          elapsed_ms: number;
          answered_at: string;
        };
        Insert: {
          match_id: string;
          generation: number;
          idx: number;
          seat: number;
          guess: number;
          verdict: string;
          points: number;
          elapsed_ms: number;
          answered_at?: string;
        };
        Update: Record<never, never>;
        Relationships: [
          {
            foreignKeyName: "match_answer_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "match";
            referencedColumns: ["id"];
          },
        ];
      };
      event_date_challenge: {
        Row: {
          id: string;
          event_id: string;
          /** +1 the real date is later than the stored year, -1 earlier. */
          direction: number;
          locale_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          direction: number;
          locale_code?: string | null;
          created_at?: string;
        };
        Update: {
          direction?: number;
          locale_code?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_date_challenge_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_date_challenge_locale_code_fkey";
            columns: ["locale_code"];
            isOneToOne: false;
            referencedRelation: "locale";
            referencedColumns: ["code"];
          },
        ];
      };
      profile: {
        Row: {
          id: string;
          /** Null until the player picks one — see normalize_username(). */
          username: string | null;
          /** Null: show the highest earned badge. Service role writes only. */
          worn_badge: string | null;
          /** True: the player took their badge off. Service role writes only. */
          badge_off: boolean;
          /** R2 key under user_profile_pictures/, or null. Service role writes only. */
          avatar_key: string | null;
          /** Online 1v1 Chrono Rating (KP), floor 0. Written only by versus_settle_rating(). */
          chrono_rating: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          worn_badge?: string | null;
          badge_off?: boolean;
          avatar_key?: string | null;
          chrono_rating?: number;
          created_at?: string;
          updated_at?: string;
        };
        /**
         * `username` is the only column granted to `authenticated`;
         * `worn_badge` is written by the service role.
         */
        Update: {
          username?: string | null;
          worn_badge?: string | null;
          badge_off?: boolean;
          avatar_key?: string | null;
        };
        Relationships: [];
      };
      badge: {
        Row: {
          slug: string;
          sort_order: number;
          default_target: number;
          is_rank: boolean;
        };
        Insert: {
          slug: string;
          sort_order: number;
          default_target: number;
          is_rank?: boolean;
        };
        Update: {
          sort_order?: number;
          default_target?: number;
          is_rank?: boolean;
        };
        Relationships: [];
      };
      user_badge_progress: {
        Row: {
          user_id: string;
          badge_slug: string;
          progress: number;
          target: number;
          unlocked_at: string | null;
          details: Json;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          badge_slug: string;
          progress?: number;
          target: number;
          unlocked_at?: string | null;
          details?: Json;
          updated_at?: string;
        };
        Update: {
          progress?: number;
          target?: number;
          unlocked_at?: string | null;
          details?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "user_badge_progress_badge_slug_fkey";
            columns: ["badge_slug"];
            isOneToOne: false;
            referencedRelation: "badge";
            referencedColumns: ["slug"];
          },
        ];
      };
      daily_challenge: {
        Row: {
          puzzle_date: string;
          audience: Database["public"]["Enums"]["daily_audience"];
          event_ids: string[];
          created_at: string;
        };
        Insert: {
          puzzle_date: string;
          audience: Database["public"]["Enums"]["daily_audience"];
          event_ids: string[];
          created_at?: string;
        };
        Update: {
          puzzle_date?: string;
          audience?: Database["public"]["Enums"]["daily_audience"];
          event_ids?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
      daily_attempt: {
        Row: {
          user_id: string;
          puzzle_date: string;
          answers: Json;
          points: number;
          hits: number;
          started_at: string;
          completed_at: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          puzzle_date: string;
          answers?: Json;
          points?: number;
          hits?: number;
          started_at?: string;
          completed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          puzzle_date?: string;
          answers?: Json;
          points?: number;
          hits?: number;
          started_at?: string;
          completed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      score_entry: {
        Row: {
          id: number;
          user_id: string;
          game: string;
          kind: string;
          source: string;
          tp: number;
          opponent_id: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          game: string;
          kind: string;
          source: string;
          tp: number;
          opponent_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      solo_set: {
        Row: {
          id: string;
          user_id: string;
          game: string;
          kind: string;
          answered: number;
          correct: number;
          perfects: number;
          top_tier: number;
          tp: number;
          created_at: string;
          closed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      solo_answer: {
        Row: {
          round_id: string;
          set_id: string;
          user_id: string;
          game: string;
          event_id: string;
          verdict: string;
          correct: boolean;
          tp: number;
          answered_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      chrono_rating_entry: {
        Row: {
          user_id: string;
          match_id: string;
          /** The other account, or null for a guest or a bot. */
          opponent_id: string | null;
          /** The opponent was shown as a guest (a guest, or a bot posing as one). */
          opponent_guest: boolean;
          outcome: string;
          /** The change actually applied (after the floor at 0). */
          delta: number;
          rating_before: number;
          rating_after: number;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      reserved_username: {
        Row: {
          /** A name a bot has been seated under; no account may take it. */
          username: string;
          created_at: string;
        };
        /** Written only by versus_seat_bot(). */
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      event_challenge_stats: {
        Row: {
          event_id: string;
          slug: string;
          year: number;
          status: Database["public"]["Enums"]["publication_status"];
          later_votes: number;
          earlier_votes: number;
          total_votes: number;
          /** later_votes - earlier_votes. What the admin list sorts on. */
          score: number;
          last_challenged_at: string | null;
        };
        Relationships: [];
      };
      event_localized: {
        Row: {
          event_id: string;
          slug: string;
          year: number;
          month: number | null;
          day: number | null;
          precision: Database["public"]["Enums"]["date_precision"];
          sort_key: number;
          status: Database["public"]["Enums"]["publication_status"];
          year_label: string;
          locale_code: string;
          name: string;
          description: string | null;
          image_id: string | null;
          image_bucket: string | null;
          image_object_key: string | null;
          image_mime_type: string | null;
          image_width: number | null;
          image_height: number | null;
          image_source_name: string | null;
          image_source_page_url: string | null;
          image_author: string | null;
          image_license_code: string | null;
          image_attribution_text: string | null;
          is_sensitive: boolean;
        };
        Relationships: [];
      };
    };
    Functions: {
      bank_solo_round: {
        Args: {
          p_user_id: string;
          p_set_id: string;
          p_game: string;
          p_round_id: string;
          p_event_id: string;
          p_verdict: string;
          p_correct: boolean;
          p_tp: number;
          p_set_size: number;
        };
        Returns: Json;
      };
      player_stats: {
        Args: { p_user_id: string };
        Returns: Json;
      };
      shown_badge: {
        Args: { p_user_id: string };
        Returns: string | null;
      };
      leaderboard: {
        Args: { p_since?: string | null; p_limit?: number };
        Returns: {
          rank: number;
          username: string;
          badge_slug: string | null;
          avatar_key: string | null;
          tp: number;
          perfects: number;
        }[];
      };
      leaderboard_position: {
        Args: { p_user_id: string; p_since?: string | null };
        Returns: { rank: number; tp: number }[];
      };
      chrono_leaderboard: {
        Args: { p_limit?: number };
        Returns: {
          rank: number;
          username: string;
          badge_slug: string | null;
          avatar_key: string | null;
          rating: number;
          wins: number;
          matches: number;
        }[];
      };
      chrono_leaderboard_position: {
        Args: { p_user_id: string };
        Returns: { rank: number; rating: number }[];
      };
      array_is_distinct: {
        Args: { ids: string[] };
        Returns: boolean;
      };
      daily_ensure_challenges: {
        Args: {
          p_puzzle_date: string;
          p_member: string[];
          p_guest: string[];
        };
        Returns: Database["public"]["Tables"]["daily_challenge"]["Row"][];
      };
      daily_record_answer: {
        Args: {
          p_user_id: string;
          p_puzzle_date: string;
          p_idx: number;
          p_guess: number;
          p_year: number;
          p_verdict: string;
          p_points: number;
          p_hit: boolean;
          p_total: number;
        };
        Returns: Database["public"]["Tables"]["daily_attempt"]["Row"];
      };
      normalize_username: {
        Args: { raw: string };
        Returns: string | null;
      };
      historical_year_label: {
        Args: { p_year: number };
        Returns: string;
      };
      random_events: {
        Args: {
          p_count: number;
          p_locales: string[];
          p_from_year?: number | null;
          p_to_year?: number | null;
          p_distinct_years?: boolean;
          p_require_image?: boolean;
          p_topic_slug?: string | null;
          p_all_pools?: boolean;
          p_exclude?: string[] | null;
        };
        Returns: Database["public"]["Views"]["event_localized"]["Row"][];
      };
      versus_db_now: {
        Args: Record<string, never>;
        Returns: string;
      };
      versus_reconcile: {
        Args: { p_match_id: string };
        Returns: Database["public"]["Tables"]["match"]["Row"];
      };
      versus_set_ready: {
        Args: { p_match_id: string; p_seat: number; p_ready: boolean };
        Returns: Database["public"]["Tables"]["match"]["Row"];
      };
      versus_submit: {
        Args: {
          p_match_id: string;
          p_seat: number;
          p_idx: number;
          p_guess: number;
          p_verdict: string;
          p_points: number;
          p_elapsed_ms: number;
        };
        Returns: {
          result: string;
          match_row: Database["public"]["Tables"]["match"]["Row"];
        };
      };
      versus_request_rematch: {
        Args: { p_match_id: string; p_seat: number };
        Returns: Database["public"]["Tables"]["match"]["Row"];
      };
      versus_start_rematch: {
        Args: { p_match_id: string };
        Returns: Database["public"]["Tables"]["match"]["Row"];
      };
      versus_decline_rematch: {
        Args: { p_match_id: string; p_seat: number };
        Returns: Database["public"]["Tables"]["match"]["Row"];
      };
      versus_sweep: {
        Args: { p_older_than?: string };
        Returns: number;
      };
      chrono_tier: {
        Args: { p_rating: number | null };
        Returns: number;
      };
      chrono_delta: {
        Args: { p_rating: number; p_outcome: string };
        Returns: number;
      };
      versus_matchmake: {
        Args: {
          p_own_match: string | null;
          p_user_id: string | null;
          p_rating: number | null;
          p_name: string | null;
          p_token_hash: string;
          p_intro_seconds: number;
          p_fresh_seconds: number;
          p_near_rating: number;
          p_avoid_match: string | null;
          p_host_seen_ms: number;
        };
        /** { status: 'joined', match_id, code } | { status: 'matched' | 'gone' | 'none' } */
        Returns: Json;
      };
      versus_publish_lobby: {
        Args: { p_match_id: string };
        Returns: boolean;
      };
      versus_seat_bot: {
        Args: {
          p_match_id: string;
          p_token_hash: string;
          p_archetype: string;
          p_level: number;
          p_name: string | null;
          p_rating: number | null;
          p_moves: Json;
          p_min_wait_ms: number;
          p_intro_seconds: number;
        };
        /** 'seated' | 'matched' | 'early' | 'gone' */
        Returns: string;
      };
      versus_abandon: {
        Args: { p_match_id: string; p_seat: number };
        Returns: Database["public"]["Tables"]["match"]["Row"];
      };
      versus_forfeit_user: {
        Args: { p_user_id: string; p_except_match: string | null };
        Returns: number;
      };
    };
    Enums: {
      date_precision:
        | "day"
        | "month"
        | "year"
        | "decade"
        | "century"
        | "millennium";
      publication_status: "draft" | "review" | "published" | "archived";
      category_kind: "topic" | "region" | "era" | "other";
      daily_audience: "member" | "guest";
      match_phase:
        | "lobby"
        | "playing"
        | "revealed"
        | "complete"
        | "abandoned";
    };
    CompositeTypes: Record<never, never>;
  };
};
