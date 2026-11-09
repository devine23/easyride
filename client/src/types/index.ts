export type UserRole = 'rider' | 'driver' | 'corporate' | 'admin';
export type AccountStatus = 'active' | 'frozen' | 'deleted';
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type VehicleCategory = 'Economy' | 'Comfort' | 'SUV' | 'Tow Truck';
export type LicenceClass = 'Class 2' | 'Class 3' | 'Class 4' | 'Class 5';
export type PaymentPreference = 'ecocash' | 'cash_usd' | 'cash_zig';

// ─── Rider ────────────────────────────────────────────────────────────────
export interface RiderProfile {
  gender?: 'male' | 'female' | 'prefer_not_to_say';
  emergencyContactName: string;
  emergencyContactPhone: string;
  homeAddress?: string;
  workAddress?: string;
  preferredPayment: PaymentPreference;
  profilePhoto?: string;
}

// ─── Driver ───────────────────────────────────────────────────────────────
export interface DriverDocuments {
  nationalIdNumber: string;
  nationalIdPhoto?: string;
  dateOfBirth: string;
  residentialAddress: string;
  proofOfResidence?: string;
  selfiePhoto?: string;
  nextOfKinName: string;
  nextOfKinPhone: string;

  licenceNumber: string;
  licenceClass: LicenceClass;
  licenceIssueDate: string;
  licenceExpiry: string;
  licencePhoto?: string;

  defensiveDrivingCert?: string;
  defensiveDrivingExpiry: string;
  policeClearance?: string;
  policeClearanceDate: string;
  medicalCert?: string;
  medicalCertExpiry?: string;
}

export interface VehicleDetails {
  registration: string;
  make: string;
  model: string;
  year: string;
  colour: string;
  seatingCapacity: number;
  category: VehicleCategory;
  fuelType?: 'petrol' | 'diesel';
  regBookPhoto?: string;
  zinaraExpiry: string;
  zinaraPhoto?: string;
  insuranceType: 'third_party' | 'comprehensive';
  insurer: string;
  insuranceExpiry: string;
  insurancePhoto?: string;
  cofExpiry: string;
  cofPhoto?: string;
  operatorPermit?: string;
  vehiclePhotos: { front?: string; back?: string; leftSide?: string; rightSide?: string; interior?: string };
}

export interface DriverAgreements {
  codeOfConduct: boolean;
  backgroundCheckConsent: boolean;
  commissionAcknowledgement: boolean;
  termsAccepted: boolean;
  termsTimestamp?: string;
}

// ─── Corporate / Fleet Owner ──────────────────────────────────────────────
export interface CorporateProfile {
  companyName: string;
  companyRegNumber: string;
  zimraBpNumber?: string;
  taxClearanceDoc?: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  numberOfVehicles?: number;
  bankName?: string;
  bankAccountNumber?: string;
  bankBranch?: string;
}

// ─── Verification (admin-facing) ──────────────────────────────────────────
export interface VerificationRecord {
  status: VerificationStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  notes?: string;
  documentAlerts?: DocumentAlert[];
}

export interface DocumentAlert {
  docType: string;
  expiryDate: string;
  daysUntilExpiry: number;
  isExpired: boolean;
}

// ─── Core User ────────────────────────────────────────────────────────────
export interface User {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  role: UserRole;
  accountStatus: AccountStatus;
  verification?: VerificationRecord;
  riderProfile?: RiderProfile;
  driverDocuments?: DriverDocuments;
  vehicleDetails?: VehicleDetails;
  driverAgreements?: DriverAgreements;
  corporateProfile?: CorporateProfile;
  rating?: number;
  isOnline?: boolean;
  createdAt: string;
  lastSeen?: string;
  lastSelfieAt?: string;
  // legacy compat
  name?: string;
  companyName?: string;
  vehicleReg?: string;
  vehicleModel?: string;
  frozenReason?: string;
  frozenAt?: string;
}

export interface Coordinates { lat: number; lng: number }

export type RideStatus = 'scheduled' | 'searching' | 'accepted' | 'pickup' | 'inprogress' | 'completed' | 'cancelled';

export interface Ride {
  id: string;
  clientId: string;
  driverId?: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupCoords?: Coordinates;
  dropoffCoords?: Coordinates;
  status: RideStatus;
  paymentMethod: PaymentMethod;
  fare?: number;
  distance?: number;
  duration?: number;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
  openingMileage?: number;
  closingMileage?: number;
  waitingCharge?: number;
  voucherId?: string;
  departmentCode?: string;
  employeeName?: string;
  costCenter?: string;
  vehicleCategory?: VehicleCategory;
  cancelReason?: string;
  clientRating?: number;
  counterFare?: number;
  counterByDriverId?: string;
  isShared?: boolean;
  fareShare?: number;
  maxPassengers?: number;
  coRiders?: Array<{ userId: string; pickupAddress: string; pickupCoords?: Coordinates; fareShare: number }>
  clientComment?: string;
  scheduledFor?: string;
  promoCode?: string;
  discountAmount?: number;
}

export interface PromoCode {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  maxUses: number | null;
  usesCount: number;
  minFare: number;
  expiresAt: string | null;
  active: boolean;
  description: string;
  createdAt: string;
}

export type PaymentMethod = 'cash_usd' | 'cash_zig' | 'cash' | 'ecocash' | 'voucher';

export interface Voucher {
  id: string;
  voucherNo: string;
  date: string;
  pickUpPoint: string;
  dropOffPoint: string;
  department: string;
  costCenter: string;
  employeeNames: string;
  authorisedBy: string;
  cabNo: string;
  pickUpTime: string;
  dropOffTime: string;
  openingMileage: number | string;
  closingMileage: number | string;
  totalMileage: number | string;
  waitingCharge: number | string;
  totalValue: number | string;
  driverName: string;
  corporateId: string;
  status: 'pending' | 'used' | 'cancelled';
  createdAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  rideId: string;
  text: string;
  timestamp: string;
  type: 'text' | 'location' | 'system';
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  position: string;
  corporateId: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ─── Bidding ──────────────────────────────────────────────────────────────
export interface BidCounter {
  id: string
  driverId: string
  driverName: string
  amount: number
  etaMin?: number | null
  rating?: number | null
  at: string
}

export type BidStatus = 'open' | 'accepted' | 'expired' | 'cancelled'

export interface Bid {
  id: string
  rideId?: string
  clientId: string
  pickupAddress?: string
  dropoffAddress?: string
  pickupCoords?: Coordinates
  dropoffCoords?: Coordinates
  category: VehicleCategory
  distKm?: number
  durMin?: number
  estimate: number
  floor: number
  passengerOffer: number
  counters: BidCounter[]
  acceptedCounterId?: string
  status: BidStatus
  createdAt: string
  expiresAt: string
}

export interface BidEnvelope {
  distKm: number
  durMin: number
  estimate: number
  floor: number
  supplyFactor: number
  nearbyDrivers: number
}

export interface LostItemMessage { id: string; senderId: string; text: string; timestamp: string }

export interface LostItem {
  id: string
  rideId: string
  clientId: string
  driverId: string
  description: string
  status: 'open' | 'resolved' | 'closed'
  createdAt: string
  expiresAt: string
  messages: LostItemMessage[]
}

export interface Payout {
  id: string
  driverId: string
  driverName: string
  driverPhone?: string
  amount: number
  method: 'ecocash' | 'bank'
  phone: string
  status: 'pending' | 'approved' | 'rejected' | 'paid'
  requestedAt: string
  processedAt?: string
  processedBy?: string
  rejectionReason?: string
  notes?: string
}

export interface ActivityLog {
  id: string;
  type: 'login' | 'ride' | 'payment' | 'voucher' | 'account' | 'call' | 'system' | 'verification';
  severity: 'info' | 'warning' | 'critical';
  userId?: string;
  userName?: string;
  userRole?: UserRole;
  description: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}
