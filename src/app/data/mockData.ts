// whaleStudy - Real Data based on Naver Booking Pages
// Room names updated to match Naver Page (ROOM1 ~ ROOM7 / ROOM8)

export type ReservationStatus = 'completed' | 'canceled' | 'reserved';
export type PaymentMethod = 'card' | 'transfer' | 'easy-pay';
export type PaymentStatus = 'paid' | 'refunded';

export interface Room {
  id: string;
  branch: '정자점' | '수지구청점' | '위례점';
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
export const mockRooms: Room[] = [
  // === 정자점 (총 7개 룸: ROOM1 ~ ROOM7) ===
  { id: 'room-jj-1', branch: '정자점', name: 'ROOM1 (1~2인실)', capacity: 2, pricePerHour: 6000, description: '웨일스터디 정자점 ROOM1' },
  { id: 'room-jj-2', branch: '정자점', name: 'ROOM2 (1~2인실)', capacity: 2, pricePerHour: 6000, description: '웨일스터디 정자점 ROOM2' },
  { id: 'room-jj-3', branch: '정자점', name: 'ROOM3 (4인실)', capacity: 4, pricePerHour: 10000, description: '웨일스터디 정자점 ROOM3' },
  { id: 'room-jj-4', branch: '정자점', name: 'ROOM4 (4인실)', capacity: 4, pricePerHour: 10000, description: '웨일스터디 정자점 ROOM4' },
  { id: 'room-jj-5', branch: '정자점', name: 'ROOM5 (4인실)', capacity: 4, pricePerHour: 10000, description: '웨일스터디 정자점 ROOM5' },
  { id: 'room-jj-6', branch: '정자점', name: 'ROOM6 (4인실)', capacity: 4, pricePerHour: 10000, description: '웨일스터디 정자점 ROOM6' },
  { id: 'room-jj-7', branch: '정자점', name: 'ROOM7 (6~8인실 세미나)', capacity: 8, pricePerHour: 18000, description: '웨일스터디 정자점 ROOM7 세미나룸' },

  // === 수지구청점 (총 8개 룸: ROOM1 ~ ROOM8) ===
  { id: 'room-sj-1', branch: '수지구청점', name: 'ROOM1 (1~2인실)', capacity: 2, pricePerHour: 6000, description: '수지구청점 ROOM1' },
  { id: 'room-sj-2', branch: '수지구청점', name: 'ROOM2 (1~2인실)', capacity: 2, pricePerHour: 6000, description: '수지구청점 ROOM2' },
  { id: 'room-sj-3', branch: '수지구청점', name: 'ROOM3 (4인실)', capacity: 4, pricePerHour: 10000, description: '수지구청점 ROOM3' },
  { id: 'room-sj-4', branch: '수지구청점', name: 'ROOM4 (4인실)', capacity: 4, pricePerHour: 10000, description: '수지구청점 ROOM4' },
  { id: 'room-sj-5', branch: '수지구청점', name: 'ROOM5 (4인실)', capacity: 4, pricePerHour: 10000, description: '수지구청점 ROOM5' },
  { id: 'room-sj-6', branch: '수지구청점', name: 'ROOM6 (4인실)', capacity: 4, pricePerHour: 10000, description: '수지구청점 ROOM6' },
  { id: 'room-sj-7', branch: '수지구청점', name: 'ROOM7 (4인실)', capacity: 4, pricePerHour: 10000, description: '수지구청점 ROOM7' },
  { id: 'room-sj-8', branch: '수지구청점', name: 'ROOM8 (8인실 세미나)', capacity: 8, pricePerHour: 20000, description: '수지구청점 ROOM8 세미나룸' }
];

// 제공되지 않은 임의의 예약 정보는 모두 제거합니다.
export const mockReservations: Reservation[] = [];

// 제공되지 않은 임의의 매출(결제) 정보는 모두 제거합니다.
export const mockRevenues: Revenue[] = [];
