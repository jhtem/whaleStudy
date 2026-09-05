// whaleStudy - Real Data based on Naver Booking Pages
// Room names updated to match Naver Page (ROOM1 ~ ROOM7 / ROOM8)

export type ReservationStatus = 'completed' | 'canceled' | 'reserved';
export type PaymentMethod = 'card' | 'transfer' | 'easy-pay';
export type PaymentStatus = 'paid' | 'refunded';

export interface Room {
  id: string;
  branch: '정자점' | '수지구청점' | '위례점' | '알루';
  name: string;
  capacity: number;
  pricePerHour: number;
  description: string;
}

export interface Reservation {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  userPhone: string;
  date: string; // YYYY-MM-DD
  startTime: number; // 24시간제 소수점 (예: 9.5는 09:30)
  endTime: number; // 24시간제 소수점 (예: 11.0은 11:00)
  totalHours: number; // endTime - startTime (최소 0.5시간)
  status: ReservationStatus;
  createdAt: string; // ISO String
}

export interface Revenue {
  id: string;
  reservationId: string;
  roomId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string; // ISO String
  status: PaymentStatus;
}

// 네이버 플레이스 실제 예약 페이지 명칭과 100% 동기화 (ROOM1 ~ ROOM7/8)
// 네이버 플레이스 실제 예약 페이지 명칭 및 실물 요금표 100% 동기화
export const mockRooms: Room[] = [
  // === 정자점 (총 7개 룸) ===
  { id: 'room-jj-1', branch: '정자점', name: 'ROOM1', capacity: 2, pricePerHour: 5000, description: '30분당 2,500원 (1시간 5,000원)' },
  { id: 'room-jj-2', branch: '정자점', name: 'ROOM2', capacity: 2, pricePerHour: 5000, description: '30분당 2,500원 (1시간 5,000원)' },
  { id: 'room-jj-3', branch: '정자점', name: 'ROOM3', capacity: 4, pricePerHour: 7000, description: '30분당 3,500원 (1시간 7,000원)' },
  { id: 'room-jj-4', branch: '정자점', name: 'ROOM4', capacity: 4, pricePerHour: 7000, description: '30분당 3,500원 (1시간 7,000원)' },
  { id: 'room-jj-5', branch: '정자점', name: 'ROOM5', capacity: 4, pricePerHour: 7000, description: '30분당 3,500원 (1시간 7,000원)' },
  { id: 'room-jj-6', branch: '정자점', name: 'ROOM6', capacity: 4, pricePerHour: 7000, description: '30분당 3,500원 (1시간 7,000원)' },
  { id: 'room-jj-7', branch: '정자점', name: 'ROOM7', capacity: 8, pricePerHour: 12000, description: '30분당 6,000원 (1시간 12,000원)' },

  // === 수지구청점 (총 8개 룸) ===
  { id: 'room-sj-1', branch: '수지구청점', name: 'ROOM1', capacity: 2, pricePerHour: 7000, description: '30분당 3,500원 (1시간 7,000원)' },
  { id: 'room-sj-2', branch: '수지구청점', name: 'ROOM2', capacity: 2, pricePerHour: 7000, description: '30분당 3,500원 (1시간 7,000원)' },
  { id: 'room-sj-3', branch: '수지구청점', name: 'ROOM3', capacity: 4, pricePerHour: 7000, description: '30분당 3,500원 (1시간 7,000원)' },
  { id: 'room-sj-4', branch: '수지구청점', name: 'ROOM4', capacity: 4, pricePerHour: 7000, description: '30분당 3,500원 (1시간 7,000원)' },
  { id: 'room-sj-5', branch: '수지구청점', name: 'ROOM5', capacity: 4, pricePerHour: 7000, description: '30분당 3,500원 (1시간 7,000원)' },
  { id: 'room-sj-6', branch: '수지구청점', name: 'ROOM6', capacity: 4, pricePerHour: 5000, description: '30분당 2,500원 (1시간 5,000원)' },
  { id: 'room-sj-7', branch: '수지구청점', name: 'ROOM7', capacity: 4, pricePerHour: 5000, description: '30분당 2,500원 (1시간 5,000원)' },
  { id: 'room-sj-8', branch: '수지구청점', name: 'ROOM8', capacity: 8, pricePerHour: 12000, description: '30분당 6,000원 (1시간 12,000원)' },

  // === 알루점 (총 10개 룸) ===
  { id: 'room-al-1', branch: '알루', name: 'ALU. 1', capacity: 6, pricePerHour: 5000, description: '30분당 2,500원 (1시간 5,000원)' },
  { id: 'room-al-2', branch: '알루', name: 'ALU. 2', capacity: 2, pricePerHour: 6000, description: '30분당 3,000원 (1시간 6,000원)' },
  { id: 'room-al-3', branch: '알루', name: 'ALU. 3', capacity: 2, pricePerHour: 6000, description: '30분당 3,000원 (1시간 6,000원)' },
  { id: 'room-al-4', branch: '알루', name: 'ALU. 4', capacity: 2, pricePerHour: 6000, description: '30분당 3,000원 (1시간 6,000원)' },
  { id: 'room-al-5', branch: '알루', name: 'ALU. 5', capacity: 2, pricePerHour: 6000, description: '30분당 3,000원 (1시간 6,000원)' },
  { id: 'room-al-6', branch: '알루', name: 'ALU. 6', capacity: 2, pricePerHour: 6000, description: '30분당 3,000원 (1시간 6,000원)' },
  { id: 'room-al-7', branch: '알루', name: 'ALU. 7', capacity: 4, pricePerHour: 8000, description: '30분당 4,000원 (1시간 8,000원)' },
  { id: 'room-al-8', branch: '알루', name: 'ALU. 8', capacity: 2, pricePerHour: 8000, description: '30분당 4,000원 (1시간 8,000원)' },
  { id: 'room-al-9', branch: '알루', name: 'ALU. 9', capacity: 2, pricePerHour: 8000, description: '30분당 4,000원 (1시간 8,000원)' },
  { id: 'room-al-10', branch: '알루', name: 'ALU. 10', capacity: 4, pricePerHour: 8000, description: '30분당 4,000원 (1시간 8,000원)' },
  { id: 'room-al-11', branch: '알루', name: 'ALU. 11', capacity: 4, pricePerHour: 8000, description: '30분당 4,000원 (1시간 8,000원)' },
  { id: 'room-al-12', branch: '알루', name: 'ALU. 12', capacity: 4, pricePerHour: 8000, description: '30분당 4,000원 (1시간 8,000원)' },
  { id: 'room-al-13', branch: '알루', name: 'ALU. 13', capacity: 4, pricePerHour: 8000, description: '30분당 4,000원 (1시간 8,000원)' },
  { id: 'room-al-14', branch: '알루', name: 'ALU. 14', capacity: 4, pricePerHour: 8000, description: '30분당 4,000원 (1시간 8,000원)' },
  { id: 'room-al-15', branch: '알루', name: 'ALU. 15', capacity: 4, pricePerHour: 8000, description: '30분당 4,000원 (1시간 8,000원)' },
  { id: 'room-al-16', branch: '알루', name: 'ALU. 16', capacity: 4, pricePerHour: 8000, description: '30분당 4,000원 (1시간 8,000원)' },

  // === 위례점 (총 8개 룸) ===
  { id: 'room-wr-1', branch: '위례점', name: 'ROOM1', capacity: 2, pricePerHour: 5000, description: '30분당 2,500원 (1시간 5,000원)' },
  { id: 'room-wr-2', branch: '위례점', name: 'ROOM2', capacity: 2, pricePerHour: 5000, description: '30분당 2,500원 (1시간 5,000원)' },
  { id: 'room-wr-3', branch: '위례점', name: 'ROOM3', capacity: 4, pricePerHour: 7000, description: '30분당 3,500원 (1시간 7,000원)' },
  { id: 'room-wr-4', branch: '위례점', name: 'ROOM4', capacity: 4, pricePerHour: 7000, description: '30분당 3,500원 (1시간 7,000원)' },
  { id: 'room-wr-5', branch: '위례점', name: 'ROOM5', capacity: 4, pricePerHour: 7000, description: '30분당 3,500원 (1시간 7,000원)' },
  { id: 'room-wr-6', branch: '위례점', name: 'ROOM6', capacity: 4, pricePerHour: 7000, description: '30분당 3,500원 (1시간 7,000원)' },
  { id: 'room-wr-7', branch: '위례점', name: 'ROOM7', capacity: 4, pricePerHour: 7000, description: '30분당 3,500원 (1시간 7,000원)' },
  { id: 'room-wr-8', branch: '위례점', name: 'ROOM8', capacity: 8, pricePerHour: 13000, description: '30분당 6,500원 (1시간 13,000원)' }
];

// 제공되지 않은 임의의 예약 정보는 모두 제거합니다.
export const mockReservations: Reservation[] = [];

// 제공되지 않은 임의의 매출(결제) 정보는 모두 제거합니다.
export const mockRevenues: Revenue[] = [];
