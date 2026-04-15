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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_settings: {
        Row: {
          ai_globally_enabled: boolean
          created_at: string
          end_service_keyword: string
          greeting_message: string | null
          id: string
          offer_human_option: boolean
          reminder_hours_before: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_globally_enabled?: boolean
          created_at?: string
          end_service_keyword?: string
          greeting_message?: string | null
          id?: string
          offer_human_option?: boolean
          reminder_hours_before?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_globally_enabled?: boolean
          created_at?: string
          end_service_keyword?: string
          greeting_message?: string | null
          id?: string
          offer_human_option?: boolean
          reminder_hours_before?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          client_id: string
          created_at: string
          end_at: string
          id: string
          manicure_id: string | null
          notes: string | null
          price: number | null
          service_id: string
          source: Database["public"]["Enums"]["appointment_source"]
          start_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          end_at: string
          id?: string
          manicure_id?: string | null
          notes?: string | null
          price?: number | null
          service_id: string
          source?: Database["public"]["Enums"]["appointment_source"]
          start_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          end_at?: string
          id?: string
          manicure_id?: string | null
          notes?: string | null
          price?: number | null
          service_id?: string
          source?: Database["public"]["Enums"]["appointment_source"]
          start_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_manicure_id_fkey"
            columns: ["manicure_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
                                                                      created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
                                                                      created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
                                                                      created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          business_name: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          studio_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          business_name?: string | null
          created_at?: string
          full_name: string
          id?: string
          phone?: string | null
          studio_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          business_name?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          studio_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          appointment_id: string
          client_id: string
          comment: string | null
          created_at: string
          id: string
          manicure_id: string | null
          rating: number
          user_id: string
        }
        Insert: {
          appointment_id: string
          client_id: string
          comment?: string | null
          created_at?: string
          id?: string
          manicure_id?: string | null
          rating: number
          user_id: string
        }
        Update: {
          appointment_id?: string
          client_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          manicure_id?: string | null
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_manicure_id_fkey"
            columns: ["manicure_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_blocks: {
        Row: {
          all_day: boolean
          created_at: string
          end_at: string
          id: string
          reason: string | null
          start_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          end_at: string
          id?: string
          reason?: string | null
          start_at: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          end_at?: string
          id?: string
          reason?: string | null
          start_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          duration_minutes: number
          id: string
          is_active: boolean
          maintenance_interval_days: number | null
          name: string
          price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          maintenance_interval_days?: number | null
          name: string
          price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          maintenance_interval_days?: number | null
          name?: string
          price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      studio_manicures: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          manicure_user_id: string
          studio_profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          manicure_user_id: string
          studio_profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          manicure_user_id?: string
          studio_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_manicures_studio_profile_id_fkey"
            columns: ["studio_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_conversations: {
        Row: {
          ai_enabled: boolean
          client_id: string | null
          created_at: string
          human_takeover: boolean
          human_takeover_by: string | null
          id: string
          last_message_at: string
          phone: string
          state: string
          state_data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_enabled?: boolean
          client_id?: string | null
          created_at?: string
          human_takeover?: boolean
          human_takeover_by?: string | null
          id?: string
          last_message_at?: string
          phone: string
          state?: string
          state_data?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_enabled?: boolean
          client_id?: string | null
          created_at?: string
          human_takeover?: boolean
          human_takeover_by?: string | null
          id?: string
          last_message_at?: string
          phone?: string
          state?: string
          state_data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_human_takeover_by_fkey"
            columns: ["human_takeover_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      working_hours: {
        Row: {
          close_time: string
          created_at: string
          day_of_week: number
          id: string
          is_open: boolean
          open_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          close_time?: string
          created_at?: string
          day_of_week: number
          id?: string
          is_open?: boolean
          open_time?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          close_time?: string
          created_at?: string
          day_of_week?: number
          id?: string
          is_open?: boolean
          open_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      working_hours_overrides: {
        Row: {
          close_time: string
          created_at: string
          id: string
          is_open: boolean
          open_time: string
          updated_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          close_time?: string
          created_at?: string
          id?: string
          is_open?: boolean
          open_time?: string
          updated_at?: string
          user_id: string
          work_date: string
        }
        Update: {
          close_time?: string
          created_at?: string
          id?: string
          is_open?: boolean
          open_time?: string
          updated_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      account_type: "solo" | "studio"
      app_role: "admin" | "studio_owner" | "manicure" | "user"
      appointment_source: "manual" | "whatsapp" | "instagram"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
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
      account_type: ["solo", "studio"],
      app_role: ["admin", "studio_owner", "manicure", "user"],
      appointment_source: ["manual", "whatsapp", "instagram"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
    },
  },
} as const
