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
        };
        Insert: {
          id?: string;
          code: string;
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
        };
        Update: {
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
        };
        Insert: {
          match_id: string;
          seat: number;
          token_hash: string;
          created_at?: string;
          last_seen_at?: string;
        };
        Update: {
          token_hash?: string;
          last_seen_at?: string;
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
        };
        Insert: {
          match_id: string;
          generation: number;
          idx: number;
          event_id: string;
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        /** `username` is the only column granted to `authenticated`. */
        Update: {
          username?: string | null;
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
