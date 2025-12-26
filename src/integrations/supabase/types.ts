export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          broker: string | null
          created_at: string | null
          currency: string | null
          id: string
          is_default: boolean | null
          name: string
          user_id: string
        }
        Insert: {
          broker?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          user_id: string
        }
        Update: {
          broker?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      attachments: {
        Row: {
          created_at: string | null
          filename: string
          id: string
          kind: Database["public"]["Enums"]["attachment_kind"] | null
          mime_type: string | null
          storage_path: string
          trade_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          filename: string
          id?: string
          kind?: Database["public"]["Enums"]["attachment_kind"] | null
          mime_type?: string | null
          storage_path: string
          trade_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          filename?: string
          id?: string
          kind?: Database["public"]["Enums"]["attachment_kind"] | null
          mime_type?: string | null
          storage_path?: string
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_required: boolean | null
          label: string
          ordering: number | null
          template_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_required?: boolean | null
          label: string
          ordering?: number | null
          template_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_required?: boolean | null
          label?: string
          ordering?: number | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      filter_presets: {
        Row: {
          created_at: string | null
          filters_json: Json
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          filters_json?: Json
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          filters_json?: Json
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      import_mapping_templates: {
        Row: {
          created_at: string | null
          id: string
          mapping_json: Json
          source_name: Database["public"]["Enums"]["import_source_type"]
          template_name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          mapping_json?: Json
          source_name: Database["public"]["Enums"]["import_source_type"]
          template_name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          mapping_json?: Json
          source_name?: Database["public"]["Enums"]["import_source_type"]
          template_name?: string
          user_id?: string
        }
        Relationships: []
      }
      imports: {
        Row: {
          filename: string
          id: string
          imported_at: string | null
          rows_new: number | null
          rows_skipped: number | null
          rows_total: number | null
          source_name: Database["public"]["Enums"]["import_source_type"]
          user_id: string
        }
        Insert: {
          filename: string
          id?: string
          imported_at?: string | null
          rows_new?: number | null
          rows_skipped?: number | null
          rows_total?: number | null
          source_name: Database["public"]["Enums"]["import_source_type"]
          user_id: string
        }
        Update: {
          filename?: string
          id?: string
          imported_at?: string | null
          rows_new?: number | null
          rows_skipped?: number | null
          rows_total?: number | null
          source_name?: Database["public"]["Enums"]["import_source_type"]
          user_id?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          created_at: string | null
          daily_max_loss: number | null
          daily_profit_target: number | null
          date: string
          id: string
          mood: number | null
          post_market: string | null
          pre_market: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          daily_max_loss?: number | null
          daily_profit_target?: number | null
          date: string
          id?: string
          mood?: number | null
          post_market?: string | null
          pre_market?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          daily_max_loss?: number | null
          daily_profit_target?: number | null
          date?: string
          id?: string
          mood?: number | null
          post_market?: string | null
          pre_market?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mistakes: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          severity: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          severity?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          severity?: number | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          default_account_id: string | null
          default_currency: string | null
          display_name: string | null
          email: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_account_id?: string | null
          default_currency?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_account_id?: string | null
          default_currency?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string | null
          date_from: string
          date_to: string
          id: string
          name: string
          report_type: string | null
          storage_path: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date_from: string
          date_to: string
          id?: string
          name: string
          report_type?: string | null
          storage_path?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date_from?: string
          date_to?: string
          id?: string
          name?: string
          report_type?: string | null
          storage_path?: string | null
          user_id?: string
        }
        Relationships: []
      }
      strategies: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      trade_checklist_responses: {
        Row: {
          created_at: string | null
          id: string
          item_id: string
          note: string | null
          trade_id: string
          value: Database["public"]["Enums"]["checklist_value"] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id: string
          note?: string | null
          trade_id: string
          value?: Database["public"]["Enums"]["checklist_value"] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string
          note?: string | null
          trade_id?: string
          value?: Database["public"]["Enums"]["checklist_value"] | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_checklist_responses_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_checklist_responses_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_mistakes: {
        Row: {
          mistake_id: string
          trade_id: string
        }
        Insert: {
          mistake_id: string
          trade_id: string
        }
        Update: {
          mistake_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_mistakes_mistake_id_fkey"
            columns: ["mistake_id"]
            isOneToOne: false
            referencedRelation: "mistakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_mistakes_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_tags: {
        Row: {
          tag_id: string
          trade_id: string
        }
        Insert: {
          tag_id: string
          trade_id: string
        }
        Update: {
          tag_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_tags_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_targets: {
        Row: {
          created_at: string | null
          id: string
          ordering: number | null
          target_price: number
          target_qty: number | null
          trade_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          ordering?: number | null
          target_price: number
          target_qty?: number | null
          trade_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          ordering?: number | null
          target_price?: number
          target_qty?: number | null
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_targets_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          account_id: string | null
          commissions: number | null
          created_at: string | null
          entry_datetime: string
          entry_price: number
          exit_datetime: string | null
          exit_price: number | null
          fees: number | null
          followed_plan: boolean | null
          id: string
          mae: number | null
          mfe: number | null
          notes: string | null
          planned_r_override: number | null
          planned_risk_override: number | null
          quantity: number
          side: Database["public"]["Enums"]["trade_side"]
          source: string | null
          source_trade_id: string | null
          stable_hash: string | null
          stop_loss: number | null
          strategy_id: string | null
          symbol: string
          updated_at: string | null
          user_id: string
          what_to_improve: string | null
          what_went_well: string | null
        }
        Insert: {
          account_id?: string | null
          commissions?: number | null
          created_at?: string | null
          entry_datetime: string
          entry_price: number
          exit_datetime?: string | null
          exit_price?: number | null
          fees?: number | null
          followed_plan?: boolean | null
          id?: string
          mae?: number | null
          mfe?: number | null
          notes?: string | null
          planned_r_override?: number | null
          planned_risk_override?: number | null
          quantity: number
          side: Database["public"]["Enums"]["trade_side"]
          source?: string | null
          source_trade_id?: string | null
          stable_hash?: string | null
          stop_loss?: number | null
          strategy_id?: string | null
          symbol: string
          updated_at?: string | null
          user_id: string
          what_to_improve?: string | null
          what_went_well?: string | null
        }
        Update: {
          account_id?: string | null
          commissions?: number | null
          created_at?: string | null
          entry_datetime?: string
          entry_price?: number
          exit_datetime?: string | null
          exit_price?: number | null
          fees?: number | null
          followed_plan?: boolean | null
          id?: string
          mae?: number | null
          mfe?: number | null
          notes?: string | null
          planned_r_override?: number | null
          planned_risk_override?: number | null
          quantity?: number
          side?: Database["public"]["Enums"]["trade_side"]
          source?: string | null
          source_trade_id?: string | null
          stable_hash?: string | null
          stop_loss?: number | null
          strategy_id?: string | null
          symbol?: string
          updated_at?: string | null
          user_id?: string
          what_to_improve?: string | null
          what_went_well?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trades_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      attachment_kind: "BEFORE" | "AFTER" | "OTHER"
      checklist_value: "YES" | "NO" | "NA"
      import_source_type: "ThinkOrSwim" | "TraderVue" | "Custom"
      trade_side: "LONG" | "SHORT"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      attachment_kind: ["BEFORE", "AFTER", "OTHER"],
      checklist_value: ["YES", "NO", "NA"],
      import_source_type: ["ThinkOrSwim", "TraderVue", "Custom"],
      trade_side: ["LONG", "SHORT"],
    },
  },
} as const
