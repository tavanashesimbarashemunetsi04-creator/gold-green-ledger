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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cash_advance: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          card_last4: string
          code: string | null
          created_at: string
          date: string
          id: string
          id_number: string
          name: string
          phone_number: string | null
          signature_url: string
          status: Database["public"]["Enums"]["tx_record_status"]
          transaction_type: Database["public"]["Enums"]["cash_tx_type"]
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          card_last4: string
          code?: string | null
          created_at?: string
          date: string
          id?: string
          id_number: string
          name: string
          phone_number?: string | null
          signature_url: string
          status?: Database["public"]["Enums"]["tx_record_status"]
          transaction_type: Database["public"]["Enums"]["cash_tx_type"]
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          card_last4?: string
          code?: string | null
          created_at?: string
          date?: string
          id?: string
          id_number?: string
          name?: string
          phone_number?: string | null
          signature_url?: string
          status?: Database["public"]["Enums"]["tx_record_status"]
          transaction_type?: Database["public"]["Enums"]["cash_tx_type"]
        }
        Relationships: []
      }
      cash_swipes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          card_last4: string
          code: string | null
          created_at: string
          date: string
          id: string
          id_number: string
          name: string
          phone_number: string | null
          signature_url: string
          status: Database["public"]["Enums"]["tx_record_status"]
          transaction_type: Database["public"]["Enums"]["cash_tx_type"]
          usd_amount: number | null
          zwg_amount: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          card_last4: string
          code?: string | null
          created_at?: string
          date: string
          id?: string
          id_number: string
          name: string
          phone_number?: string | null
          signature_url: string
          status?: Database["public"]["Enums"]["tx_record_status"]
          transaction_type: Database["public"]["Enums"]["cash_tx_type"]
          usd_amount?: number | null
          zwg_amount?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          card_last4?: string
          code?: string | null
          created_at?: string
          date?: string
          id?: string
          id_number?: string
          name?: string
          phone_number?: string | null
          signature_url?: string
          status?: Database["public"]["Enums"]["tx_record_status"]
          transaction_type?: Database["public"]["Enums"]["cash_tx_type"]
          usd_amount?: number | null
          zwg_amount?: number | null
        }
        Relationships: []
      }
      internal_transactions: {
        Row: {
          amount: number
          created_at: string
          date: string
          id: string
          initiating_teller_id: string
          initiator_decision: Database["public"]["Enums"]["decision"]
          receiver_decision: Database["public"]["Enums"]["decision"]
          request_type: Database["public"]["Enums"]["request_type"]
          status: Database["public"]["Enums"]["tx_status"]
          target_teller_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          date: string
          id?: string
          initiating_teller_id: string
          initiator_decision?: Database["public"]["Enums"]["decision"]
          receiver_decision?: Database["public"]["Enums"]["decision"]
          request_type: Database["public"]["Enums"]["request_type"]
          status?: Database["public"]["Enums"]["tx_status"]
          target_teller_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          id?: string
          initiating_teller_id?: string
          initiator_decision?: Database["public"]["Enums"]["decision"]
          receiver_decision?: Database["public"]["Enums"]["decision"]
          request_type?: Database["public"]["Enums"]["request_type"]
          status?: Database["public"]["Enums"]["tx_status"]
          target_teller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_transactions_initiating_teller_id_fkey"
            columns: ["initiating_teller_id"]
            isOneToOne: false
            referencedRelation: "tellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_transactions_target_teller_id_fkey"
            columns: ["target_teller_id"]
            isOneToOne: false
            referencedRelation: "tellers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          account_number: string | null
          approved_at: string | null
          approved_by: string | null
          bank: Database["public"]["Enums"]["bank_enum"]
          category: string | null
          code: string | null
          created_at: string
          date: string
          id: string
          notes: string | null
          payment_type: Database["public"]["Enums"]["payment_type_enum"]
          phone_number: string | null
          status: Database["public"]["Enums"]["tx_record_status"]
          usd_amount: number | null
          zwg_amount: number | null
        }
        Insert: {
          account_number?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank: Database["public"]["Enums"]["bank_enum"]
          category?: string | null
          code?: string | null
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          payment_type: Database["public"]["Enums"]["payment_type_enum"]
          phone_number?: string | null
          status?: Database["public"]["Enums"]["tx_record_status"]
          usd_amount?: number | null
          zwg_amount?: number | null
        }
        Update: {
          account_number?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank?: Database["public"]["Enums"]["bank_enum"]
          category?: string | null
          code?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          payment_type?: Database["public"]["Enums"]["payment_type_enum"]
          phone_number?: string | null
          status?: Database["public"]["Enums"]["tx_record_status"]
          usd_amount?: number | null
          zwg_amount?: number | null
        }
        Relationships: []
      }
      tellers: {
        Row: {
          created_at: string
          id: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      end_day_summary: {
        Row: {
          advance_outflows: number | null
          balance: number | null
          date: string | null
          internal_inflows: number | null
          internal_outflows: number | null
          payment_inflows: number | null
          swipe_outflows: number | null
          total_inflows: number | null
          total_outflows: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      bank_enum: "ZB" | "CBZ" | "BANCABC" | "AFC"
      cash_tx_type: "withdrawal" | "deposit"
      decision: "pending" | "approved" | "declined"
      payment_type_enum: "cash" | "transfer" | "mobile"
      request_type: "inflow" | "outflow"
      tx_record_status: "successful" | "pending" | "failed"
      tx_status: "pending" | "approved" | "declined"
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
      bank_enum: ["ZB", "CBZ", "BANCABC", "AFC"],
      cash_tx_type: ["withdrawal", "deposit"],
      decision: ["pending", "approved", "declined"],
      payment_type_enum: ["cash", "transfer", "mobile"],
      request_type: ["inflow", "outflow"],
      tx_record_status: ["successful", "pending", "failed"],
      tx_status: ["pending", "approved", "declined"],
    },
  },
} as const
