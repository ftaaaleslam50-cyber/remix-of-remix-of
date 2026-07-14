export type BookingType = "individual" | "family";
export type RoomType = "1" | "2" | "3" | "4" | "5";

export interface Hotel {
  id: string;
  name: string;
  description: string;
  stars: number;
  rating: number;
  distance_km: number;
  amenities: string[];
  image_url: string;
  gallery: string[];
  price_addition: number;
  price_label: string;
  available: boolean;
  display_order: number;
  is_no_hotel: boolean;
}

export interface Package {
  id: string;
  slug: string;
  name: string;
  description: string;
  image_url: string;
  tier: string;
  includes: string[];
  base_price: number;
  active: boolean;
  display_order: number;
}

export interface PricingCell {
  id: string;
  package_id: string;
  room_type: string;
  passenger_count: number;
  price: number;
  season: string;
  active: boolean;
}

export interface Coupon {
  id: string;
  code: string;
  phone: string;
  prize_type: "percent" | "fixed";
  prize_value: number;
  expiry_date: string;
  used: boolean;
  label?: string;
}

export interface Trip {
  id: string;
  name: string;
  departure_day: string;
  return_day: string;
  capacity: number;
  active: boolean;
  display_order: number;
}

export interface Bus {
  id: string;
  trip_id: string;
  bus_number: number;
  capacity: number;
  active: boolean;
  blocked_seats: string[];
  name?: string | null;
  plate?: string | null;
  model?: string | null;
  image_url?: string | null;
  bus_type?: string | null;
  details?: string | null;
  price_addition?: number | null;
  layout?: "A" | "B";
}

export interface AppSettings {
  id: number;
  company_name: string;
  email: string;
  national_number: string;
  whatsapp: string;
  phone: string;
  tiktok_url: string;
  instagram_url: string;
  snapchat_url: string;
  maps_url: string;
  logo_url: string;
  hero_title: string;
  hero_subtitle: string;
  hero_cta: string;
  price_transport_only: number;
  price_individual: number;
  price_family_5: number;
  price_family_4: number;
  price_family_3: number;
  price_family_2: number;
  price_family_1: number;
  terms_text?: string;
  ticket_template?: Record<string, unknown>;
  booking_steps?: unknown;
}
