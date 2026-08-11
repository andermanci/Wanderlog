export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// Una ciudad de un día del itinerario (itinerary_days.cities, ver 045). El
// nombre se guarda siempre —aunque venga de una guía— para que borrar la guía
// no vacíe el día: el chip se queda como texto.
export interface DayCity {
  name: string
  guide_id: string | null
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          default_currency: string
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          default_currency?: string
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          default_currency?: string
          created_at?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          destination: string
          start_date: string
          end_date: string
          cover_image_url: string | null
          status: 'planning' | 'confirmed' | 'in_progress' | 'completed'
          budget_total: number | null
          tags: string[]
          default_currency: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          destination: string
          start_date: string
          end_date: string
          cover_image_url?: string | null
          status?: 'planning' | 'confirmed' | 'in_progress' | 'completed'
          budget_total?: number | null
          tags?: string[]
          default_currency?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          destination?: string
          start_date?: string
          end_date?: string
          cover_image_url?: string | null
          status?: 'planning' | 'confirmed' | 'in_progress' | 'completed'
          budget_total?: number | null
          tags?: string[]
          default_currency?: string
          created_at?: string
        }
        Relationships: []
      }
      itinerary_days: {
        Row: {
          id: string
          trip_id: string
          date: string
          notes: string | null
          journal: string | null
          /** @deprecated histórico: las ciudades del día viven en `cities` (ver 045) */
          guide_id: string | null
          /** @deprecated histórico: las ciudades del día viven en `cities` (ver 045) */
          city: string | null
          cities: DayCity[]
          tz: string | null
        }
        Insert: {
          id?: string
          trip_id: string
          date: string
          notes?: string | null
          journal?: string | null
          guide_id?: string | null
          city?: string | null
          cities?: DayCity[]
          tz?: string | null
        }
        Update: {
          id?: string
          trip_id?: string
          date?: string
          notes?: string | null
          journal?: string | null
          guide_id?: string | null
          city?: string | null
          cities?: DayCity[]
          tz?: string | null
        }
        Relationships: []
      }
      day_alerts: {
        Row: {
          id: string
          trip_id: string
          day_id: string
          text: string
          level: 'tip' | 'info' | 'warning'
          reminder_id: string | null
          order_index: number
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          day_id: string
          text: string
          level?: 'tip' | 'info' | 'warning'
          reminder_id?: string | null
          order_index?: number
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          day_id?: string
          text?: string
          level?: 'tip' | 'info' | 'warning'
          reminder_id?: string | null
          order_index?: number
          created_at?: string
        }
        Relationships: []
      }
      journal_photos: {
        Row: {
          id: string
          trip_id: string
          day_id: string
          file_url: string
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          day_id: string
          file_url: string
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          day_id?: string
          file_url?: string
          created_at?: string
        }
        Relationships: []
      }
      activities: {
        Row: {
          id: string
          trip_id: string
          day_id: string
          end_day_id: string | null
          type: 'flight' | 'hotel' | 'restaurant' | 'activity' | 'transport' | 'place' | 'other'
          title: string
          description: string | null
          address: string | null
          start_time: string | null
          end_time: string | null
          price: number | null
          external_link: string | null
          notes: string | null
          order_index: number
          place_id: string | null
          origin: string | null
          destination: string | null
          lat: number | null
          lng: number | null
          origin_lat: number | null
          origin_lng: number | null
          destination_lat: number | null
          destination_lng: number | null
          cover_image_url: string | null
          day_orders: Record<string, number>
          done: boolean
          origin_tz: string | null
          destination_tz: string | null
          fixed_time: boolean
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          day_id: string
          end_day_id?: string | null
          type?: 'flight' | 'hotel' | 'restaurant' | 'activity' | 'transport' | 'place' | 'other'
          title: string
          description?: string | null
          address?: string | null
          start_time?: string | null
          end_time?: string | null
          price?: number | null
          external_link?: string | null
          notes?: string | null
          order_index?: number
          place_id?: string | null
          origin?: string | null
          destination?: string | null
          lat?: number | null
          lng?: number | null
          origin_lat?: number | null
          origin_lng?: number | null
          destination_lat?: number | null
          destination_lng?: number | null
          cover_image_url?: string | null
          day_orders?: Record<string, number>
          origin_tz?: string | null
          destination_tz?: string | null
          fixed_time?: boolean
          done?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          day_id?: string
          end_day_id?: string | null
          type?: 'flight' | 'hotel' | 'restaurant' | 'activity' | 'transport' | 'place' | 'other'
          title?: string
          description?: string | null
          address?: string | null
          start_time?: string | null
          end_time?: string | null
          price?: number | null
          external_link?: string | null
          notes?: string | null
          order_index?: number
          place_id?: string | null
          origin?: string | null
          destination?: string | null
          lat?: number | null
          lng?: number | null
          origin_lat?: number | null
          origin_lng?: number | null
          destination_lat?: number | null
          destination_lng?: number | null
          cover_image_url?: string | null
          day_orders?: Record<string, number>
          origin_tz?: string | null
          destination_tz?: string | null
          fixed_time?: boolean
          done?: boolean
          created_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          trip_id: string
          category: 'flight' | 'train' | 'bus' | 'hotel' | 'car_rental' | 'transfer' | 'tour' | 'ticket' | 'insurance' | 'other' | 'passport' | 'dni' | 'visa' | 'driving_license' | 'health_card'
          title: string
          confirmation_number: string | null
          locator: string | null
          provider: string | null
          link: string | null
          datetime_start: string | null
          datetime_end: string | null
          origin: string | null
          destination: string | null
          seat: string | null
          phone: string | null
          flight_number: string | null
          file_url: string | null
          back_url: string | null
          traveler_id: string | null
          activity_id: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          category: 'flight' | 'train' | 'bus' | 'hotel' | 'car_rental' | 'transfer' | 'tour' | 'ticket' | 'insurance' | 'other' | 'passport' | 'dni' | 'visa' | 'driving_license' | 'health_card'
          title: string
          confirmation_number?: string | null
          locator?: string | null
          provider?: string | null
          link?: string | null
          datetime_start?: string | null
          datetime_end?: string | null
          origin?: string | null
          destination?: string | null
          seat?: string | null
          phone?: string | null
          flight_number?: string | null
          file_url?: string | null
          back_url?: string | null
          traveler_id?: string | null
          activity_id?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          category?: 'flight' | 'train' | 'bus' | 'hotel' | 'car_rental' | 'transfer' | 'tour' | 'ticket' | 'insurance' | 'other' | 'passport' | 'dni' | 'visa' | 'driving_license' | 'health_card'
          title?: string
          confirmation_number?: string | null
          locator?: string | null
          provider?: string | null
          link?: string | null
          datetime_start?: string | null
          datetime_end?: string | null
          origin?: string | null
          destination?: string | null
          seat?: string | null
          phone?: string | null
          flight_number?: string | null
          file_url?: string | null
          back_url?: string | null
          traveler_id?: string | null
          activity_id?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      travelers: {
        Row: {
          id: string
          trip_id: string
          name: string
          is_self: boolean
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          name: string
          is_self?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          name?: string
          is_self?: boolean
          created_at?: string
        }
        Relationships: []
      }
      destination_guides: {
        Row: {
          id: string
          trip_id: string
          name: string
          sections: GuideSection[]
          cover_image_url: string | null
          order_index: number
          facts: GuideFacts
          imported_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          name?: string
          sections?: GuideSection[]
          cover_image_url?: string | null
          order_index?: number
          facts?: GuideFacts
          imported_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          name?: string
          sections?: GuideSection[]
          cover_image_url?: string | null
          order_index?: number
          facts?: GuideFacts
          imported_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          created_at?: string
        }
        Relationships: []
      }
      favorite_places: {
        Row: {
          id: string
          trip_id: string
          user_id: string
          google_place_id: string
          name: string
          address: string | null
          lat: number
          lng: number
          category: 'restaurant' | 'hotel' | 'attraction' | 'cafe' | 'bar' | 'shop' | 'other'
          rating: number | null
          notes: string | null
          link: string | null
          collection: string | null
          guide_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          user_id: string
          google_place_id: string
          name: string
          address?: string | null
          lat: number
          lng: number
          category?: 'restaurant' | 'hotel' | 'attraction' | 'cafe' | 'bar' | 'shop' | 'other'
          rating?: number | null
          notes?: string | null
          link?: string | null
          collection?: string | null
          guide_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          user_id?: string
          google_place_id?: string
          name?: string
          address?: string | null
          lat?: number
          lng?: number
          category?: 'restaurant' | 'hotel' | 'attraction' | 'cafe' | 'bar' | 'shop' | 'other'
          rating?: number | null
          notes?: string | null
          link?: string | null
          collection?: string | null
          guide_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          id: string
          trip_id: string
          activity_id: string | null
          user_id: string
          title: string
          remind_at: string
          type: 'trip_countdown' | 'flight' | 'checkin' | 'document_expiry' | 'custom'
          is_sent: boolean
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          activity_id?: string | null
          user_id: string
          title: string
          remind_at: string
          type?: 'trip_countdown' | 'flight' | 'checkin' | 'document_expiry' | 'custom'
          is_sent?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          activity_id?: string | null
          user_id?: string
          title?: string
          remind_at?: string
          type?: 'trip_countdown' | 'flight' | 'checkin' | 'document_expiry' | 'custom'
          is_sent?: boolean
          created_at?: string
        }
        Relationships: []
      }
      packing_items: {
        Row: {
          id: string
          trip_id: string
          category: string
          name: string
          is_checked: boolean
          order_index: number
        }
        Insert: {
          id?: string
          trip_id: string
          category: string
          name: string
          is_checked?: boolean
          order_index?: number
        }
        Update: {
          id?: string
          trip_id?: string
          category?: string
          name?: string
          is_checked?: boolean
          order_index?: number
        }
        Relationships: []
      }
      expenses: {
        Row: {
          id: string
          trip_id: string
          category: string
          description: string
          amount: number
          currency: string
          date: string
          created_at: string
          external_id: string | null
          source: string
          activity_id: string | null
          paid_by: string | null
          split_between: string[]
        }
        Insert: {
          id?: string
          trip_id: string
          category: string
          description: string
          amount: number
          currency: string
          date: string
          created_at?: string
          external_id?: string | null
          source?: string
          activity_id?: string | null
          paid_by?: string | null
          split_between?: string[]
        }
        Update: {
          id?: string
          trip_id?: string
          category?: string
          description?: string
          amount?: number
          currency?: string
          date?: string
          created_at?: string
          external_id?: string | null
          source?: string
          activity_id?: string | null
          paid_by?: string | null
          split_between?: string[]
        }
        Relationships: []
      }
      bank_connections: {
        Row: {
          id: string
          user_id: string
          trip_id: string
          provider: string
          requisition_id: string
          account_id: string | null
          institution_id: string | null
          status: 'pending' | 'linked' | 'expired' | 'error'
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          trip_id: string
          provider?: string
          requisition_id: string
          account_id?: string | null
          institution_id?: string | null
          status?: 'pending' | 'linked' | 'expired' | 'error'
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          trip_id?: string
          provider?: string
          requisition_id?: string
          account_id?: string | null
          institution_id?: string | null
          status?: 'pending' | 'linked' | 'expired' | 'error'
          expires_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      activity_attachments: {
        Row: {
          id: string
          activity_id: string
          trip_id: string
          name: string
          file_url: string
          mime: string | null
          created_at: string
        }
        Insert: {
          id?: string
          activity_id: string
          trip_id: string
          name: string
          file_url: string
          mime?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          activity_id?: string
          trip_id?: string
          name?: string
          file_url?: string
          mime?: string | null
          created_at?: string
        }
        Relationships: []
      }
      audioguides: {
        Row: {
          id: string
          activity_id: string
          trip_id: string
          raw_text: string
          status: 'draft' | 'generating' | 'ready' | 'error'
          playback_stop_id: string | null
          playback_position_seconds: number
          playback_is_playing: boolean
          playback_rate: number
          playback_updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          activity_id: string
          trip_id: string
          raw_text: string
          status?: 'draft' | 'generating' | 'ready' | 'error'
          playback_stop_id?: string | null
          playback_position_seconds?: number
          playback_is_playing?: boolean
          playback_rate?: number
          playback_updated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          activity_id?: string
          trip_id?: string
          raw_text?: string
          status?: 'draft' | 'generating' | 'ready' | 'error'
          playback_stop_id?: string | null
          playback_position_seconds?: number
          playback_is_playing?: boolean
          playback_rate?: number
          playback_updated_at?: string
          created_at?: string
        }
        Relationships: []
      }
      audioguide_stops: {
        Row: {
          id: string
          audioguide_id: string
          trip_id: string
          order_index: number
          title: string
          summary: string | null
          direction_text: string | null
          script_text: string
          place_query: string | null
          lat: number | null
          lng: number | null
          geo_status: 'pending' | 'located' | 'unlocated'
          audio_url: string | null
          audio_duration_seconds: number | null
          sentence_timings: { text: string; start: number }[] | null
          status: 'pending' | 'generating' | 'ready' | 'error'
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          audioguide_id: string
          trip_id: string
          order_index: number
          title: string
          summary?: string | null
          direction_text?: string | null
          script_text: string
          place_query?: string | null
          lat?: number | null
          lng?: number | null
          geo_status?: 'pending' | 'located' | 'unlocated'
          audio_url?: string | null
          audio_duration_seconds?: number | null
          sentence_timings?: { text: string; start: number }[] | null
          status?: 'pending' | 'generating' | 'ready' | 'error'
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          audioguide_id?: string
          trip_id?: string
          order_index?: number
          title?: string
          summary?: string | null
          direction_text?: string | null
          script_text?: string
          place_query?: string | null
          lat?: number | null
          lng?: number | null
          geo_status?: 'pending' | 'located' | 'unlocated'
          audio_url?: string | null
          audio_duration_seconds?: number | null
          sentence_timings?: { text: string; start: number }[] | null
          status?: 'pending' | 'generating' | 'ready' | 'error'
          error_message?: string | null
          created_at?: string
        }
        Relationships: []
      }
      trip_collaborators: {
        Row: {
          id: string
          trip_id: string
          email: string
          user_id: string | null
          invited_by: string
          role: 'viewer' | 'editor' | 'admin'
          created_at: string
          // Token del enlace /invite/:token que va en el correo de invitación
          invite_token: string
          invite_sent_at: string | null
          accepted_at: string | null
          invite_expires_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          email: string
          user_id?: string | null
          invited_by: string
          role?: 'viewer' | 'editor' | 'admin'
          created_at?: string
          invite_token?: string
          invite_sent_at?: string | null
          accepted_at?: string | null
          invite_expires_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          email?: string
          user_id?: string | null
          invited_by?: string
          role?: 'viewer' | 'editor' | 'admin'
          created_at?: string
          invite_token?: string
          invite_sent_at?: string | null
          accepted_at?: string | null
          invite_expires_at?: string
        }
        Relationships: []
      }
      // Eventos de uso (ver 052). Se insertan desde el cliente para los
      // hechos que no dejan huella en la base; el resto los emiten triggers y
      // edge functions. No se leen nunca desde el navegador: la política solo
      // permite INSERT, y el panel los consulta por RPC.
      usage_events: {
        Row: {
          id: string
          user_id: string | null
          trip_id: string | null
          event: string
          props: Record<string, unknown>
          source: 'web' | 'edge' | 'db'
          at: string
        }
        Insert: {
          id?: string
          user_id: string
          trip_id?: string | null
          event: string
          props?: Record<string, unknown>
          source?: 'web' | 'edge' | 'db'
          at?: string
        }
        Update: never
        Relationships: []
      }
      // Analítica de visitas (ver 051). El navegador NUNCA la toca: la escribe
      // la edge function de Netlify con el service_role y la lee el panel
      // agregada. Está declarada solo para que el esquema quede documentado.
      page_views: {
        Row: {
          id: string
          session_id: string
          user_id: string | null
          path: string
          section: string
          referrer_host: string | null
          utm_source: string | null
          utm_medium: string | null
          utm_campaign: string | null
          device: string
          country: string | null
          region: string | null
          ms: number | null
          at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      // Permisos por usuario (ver 050). Que no haya fila es lo normal y
      // significa "todo permitido"; solo existe para quien tiene algún límite.
      user_limits: {
        Row: {
          user_id: string
          can_create_trips: boolean
          max_trips: number | null
          can_use_ai: boolean
          can_share_trips: boolean
          is_suspended: boolean
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        // La tabla no tiene políticas de escritura: solo la tocan las RPC de
        // administración y el service_role. Escribirla desde el cliente es un
        // error, y aquí queda declarado como tal.
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      share_trip: {
        Args: { p_trip_id: string; p_email: string }
        Returns: Database['public']['Tables']['trip_collaborators']['Row']
      }
      has_trip_access: {
        Args: { p_trip_id: string }
        Returns: boolean
      }
      my_trip_role: {
        Args: { p_trip_id: string }
        Returns: 'owner' | 'admin' | 'editor' | 'viewer' | null
      }
      duplicate_trip: {
        Args: { p_trip_id: string }
        Returns: Database['public']['Tables']['trips']['Row']
      }
      // Ficha del viaje para la pantalla de invitación: es la única lectura
      // que se hace SIN sesión (quien aún no tiene cuenta).
      invite_preview: {
        Args: { p_token: string }
        Returns: InvitePreview
      }
      accept_invite: {
        Args: { p_token: string }
        Returns: string
      }
      // Marcar una actividad como hecha: lo puede hacer cualquiera con acceso
      // al viaje, también quien solo tiene permiso de "ver".
      set_activity_done: {
        Args: { p_activity_id: string; p_done: boolean }
        Returns: Database['public']['Tables']['activities']['Row']
      }

      // --- Administración de la plataforma (048+) ---
      // Sin argumentos a propósito: solo puedes preguntar por ti, así que la
      // función no sirve para enumerar quién administra.
      is_platform_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      admin_audit_list: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: AdminAuditRow[]
      }
      admin_users: {
        Args: { p_q?: string | null; p_limit?: number; p_offset?: number; p_user?: string }
        Returns: AdminUserRow[]
      }
      admin_user_trips: {
        Args: { p_user: string }
        Returns: AdminUserTripRow[]
      }
      admin_trips: {
        Args: { p_q?: string | null; p_limit?: number; p_offset?: number }
        Returns: AdminTripRow[]
      }
      admin_trip_overview: {
        Args: { p_trip: string }
        Returns: AdminTripOverview | null
      }
      admin_trip_itinerary: {
        Args: { p_trip: string }
        Returns: AdminItineraryRow[]
      }
      admin_metrics: {
        Args: { p_days?: number }
        Returns: AdminMetrics
      }
      admin_events: {
        Args: { p_days?: number }
        Returns: AdminEvents
      }
      admin_last_view: {
        Args: Record<string, never>
        Returns: string | null
      }
      admin_delete_user_preview: {
        Args: { p_user: string }
        Returns: DeleteUserPreviewRow
      }
      admin_set_limits: {
        Args: {
          p_user: string
          p_can_create_trips?: boolean
          p_max_trips?: number | null
          p_clear_max_trips?: boolean
          p_can_use_ai?: boolean
          p_can_share_trips?: boolean
          p_is_suspended?: boolean
          p_notes?: string | null
        }
        Returns: UserLimitsRow
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Trip = Database['public']['Tables']['trips']['Row']
export type ItineraryDay = Database['public']['Tables']['itinerary_days']['Row']
export type Activity = Database['public']['Tables']['activities']['Row']
export type Document = Database['public']['Tables']['documents']['Row']
export type FavoritePlace = Database['public']['Tables']['favorite_places']['Row']
export type Reminder = Database['public']['Tables']['reminders']['Row']
export type PackingItem = Database['public']['Tables']['packing_items']['Row']
export type Expense = Database['public']['Tables']['expenses']['Row']
export type TripCollaborator = Database['public']['Tables']['trip_collaborators']['Row']

// Lo que devuelve la RPC invite_preview (ver 044_trip_invites.sql). Cuando el
// estado no es 'pending' los campos del viaje pueden venir vacíos ('invalid').
export interface InvitePreview {
  status: 'pending' | 'accepted' | 'expired' | 'invalid'
  trip_id: string | null
  trip_name: string | null
  destination: string | null
  start_date: string | null
  end_date: string | null
  cover_image_url: string | null
  inviter_name: string | null
  invited_email: string | null
  role: 'viewer' | 'editor' | 'admin' | null
}
export type BankConnection = Database['public']['Tables']['bank_connections']['Row']
export type ActivityAttachment = Database['public']['Tables']['activity_attachments']['Row']
export type JournalPhoto = Database['public']['Tables']['journal_photos']['Row']
export type Traveler = Database['public']['Tables']['travelers']['Row']
export type DestinationGuide = Database['public']['Tables']['destination_guides']['Row']
export type DayAlert = Database['public']['Tables']['day_alerts']['Row']
export type Audioguide = Database['public']['Tables']['audioguides']['Row']
export type AudioguideStop = Database['public']['Tables']['audioguide_stops']['Row']

// Sección de la guía del destino (historia, costumbres, idioma...). Se importa
// de Wikivoyage/Wikipedia y luego es editable; `edited` marca lo tocado a mano
// para que "volver a importar" no lo pise. `source`/`url` = atribución (CC BY-SA).
export interface GuideSection {
  id: string
  title: string
  body: string
  source?: 'Wikivoyage' | 'Wikipedia' | 'manual'
  url?: string
  edited?: boolean
}

// Datos rápidos del destino (chips). Best-effort desde Wikidata; campos vacíos
// se ocultan. Todo opcional.
export interface GuideFacts {
  currency?: string
  languages?: string
  emergency?: string
  plug?: string
  voltage?: string
  callingCode?: string
}

export type TripStatus = Trip['status']
export type ActivityType = Activity['type']
export type DocumentCategory = Document['category']
export type PlaceCategory = FavoritePlace['category']
export type ReminderType = Reminder['type']
export type DayAlertLevel = DayAlert['level']

// --- Administración de la plataforma ---

// Fila de admin_audit_list. `total_count` viaja repetido en cada fila
// (count(*) over ()) para poder paginar sin una segunda consulta.
export interface AdminAuditRow {
  id: string
  admin_email: string | null
  action: string
  target_user: string | null
  target_email: string | null
  target_trip: string | null
  detail: Record<string, unknown>
  at: string
  total_count: number
}

export interface AdminUserRow {
  user_id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  trips: number
  collaborations: number
  activities: number
  expenses: number
  documents: number
  storage_bytes: number
  is_admin: boolean
  can_create_trips: boolean
  max_trips: number | null
  can_use_ai: boolean
  can_share_trips: boolean
  is_suspended: boolean
  notes: string | null
  total_count: number
}

export interface AdminUserTripRow {
  trip_id: string
  name: string
  destination: string
  start_date: string
  end_date: string
  status: string
  created_at: string
  default_currency: string
  has_cover: boolean
  tags: string[]
  is_owner: boolean
  role: string | null
  days: number
  activities: number
  expenses: number
  documents: number
  photos: number
  collaborators: number
}

export interface AdminTripRow {
  trip_id: string
  name: string
  destination: string
  start_date: string
  end_date: string
  status: string
  created_at: string
  owner_id: string
  owner_email: string | null
  activities: number
  collaborators: number
  total_count: number
}

// Ficha de un viaje para el panel. De los gastos solo hay recuentos,
// categorías y monedas: nunca importes.
export interface AdminTripOverview {
  trip_id: string
  name: string
  destination: string
  start_date: string
  end_date: string
  status: string
  created_at: string
  default_currency: string
  tags: string[]
  has_cover: boolean
  owner_id: string
  owner_email: string | null
  days: number
  activities: number
  activities_done: number
  expenses: number
  expense_categories: string[]
  expense_currencies: string[]
  documents: number
  photos: number
  travelers: number
  places: number
  guides: number
  audioguides: number
  audio_stops_ready: number
  journal_days: number
  collaborators: { email: string; role: string; accepted: boolean }[]
  storage_bytes: number
}

// Una fila = una actividad, o un día sin actividades (con los campos de
// actividad a null). Esta lista de campos ES la política de privacidad del
// panel: del diario y las notas solo sale su LONGITUD, nunca el texto.
export interface AdminItineraryRow {
  day_id: string
  day_date: string
  day_cities: number
  has_journal: boolean
  journal_chars: number
  notes_chars: number
  activity_id: string | null
  activity_type: string | null
  title: string | null
  address: string | null
  start_time: string | null
  end_time: string | null
  has_coords: boolean | null
  has_cover: boolean | null
  attachments: number | null
  done: boolean | null
  order_index: number | null
}

export interface AdminMetrics {
  dias: number
  usuarios: number
  usuarios_nuevos: number
  usuarios_con_viaje: number
  viajes: number
  viajes_nuevos: number
  viajes_por_estado: Record<string, number>
  altas_por_semana: { semana: string; n: number }[]
  actividades: number
  gastos: number
  documentos: number
  fotos: number
  audioguias: number
  colaboraciones: number
  invitaciones_pendientes: number
  top_destinos: { destino: string; n: number }[]
  almacenamiento: Record<string, number>
}

// Fila de `user_limits`. No existir es lo normal: sin fila, todo permitido.
export interface UserLimitsRow {
  user_id: string
  can_create_trips: boolean
  max_trips: number | null
  can_use_ai: boolean
  can_share_trips: boolean
  is_suspended: boolean
  notes: string | null
  updated_at: string
  updated_by: string | null
}

export interface AdminEvents {
  dias: number
  total: number
  personas: number
  porEvento: { evento: string; n: number; personas: number }[]
  porDia: { dia: string; n: number }[]
  /** Quién consume lo que se paga. `unidades` son caracteres en el TTS y
   *  llamadas en el resto: por eso la columna se etiqueta según el evento. */
  gastoIA: { user_id: string; email: string | null; usos: number; unidades: number }[]
  ultimo: string | null
}

// Lo que devuelve admin_delete_user_preview. Se declara aquí para que el
// diálogo no invente campos que la RPC no da.
export interface DeleteUserPreviewRow {
  user_id: string
  email: string | null
  es_admin: boolean
  viajes_propios: { id: string; name: string; destination: string; colaboradores: number }[]
  colaboradores_afectados: string[]
  viajes_ajenos: { id: string; name: string; owner: string | null }[]
  invitaciones_a_reasignar: number
  ficheros: number
  bytes: number
  visitas: number
  eventos: number
}
