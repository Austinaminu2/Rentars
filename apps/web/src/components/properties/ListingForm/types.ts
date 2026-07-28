export interface ListingFormData {
  // Basic Info
  title: string;
  description: string;
  propertyType: string;

  // Location
  address: string;
  city: string;
  state: string;
  zipCode: string;
  latitude?: number;
  longitude?: number;

  // Capacity
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;

  // Amenities
  amenities: string[];

  // Photos
  images: File[];

  // Pricing
  pricePerNight: number;
  cleaningFee: number;
  serviceFee: number;

  // Stay length
  minNights: number;
  maxNights: number | null;

  // Check-in / check-out times
  checkInTime: string;
  checkOutTime: string;

  // House Rules
  petsAllowed: boolean;
  smokingAllowed: boolean;
  eventsAllowed: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  additionalRules: string;

  // Review
  agreeToTerms: boolean;
}

export type ListingStep =
  | 'basic'
  | 'location'
  | 'amenities'
  | 'photos'
  | 'pricing'
  | 'rules'
  | 'review';
