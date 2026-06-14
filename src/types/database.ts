export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

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
        }
        Insert: {
          id?: string
          trip_id: string
          date: string
          notes?: string | null
          journal?: string | null
        }
        Update: {
          id?: string
          trip_id?: string
          date?: string
          notes?: string | null
          journal?: string | null
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
          file_url: string | null
          back_url: string | null
          traveler_id: string | null
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
          file_url?: string | null
          back_url?: string | null
          traveler_id?: string | null
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
          file_url?: string | null
          back_url?: string | null
          traveler_id?: string | null
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
          sections: GuideSection[]
          imported_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          sections?: GuideSection[]
          imported_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          sections?: GuideSection[]
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
      trip_collaborators: {
        Row: {
          id: string
          trip_id: string
          email: string
          user_id: string | null
          invited_by: string
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          email: string
          user_id?: string | null
          invited_by: string
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          email?: string
          user_id?: string | null
          invited_by?: string
          created_at?: string
        }
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
export type BankConnection = Database['public']['Tables']['bank_connections']['Row']
export type ActivityAttachment = Database['public']['Tables']['activity_attachments']['Row']
export type JournalPhoto = Database['public']['Tables']['journal_photos']['Row']
export type Traveler = Database['public']['Tables']['travelers']['Row']
export type DestinationGuide = Database['public']['Tables']['destination_guides']['Row']

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

export type TripStatus = Trip['status']
export type ActivityType = Activity['type']
export type DocumentCategory = Document['category']
export type PlaceCategory = FavoritePlace['category']
export type ReminderType = Reminder['type']
