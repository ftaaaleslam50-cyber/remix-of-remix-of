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
      app_settings: {
        Row: {
          about_body: string | null
          about_title: string | null
          booking_steps: Json | null
          company_name: string
          cta_body: string | null
          cta_button_label: string | null
          cta_title: string | null
          email: string
          facebook_url: string | null
          faq: Json | null
          features: Json | null
          hero_cta: string
          hero_image_url: string | null
          hero_subtitle: string
          hero_title: string
          id: number
          instagram_url: string | null
          logo_url: string
          maps_url: string | null
          national_number: string
          phone: string
          price_family_1: number
          price_family_2: number
          price_family_3: number
          price_family_4: number
          price_family_5: number
          price_individual: number
          price_transport_only: number
          snapchat_url: string | null
          telegram_url: string | null
          terms_text: string | null
          testimonials: Json | null
          ticket_template: Json | null
          tiktok_url: string | null
          twitter_url: string | null
          updated_at: string
          whatsapp: string
          youtube_url: string | null
        }
        Insert: {
          about_body?: string | null
          about_title?: string | null
          booking_steps?: Json | null
          company_name?: string
          cta_body?: string | null
          cta_button_label?: string | null
          cta_title?: string | null
          email?: string
          facebook_url?: string | null
          faq?: Json | null
          features?: Json | null
          hero_cta?: string
          hero_image_url?: string | null
          hero_subtitle?: string
          hero_title?: string
          id?: number
          instagram_url?: string | null
          logo_url?: string
          maps_url?: string | null
          national_number?: string
          phone?: string
          price_family_1?: number
          price_family_2?: number
          price_family_3?: number
          price_family_4?: number
          price_family_5?: number
          price_individual?: number
          price_transport_only?: number
          snapchat_url?: string | null
          telegram_url?: string | null
          terms_text?: string | null
          testimonials?: Json | null
          ticket_template?: Json | null
          tiktok_url?: string | null
          twitter_url?: string | null
          updated_at?: string
          whatsapp?: string
          youtube_url?: string | null
        }
        Update: {
          about_body?: string | null
          about_title?: string | null
          booking_steps?: Json | null
          company_name?: string
          cta_body?: string | null
          cta_button_label?: string | null
          cta_title?: string | null
          email?: string
          facebook_url?: string | null
          faq?: Json | null
          features?: Json | null
          hero_cta?: string
          hero_image_url?: string | null
          hero_subtitle?: string
          hero_title?: string
          id?: number
          instagram_url?: string | null
          logo_url?: string
          maps_url?: string | null
          national_number?: string
          phone?: string
          price_family_1?: number
          price_family_2?: number
          price_family_3?: number
          price_family_4?: number
          price_family_5?: number
          price_individual?: number
          price_transport_only?: number
          snapchat_url?: string | null
          telegram_url?: string | null
          terms_text?: string | null
          testimonials?: Json | null
          ticket_template?: Json | null
          tiktok_url?: string | null
          twitter_url?: string | null
          updated_at?: string
          whatsapp?: string
          youtube_url?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          details: Json | null
          entity: string | null
          entity_id: string | null
          id: string
          ip: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      bookings: {
        Row: {
          booking_code: string
          booking_source: string | null
          booking_type: string
          bus_id: string | null
          contact_phone: string
          coupon_code: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          customer_name: string
          deleted_at: string | null
          discount_amount: number
          hotel_id: string | null
          id: string
          id_image_url: string | null
          id_number: string
          nationality: string | null
          no_bus: boolean
          no_hotel: boolean
          package_id: string | null
          passenger_count: number
          pdf_url: string | null
          price_per_person: number
          rep_name: string | null
          rep_phone: string | null
          rep_whatsapp: string | null
          room_type: string
          seat_numbers: string[]
          status: string
          total_price: number
          trip_id: string
          updated_at: string
          updated_by: string | null
          whatsapp_phone: string
        }
        Insert: {
          booking_code: string
          booking_source?: string | null
          booking_type: string
          bus_id?: string | null
          contact_phone: string
          coupon_code?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          customer_name: string
          deleted_at?: string | null
          discount_amount?: number
          hotel_id?: string | null
          id?: string
          id_image_url?: string | null
          id_number: string
          nationality?: string | null
          no_bus?: boolean
          no_hotel?: boolean
          package_id?: string | null
          passenger_count: number
          pdf_url?: string | null
          price_per_person: number
          rep_name?: string | null
          rep_phone?: string | null
          rep_whatsapp?: string | null
          room_type: string
          seat_numbers?: string[]
          status?: string
          total_price: number
          trip_id: string
          updated_at?: string
          updated_by?: string | null
          whatsapp_phone: string
        }
        Update: {
          booking_code?: string
          booking_source?: string | null
          booking_type?: string
          bus_id?: string | null
          contact_phone?: string
          coupon_code?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          customer_name?: string
          deleted_at?: string | null
          discount_amount?: number
          hotel_id?: string | null
          id?: string
          id_image_url?: string | null
          id_number?: string
          nationality?: string | null
          no_bus?: boolean
          no_hotel?: boolean
          package_id?: string | null
          passenger_count?: number
          pdf_url?: string | null
          price_per_person?: number
          rep_name?: string | null
          rep_phone?: string | null
          rep_whatsapp?: string | null
          room_type?: string
          seat_numbers?: string[]
          status?: string
          total_price?: number
          trip_id?: string
          updated_at?: string
          updated_by?: string | null
          whatsapp_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      bus_layouts: {
        Row: {
          created_at: string
          id: string
          layout_json: Json
          name: string
          seat_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          layout_json?: Json
          name: string
          seat_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          layout_json?: Json
          name?: string
          seat_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      buses: {
        Row: {
          active: boolean
          blocked_seats: string[]
          bus_number: number
          bus_type: string | null
          capacity: number
          created_at: string
          details: string | null
          id: string
          image_url: string | null
          is_active_booking: boolean
          layout: string
          layout_id: string | null
          model: string | null
          name: string | null
          plate: string | null
          price_addition: number
          priority: number
          status: Database["public"]["Enums"]["bus_status"]
          trip_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          blocked_seats?: string[]
          bus_number: number
          bus_type?: string | null
          capacity?: number
          created_at?: string
          details?: string | null
          id?: string
          image_url?: string | null
          is_active_booking?: boolean
          layout?: string
          layout_id?: string | null
          model?: string | null
          name?: string | null
          plate?: string | null
          price_addition?: number
          priority?: number
          status?: Database["public"]["Enums"]["bus_status"]
          trip_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          blocked_seats?: string[]
          bus_number?: number
          bus_type?: string | null
          capacity?: number
          created_at?: string
          details?: string | null
          id?: string
          image_url?: string | null
          is_active_booking?: boolean
          layout?: string
          layout_id?: string | null
          model?: string | null
          name?: string | null
          plate?: string | null
          price_addition?: number
          priority?: number
          status?: Database["public"]["Enums"]["bus_status"]
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buses_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "bus_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string | null
          expiry_date: string
          id: string
          ip: string | null
          issue_date: string
          label: string | null
          max_uses: number | null
          phone: string | null
          prize_type: string
          prize_value: number
          source: string
          usage_count: number
          used: boolean
          used_in_booking_id: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string | null
          expiry_date: string
          id?: string
          ip?: string | null
          issue_date?: string
          label?: string | null
          max_uses?: number | null
          phone?: string | null
          prize_type: string
          prize_value: number
          source?: string
          usage_count?: number
          used?: boolean
          used_in_booking_id?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string | null
          expiry_date?: string
          id?: string
          ip?: string | null
          issue_date?: string
          label?: string | null
          max_uses?: number | null
          phone?: string | null
          prize_type?: string
          prize_value?: number
          source?: string
          usage_count?: number
          used?: boolean
          used_in_booking_id?: string | null
        }
        Relationships: []
      }
      gallery_albums: {
        Row: {
          created_at: string
          display_order: number
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      gallery_images: {
        Row: {
          album_id: string
          caption: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string
          media_type: string
          video_url: string | null
        }
        Insert: {
          album_id: string
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          media_type?: string
          video_url?: string | null
        }
        Update: {
          album_id?: string
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          media_type?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_images_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "gallery_albums"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_sections: {
        Row: {
          bg_color: string | null
          button_link: string | null
          button_text: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          section_key: string
          subtitle: string | null
          title: string | null
          updated_at: string
          visible: boolean
        }
        Insert: {
          bg_color?: string | null
          button_link?: string | null
          button_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          section_key: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          visible?: boolean
        }
        Update: {
          bg_color?: string | null
          button_link?: string | null
          button_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          section_key?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          visible?: boolean
        }
        Relationships: []
      }
      hotels: {
        Row: {
          amenities: string[]
          available: boolean
          created_at: string
          description: string
          display_order: number
          distance_km: number
          gallery: string[]
          id: string
          image_url: string
          is_no_hotel: boolean
          name: string
          price_addition: number
          price_label: string
          rating: number
          stars: number
          updated_at: string
        }
        Insert: {
          amenities?: string[]
          available?: boolean
          created_at?: string
          description?: string
          display_order?: number
          distance_km?: number
          gallery?: string[]
          id?: string
          image_url?: string
          is_no_hotel?: boolean
          name: string
          price_addition?: number
          price_label?: string
          rating?: number
          stars?: number
          updated_at?: string
        }
        Update: {
          amenities?: string[]
          available?: boolean
          created_at?: string
          description?: string
          display_order?: number
          distance_km?: number
          gallery?: string[]
          id?: string
          image_url?: string
          is_no_hotel?: boolean
          name?: string
          price_addition?: number
          price_label?: string
          rating?: number
          stars?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          archived: boolean
          body: string | null
          created_at: string
          id: string
          link: string | null
          metadata: Json | null
          read: boolean
          title: string
          type: string
        }
        Insert: {
          archived?: boolean
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json | null
          read?: boolean
          title: string
          type: string
        }
        Update: {
          archived?: boolean
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          metadata?: Json | null
          read?: boolean
          title?: string
          type?: string
        }
        Relationships: []
      }
      packages: {
        Row: {
          active: boolean
          base_price: number
          created_at: string | null
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          includes: Json | null
          name: string
          slug: string
          stars: number | null
          tier: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          base_price?: number
          created_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          includes?: Json | null
          name: string
          slug: string
          stars?: number | null
          tier?: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          base_price?: number
          created_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          includes?: Json | null
          name?: string
          slug?: string
          stars?: number | null
          tier?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pricing_matrix: {
        Row: {
          active: boolean
          created_at: string | null
          id: string
          package_id: string
          passenger_count: number
          price: number
          room_type: string
          season: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          id?: string
          package_id: string
          passenger_count: number
          price: number
          room_type: string
          season?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string | null
          id?: string
          package_id?: string
          passenger_count?: number
          price?: number
          room_type?: string
          season?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_matrix_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          active: boolean
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          last_login_at: string | null
          mobile_phone: string | null
          national_id: string | null
          national_id_image_url: string | null
          nationality: string | null
          updated_at: string
          whatsapp_phone: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          last_login_at?: string | null
          mobile_phone?: string | null
          national_id?: string | null
          national_id_image_url?: string | null
          nationality?: string | null
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          last_login_at?: string | null
          mobile_phone?: string | null
          national_id?: string | null
          national_id_image_url?: string | null
          nationality?: string | null
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Relationships: []
      }
      trip_buses: {
        Row: {
          bus_id: string
          created_at: string
          trip_id: string
        }
        Insert: {
          bus_id: string
          created_at?: string
          trip_id: string
        }
        Update: {
          bus_id?: string
          created_at?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_buses_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_buses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          active: boolean
          capacity: number
          created_at: string
          departure_day: string
          departure_period: string | null
          departure_time: string | null
          display_order: number
          id: string
          name: string
          return_day: string
          return_period: string | null
          return_time: string | null
        }
        Insert: {
          active?: boolean
          capacity?: number
          created_at?: string
          departure_day: string
          departure_period?: string | null
          departure_time?: string | null
          display_order?: number
          id?: string
          name: string
          return_day: string
          return_period?: string | null
          return_time?: string | null
        }
        Update: {
          active?: boolean
          capacity?: number
          created_at?: string
          departure_day?: string
          departure_period?: string | null
          departure_time?: string | null
          display_order?: number
          id?: string
          name?: string
          return_day?: string
          return_period?: string | null
          return_time?: string | null
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
          role?: Database["public"]["Enums"]["app_role"]
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
      wheel_config: {
        Row: {
          coupon_expiry_hours: number
          enabled: boolean
          id: number
          spin_cooldown_days: number
          subtitle: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          coupon_expiry_hours?: number
          enabled?: boolean
          id?: number
          spin_cooldown_days?: number
          subtitle?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          coupon_expiry_hours?: number
          enabled?: boolean
          id?: number
          spin_cooldown_days?: number
          subtitle?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      wheel_segments: {
        Row: {
          active: boolean
          color: string
          created_at: string | null
          display_order: number
          id: string
          label: string
          prize_type: string
          prize_value: number
          probability_weight: number
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string | null
          display_order?: number
          id?: string
          label: string
          prize_type?: string
          prize_value?: number
          probability_weight?: number
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string | null
          display_order?: number
          id?: string
          label?: string
          prize_type?: string
          prize_value?: number
          probability_weight?: number
        }
        Relationships: []
      }
      wheel_spins: {
        Row: {
          coupon_id: string | null
          id: string
          ip: string | null
          phone: string
          segment_id: string | null
          spun_at: string
        }
        Insert: {
          coupon_id?: string | null
          id?: string
          ip?: string | null
          phone: string
          segment_id?: string | null
          spun_at?: string
        }
        Update: {
          coupon_id?: string | null
          id?: string
          ip?: string | null
          phone?: string
          segment_id?: string | null
          spun_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wheel_spins_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "wheel_segments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_booking_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      redeem_coupon: {
        Args: { _booking_id: string; _code: string }
        Returns: boolean
      }
      validate_coupon: {
        Args: { _code: string }
        Returns: {
          active: boolean
          code: string
          expiry_date: string
          label: string
          max_uses: number
          prize_type: string
          prize_value: number
          usage_count: number
          used: boolean
        }[]
      }
    }
    Enums: {
      account_type: "customer" | "representative"
      app_role: "admin" | "user" | "manager" | "user_manager" | "representative"
      bus_status: "active" | "disabled" | "maintenance" | "stopped"
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
      account_type: ["customer", "representative"],
      app_role: ["admin", "user", "manager", "user_manager", "representative"],
      bus_status: ["active", "disabled", "maintenance", "stopped"],
    },
  },
} as const
