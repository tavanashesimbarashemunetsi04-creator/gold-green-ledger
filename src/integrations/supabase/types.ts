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
      approvals: {
        Row: {
          approver_label: string | null
          approver_user_id: string | null
          created_at: string
          decision: string
          id: string
          notes: string | null
          record_id: string
          source: string
        }
        Insert: {
          approver_label?: string | null
          approver_user_id?: string | null
          created_at?: string
          decision: string
          id?: string
          notes?: string | null
          record_id: string
          source: string
        }
        Update: {
          approver_label?: string | null
          approver_user_id?: string | null
          created_at?: string
          decision?: string
          id?: string
          notes?: string | null
          record_id?: string
          source?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_label: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_label?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_label?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          code: string | null
          created_at: string
          id: string
          location: string | null
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name?: string
        }
        Relationships: []
      }
      cash_advance: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          branch_id: string | null
          card_last4: string
          code: string | null
          created_at: string
          date: string
          failure_reason: string | null
          id: string
          id_number: string
          name: string
          notes: string | null
          phone_number: string | null
          signature_url: string
          status: Database["public"]["Enums"]["tx_record_status"]
          teller_id: string | null
          transaction_type: Database["public"]["Enums"]["cash_tx_type"]
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          card_last4: string
          code?: string | null
          created_at?: string
          date: string
          failure_reason?: string | null
          id?: string
          id_number: string
          name: string
          notes?: string | null
          phone_number?: string | null
          signature_url: string
          status?: Database["public"]["Enums"]["tx_record_status"]
          teller_id?: string | null
          transaction_type: Database["public"]["Enums"]["cash_tx_type"]
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          card_last4?: string
          code?: string | null
          created_at?: string
          date?: string
          failure_reason?: string | null
          id?: string
          id_number?: string
          name?: string
          notes?: string | null
          phone_number?: string | null
          signature_url?: string
          status?: Database["public"]["Enums"]["tx_record_status"]
          teller_id?: string | null
          transaction_type?: Database["public"]["Enums"]["cash_tx_type"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_advance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_advance_teller_id_fkey"
            columns: ["teller_id"]
            isOneToOne: false
            referencedRelation: "tellers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_swipes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string | null
          card_last4: string
          code: string | null
          created_at: string
          date: string
          failure_reason: string | null
          id: string
          id_number: string
          name: string
          notes: string | null
          phone_number: string | null
          signature_url: string
          status: Database["public"]["Enums"]["tx_record_status"]
          teller_id: string | null
          transaction_type: Database["public"]["Enums"]["cash_tx_type"]
          usd_amount: number | null
          zwg_amount: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          card_last4: string
          code?: string | null
          created_at?: string
          date: string
          failure_reason?: string | null
          id?: string
          id_number: string
          name: string
          notes?: string | null
          phone_number?: string | null
          signature_url: string
          status?: Database["public"]["Enums"]["tx_record_status"]
          teller_id?: string | null
          transaction_type: Database["public"]["Enums"]["cash_tx_type"]
          usd_amount?: number | null
          zwg_amount?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          card_last4?: string
          code?: string | null
          created_at?: string
          date?: string
          failure_reason?: string | null
          id?: string
          id_number?: string
          name?: string
          notes?: string | null
          phone_number?: string | null
          signature_url?: string
          status?: Database["public"]["Enums"]["tx_record_status"]
          teller_id?: string | null
          transaction_type?: Database["public"]["Enums"]["cash_tx_type"]
          usd_amount?: number | null
          zwg_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_swipes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_swipes_teller_id_fkey"
            columns: ["teller_id"]
            isOneToOne: false
            referencedRelation: "tellers"
            referencedColumns: ["id"]
          },
        ]
      }
      ecocash_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          created_by_label: string | null
          description: string
          id: string
          imported_at: string | null
          imported_transaction_id: string | null
          inflow_amount: number
          outflow_amount: number
          source: Database["public"]["Enums"]["ecocash_source"]
          transaction_type: Database["public"]["Enums"]["ecocash_tx_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          created_by_label?: string | null
          description: string
          id?: string
          imported_at?: string | null
          imported_transaction_id?: string | null
          inflow_amount?: number
          outflow_amount?: number
          source?: Database["public"]["Enums"]["ecocash_source"]
          transaction_type: Database["public"]["Enums"]["ecocash_tx_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          created_by_label?: string | null
          description?: string
          id?: string
          imported_at?: string | null
          imported_transaction_id?: string | null
          inflow_amount?: number
          outflow_amount?: number
          source?: Database["public"]["Enums"]["ecocash_source"]
          transaction_type?: Database["public"]["Enums"]["ecocash_tx_type"]
        }
        Relationships: []
      }
      end_day_summary: {
        Row: {
          branch_id: string | null
          business_date: string
          closed_at: string | null
          closed_by_user_id: string | null
          created_at: string
          failed_count: number
          id: string
          pending_count: number
          teller_id: string | null
          total_inflow_usd: number
          total_inflow_zwg: number
          total_outflow_usd: number
          total_outflow_zwg: number
        }
        Insert: {
          branch_id?: string | null
          business_date: string
          closed_at?: string | null
          closed_by_user_id?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          pending_count?: number
          teller_id?: string | null
          total_inflow_usd?: number
          total_inflow_zwg?: number
          total_outflow_usd?: number
          total_outflow_zwg?: number
        }
        Update: {
          branch_id?: string | null
          business_date?: string
          closed_at?: string | null
          closed_by_user_id?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          pending_count?: number
          teller_id?: string | null
          total_inflow_usd?: number
          total_inflow_zwg?: number
          total_outflow_usd?: number
          total_outflow_zwg?: number
        }
        Relationships: [
          {
            foreignKeyName: "end_day_summary_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "end_day_summary_teller_id_fkey"
            columns: ["teller_id"]
            isOneToOne: false
            referencedRelation: "tellers"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_transactions: {
        Row: {
          amount: number
          created_at: string
          date: string
          ecocash_related: boolean
          failure_reason: string | null
          id: string
          initiating_teller_id: string
          initiator_decision: Database["public"]["Enums"]["decision"]
          notes: string | null
          receiver_decision: Database["public"]["Enums"]["decision"]
          request_type: Database["public"]["Enums"]["request_type"]
          status: Database["public"]["Enums"]["tx_status"]
          target_teller_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          date: string
          ecocash_related?: boolean
          failure_reason?: string | null
          id?: string
          initiating_teller_id: string
          initiator_decision?: Database["public"]["Enums"]["decision"]
          notes?: string | null
          receiver_decision?: Database["public"]["Enums"]["decision"]
          request_type: Database["public"]["Enums"]["request_type"]
          status?: Database["public"]["Enums"]["tx_status"]
          target_teller_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          ecocash_related?: boolean
          failure_reason?: string | null
          id?: string
          initiating_teller_id?: string
          initiator_decision?: Database["public"]["Enums"]["decision"]
          notes?: string | null
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
      login_sessions: {
        Row: {
          device_id: string
          device_label: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          device_id: string
          device_label?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          device_id?: string
          device_label?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          account_number: string | null
          approved_at: string | null
          approved_by: string | null
          bank: Database["public"]["Enums"]["bank_enum"]
          branch_id: string | null
          category: string | null
          code: string | null
          created_at: string
          date: string
          failure_reason: string | null
          id: string
          notes: string | null
          payment_type: Database["public"]["Enums"]["payment_type_enum"]
          phone_number: string | null
          status: Database["public"]["Enums"]["tx_record_status"]
          teller_id: string | null
          usd_amount: number | null
          zwg_amount: number | null
        }
        Insert: {
          account_number?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank: Database["public"]["Enums"]["bank_enum"]
          branch_id?: string | null
          category?: string | null
          code?: string | null
          created_at?: string
          date: string
          failure_reason?: string | null
          id?: string
          notes?: string | null
          payment_type: Database["public"]["Enums"]["payment_type_enum"]
          phone_number?: string | null
          status?: Database["public"]["Enums"]["tx_record_status"]
          teller_id?: string | null
          usd_amount?: number | null
          zwg_amount?: number | null
        }
        Update: {
          account_number?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank?: Database["public"]["Enums"]["bank_enum"]
          branch_id?: string | null
          category?: string | null
          code?: string | null
          created_at?: string
          date?: string
          failure_reason?: string | null
          id?: string
          notes?: string | null
          payment_type?: Database["public"]["Enums"]["payment_type_enum"]
          phone_number?: string | null
          status?: Database["public"]["Enums"]["tx_record_status"]
          teller_id?: string | null
          usd_amount?: number | null
          zwg_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_teller_id_fkey"
            columns: ["teller_id"]
            isOneToOne: false
            referencedRelation: "tellers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch_id: string | null
          created_at: string
          display_name: string | null
          email: string | null
          full_name: string | null
          id: string
          is_temporary_password: boolean
          last_login_at: string | null
          phone: string | null
          require_password_change: boolean
          status: Database["public"]["Enums"]["user_account_status"]
          teller_id: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_temporary_password?: boolean
          last_login_at?: string | null
          phone?: string | null
          require_password_change?: boolean
          status?: Database["public"]["Enums"]["user_account_status"]
          teller_id?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_temporary_password?: boolean
          last_login_at?: string | null
          phone?: string | null
          require_password_change?: boolean
          status?: Database["public"]["Enums"]["user_account_status"]
          teller_id?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_teller_id_fkey"
            columns: ["teller_id"]
            isOneToOne: false
            referencedRelation: "tellers"
            referencedColumns: ["id"]
          },
        ]
      }
      security_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          user_id?: string
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      all_transactions: {
        Row: {
          amount: number | null
          branch_id: string | null
          created_at: string | null
          date: string | null
          id: string | null
          name: string | null
          source: string | null
          status: string | null
          teller_id: string | null
        }
        Relationships: []
      }
      failed_transactions: {
        Row: {
          amount: number | null
          branch_id: string | null
          created_at: string | null
          date: string | null
          failure_reason: string | null
          id: string | null
          name: string | null
          notes: string | null
          source: string | null
          status: string | null
          teller_id: string | null
        }
        Relationships: []
      }
      inflows: {
        Row: {
          branch_id: string | null
          created_at: string | null
          date: string | null
          id: string | null
          source: string | null
          teller_id: string | null
          usd_amount: number | null
          zwg_amount: number | null
        }
        Relationships: []
      }
      outflows: {
        Row: {
          amount: number | null
          branch_id: string | null
          created_at: string | null
          date: string | null
          id: string | null
          source: string | null
          teller_id: string | null
        }
        Insert: {
          amount?: never
          branch_id?: string | null
          created_at?: string | null
          date?: string | null
          id?: string | null
          source?: never
          teller_id?: string | null
        }
        Update: {
          amount?: never
          branch_id?: string | null
          created_at?: string | null
          date?: string | null
          id?: string | null
          source?: never
          teller_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_advance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_advance_teller_id_fkey"
            columns: ["teller_id"]
            isOneToOne: false
            referencedRelation: "tellers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_user_has_any_role: {
        Args: { _roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "teller"
      bank_enum: "ZB" | "CBZ" | "BANCABC" | "AFC"
      cash_tx_type: "withdrawal" | "deposit"
      decision: "pending" | "approved" | "declined"
      ecocash_source: "manual_entry" | "internal_transaction"
      ecocash_tx_type: "inflow" | "outflow"
      payment_type_enum: "cash" | "transfer" | "mobile"
      request_type: "inflow" | "outflow"
      tx_record_status: "successful" | "pending" | "failed"
      tx_status: "pending" | "approved" | "declined"
      user_account_status: "active" | "suspended" | "locked"
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
      app_role: ["admin", "manager", "teller"],
      bank_enum: ["ZB", "CBZ", "BANCABC", "AFC"],
      cash_tx_type: ["withdrawal", "deposit"],
      decision: ["pending", "approved", "declined"],
      ecocash_source: ["manual_entry", "internal_transaction"],
      ecocash_tx_type: ["inflow", "outflow"],
      payment_type_enum: ["cash", "transfer", "mobile"],
      request_type: ["inflow", "outflow"],
      tx_record_status: ["successful", "pending", "failed"],
      tx_status: ["pending", "approved", "declined"],
      user_account_status: ["active", "suspended", "locked"],
    },
  },
} as const
