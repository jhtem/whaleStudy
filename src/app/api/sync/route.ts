const fs = require('fs');
const path = require('path');
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// 오늘 기준 최근 7일간(D-6 ~ Today) 지점별 매출 비교 데이터를 백엔드 데이터베이스 전체를 기반으로 정밀 연산하는 헬퍼 함수
function computeDailyComparisonSales() {
  const d = new Date();
  const kst = new Date(d.getTime() + (9 * 60 * 60 * 1000));
  const todayStr = (kst.toISOString().split('T')[0] && kst.toISOString().split('T')[0].startsWith('2026-'))
    ? kst.toISOString().split('T')[0]
    : "2026-09-02";

  const dateList = [];
  const base = new Date(`${todayStr}T00:00:00`);
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(base);
    dt.setDate(base.getDate() - i);
    const yr = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    dateList.push(`${yr}-${m}-${day}`);
  }
  let reservations: any[] = [];
  
  try {
    const jsonPath = path.join(process.cwd(), 'src/scripts/syncedReservations.json');
    if (fs.existsSync(jsonPath)) {
      const fileData = fs.readFileSync(jsonPath, 'utf8');
      reservations = JSON.parse(fileData);
    }
  } catch (e) {
    console.error("[SyncAPI] computeDailyComparisonSales load fail:", e);
  }
  
  return dateList.map(fullDate => {
    const label = fullDate.substring(5); // "08-29"
    
    // 정자점 매출 집계
    const jjAmount = reservations
      .filter((r: any) => r.date === fullDate && r.roomId.startsWith('room-jj-') && r.status !== 'canceled')
      .reduce((sum: number, r: any) => {
        let price = 10000;
        if (r.roomId.includes('room-jj-7')) price = 18000;
        else if (r.roomId.endsWith('-1') || r.roomId.endsWith('-2')) price = 6000;
        else if (r.roomId.endsWith('-3') || r.roomId.endsWith('-4') || r.roomId.endsWith('-5') || r.roomId.endsWith('-6')) price = 10000;
        return sum + (price * r.totalHours);
      }, 0);

    // 수지구청점 매출 집계
    const sjAmount = reservations
      .filter((r: any) => r.date === fullDate && r.roomId.startsWith('room-sj-') && r.status !== 'canceled')
      .reduce((sum: number, r: any) => {
        let price = 10000;
        if (r.roomId.includes('room-sj-8')) price = 20000;
        else if (r.roomId.endsWith('-1') || r.roomId.endsWith('-2')) price = 6000;
        else if (r.roomId.endsWith('-3') || r.roomId.endsWith('-4') || r.roomId.endsWith('-5') || r.roomId.endsWith('-6') || r.roomId.endsWith('-7')) price = 10000;
        return sum + (price * r.totalHours);
      }, 0);

    // 알루점 매출 집계
    const alAmount = reservations
      .filter((r: any) => r.date === fullDate && r.roomId.startsWith('room-al-') && r.status !== 'canceled')
      .reduce((sum: number, r: any) => {
        let price = 6000;
        if (r.roomId === 'room-al-1') price = 13000;
        else if (r.roomId === 'room-al-7' || r.roomId === 'room-al-10') price = 10000;
        return sum + (price * r.totalHours);
      }, 0);

    // 위례점 매출 집계
    const wrAmount = reservations
      .filter((r: any) => r.date === fullDate && r.roomId.startsWith('room-wr-') && r.status !== 'canceled')
      .reduce((sum: number, r: any) => {
        let price = 3500;
        if (r.roomId === 'room-wr-8') price = 6000;
        else if (r.roomId === 'room-wr-1' || r.roomId === 'room-wr-2') price = 2500;
        return sum + (price * r.totalHours);
      }, 0);
      
    return { date: label, jeongja: jjAmount, suji: sjAmount, alu: alAmount, wirye: wrAmount };
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get('branch') || '정자점';
  const d = new Date();
  const kst = new Date(d.getTime() + (9 * 60 * 60 * 1000));
  const fallbackToday = (kst.toISOString().split('T')[0] && kst.toISOString().split('T')[0].startsWith('2026-'))
    ? kst.toISOString().split('T')[0]
    : "2026-09-02";

  const date = searchParams.get('date') || fallbackToday;
  const all = searchParams.get('all') === 'true';

  if (all) {
    try {
      const jsonPath = path.join(process.cwd(), 'src/scripts/syncedReservations.json');
      if (fs.existsSync(jsonPath)) {
        const fileData = fs.readFileSync(jsonPath, 'utf8');
        const reservations = JSON.parse(fileData);
        const revenues = getRealNaverRevenuesFallback(reservations);
        return NextResponse.json({
          success: true,
          source: 'naver-all',
          reservations,
          revenues,
          dailyComparisonSales: computeDailyComparisonSales()
        }, {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
      }
    } catch (e) {
      console.error("[SyncAPI] load all fail:", e);
    }
  }

  let businessId = '1294414';
  try {
    const configPath = path.join(process.cwd(), 'src/scripts/branchConfigs.json');
    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (configData[branch] && configData[branch].businessId) {
        businessId = configData[branch].businessId;
      } else {
        businessId = branch === '정자점' ? '1294414' : branch === '수지구청점' ? '1457642' : (branch === '위례점' || branch === '위례') ? '1720088' : '1689190';
      }
    }
  } catch (e) {
    businessId = branch === '정자점' ? '1294414' : branch === '수지구청점' ? '1457642' : (branch === '위례점' || branch === '위례') ? '1720088' : '1689190';
  }

  try {
    const naverApiUrl = `https://booking.naver.com/api/v1/biz/${businessId}/calendar?date=${date}`;
    
    // 네이버 실시간 API 3.5초 응답 지연 방어선 구축 (초과 시 로컬 DB Fallback 기동)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(naverApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://booking.naver.com/'
      },
      signal: controller.signal,
      next: { revalidate: 60 }
    });
    
    clearTimeout(timeoutId);

    if (response.ok) {
      const rawText = await response.text();
      if (!rawText || !rawText.trim().startsWith('{')) {
        throw new Error("Naver API returned HTML/Invalid content instead of JSON");
      }
      
      const data = JSON.parse(rawText);
      
      if (data && data.bizItems) {
        const reservations: any[] = [];
        const revenues: any[] = [];
        
        data.bizItems.forEach((item: any) => {
          if (item.schedules) {
            item.schedules.forEach((sch: any) => {
              if (sch.isBooked) {
                const resId = `res-naver-${sch.scheduleId}`;
                const resourceSeq = item.order + 1;
                const roomId = branch === '정자점' 
                  ? `room-jj-${resourceSeq}` 
                  : branch === '수지구청점'
                    ? `room-sj-${resourceSeq}`
                    : (branch === '위례점' || branch === '위례')
                      ? `room-wr-${resourceSeq}`
                      : `room-al-${resourceSeq}`;

                reservations.push({
                  id: resId,
                  roomId: roomId,
                  userId: 'naver-user',
                  userName: '네이버 실시간 예약',
                  userPhone: '010-XXXX-XXXX',
                  date: date,
                  startTime: sch.startHour,
                  endTime: sch.endHour,
                  totalHours: sch.endHour - sch.startHour,
                  status: 'reserved',
                  createdAt: new Date().toISOString()
                });
              }
            });
          }
        });
        
        if (reservations.length > 0) {
          const syncedRevenues = getRealNaverRevenuesFallback(reservations);
          return NextResponse.json({ 
            success: true, 
            source: 'naver-live', 
            reservations, 
            revenues: syncedRevenues,
            dailyComparisonSales: computeDailyComparisonSales()
          }, {
            headers: {
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
        }
      }
    }
    
    // Fallback 분기
    const fallbackReservations = getRealNaverBookingFallback(branch, date);
    const fallbackRevenues = getRealNaverRevenuesFallback(fallbackReservations);
    
    return NextResponse.json({
      success: true,
      source: 'naver-fallback',
      reservations: fallbackReservations,
      revenues: fallbackRevenues,
      dailyComparisonSales: computeDailyComparisonSales()
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error("Naver sync API error:", error);
    const fallbackReservations = getRealNaverBookingFallback(branch, date);
    const fallbackRevenues = getRealNaverRevenuesFallback(fallbackReservations);
    
    return NextResponse.json({
      success: true,
      source: 'naver-error-fallback',
      reservations: fallbackReservations,
      revenues: fallbackRevenues,
      dailyComparisonSales: computeDailyComparisonSales()
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }
}

function getRealNaverBookingFallback(branch: string, date: string) {
  try {
    const jsonPath = path.join(process.cwd(), 'src/scripts/syncedReservations.json');
    if (fs.existsSync(jsonPath)) {
      const fileData = fs.readFileSync(jsonPath, 'utf8');
      const reservations = JSON.parse(fileData);
      const branchPrefix = branch === '정자점' 
        ? 'room-jj-' 
        : branch === '수지구청점' 
          ? 'room-sj-' 
          : (branch === '위례점' || branch === '위례')
            ? 'room-wr-'
            : 'room-al-';
      
      const filtered = reservations.filter((r: any) => 
        r.date === date && r.roomId.startsWith(branchPrefix)
      );
      
      if (filtered.length > 0) {
        return filtered;
      }
    }
  } catch (e) {
    console.error("Fallback load fail:", e);
  }

  // 과거 목업 테스트용 정적 더미 분기는 실시간 DB 100% 전환에 따라 주석 처리합니다.
  /*
  const list = [];
  if (date === '2026-08-29') {
    if (branch === '정자점') {
      list.push({
        id: `res-jj-naver-1`,
        roomId: 'room-jj-1',
        userId: 'user-naver-1',
        userName: '네이버 예약자',
        userPhone: '010-XXXX-XXXX',
        date: date,
        startTime: 18.0, 
        endTime: 20.5,   
        totalHours: 2.5,
        status: 'reserved',
        createdAt: new Date().toISOString()
      });
      list.push({
        id: `res-jj-naver-2`,
        roomId: 'room-jj-7',
        userId: 'user-naver-2',
        userName: '네이버 예약자',
        userPhone: '010-XXXX-XXXX',
        date: date,
        startTime: 19.0, 
        endTime: 21.0,   
        totalHours: 2.0,
        status: 'reserved',
        createdAt: new Date().toISOString()
      });
    } else if (branch === '수지구청점') {
      list.push({
        id: `res-sj-naver-1`,
        roomId: 'room-sj-8', 
        userId: 'user-naver-3',
        userName: '네이버 예약자',
        userPhone: '010-XXXX-XXXX',
        date: date,
        startTime: 17.5, 
        endTime: 20.0,   
        totalHours: 2.5,
        status: 'reserved',
        createdAt: new Date().toISOString()
      });
      list.push({
        id: `res-sj-naver-2`,
        roomId: 'room-sj-4', 
        userId: 'user-naver-4',
        userName: '네이버 예약자',
        userPhone: '010-XXXX-XXXX',
        date: date,
        startTime: 19.0, 
        endTime: 21.0,   
        totalHours: 2.0,
        status: 'reserved',
        createdAt: new Date().toISOString()
      });
    }
  } else if (date === '2026-08-30') {
    if (branch === '정자점') {
      list.push({
        id: `res-jj-naver-30-1`,
        roomId: 'room-jj-3',
        userId: 'user-naver-5',
        userName: '네이버 예약자',
        userPhone: '010-XXXX-XXXX',
        date: date,
        startTime: 10.5, 
        endTime: 17.0,   
        totalHours: 6.5,
        status: 'reserved',
        createdAt: new Date().toISOString()
      });
      list.push({
        id: `res-jj-naver-30-2`,
        roomId: 'room-jj-3',
        userId: 'user-naver-6',
        userName: '네이버 예약자',
        userPhone: '010-XXXX-XXXX',
        date: date,
        startTime: 18.0, 
        endTime: 21.0,   
        totalHours: 3.0,
        status: 'reserved',
        createdAt: new Date().toISOString()
      });
    } else if (branch === '수지구청점') {
      list.push({
        id: `res-sj-naver-30-1`,
        roomId: 'room-sj-3',
        userId: 'user-naver-7',
        userName: '네이버 예약자',
        userPhone: '010-XXXX-XXXX',
        date: date,
        startTime: 12.0, 
        endTime: 17.0,   
        totalHours: 5.0,
        status: 'reserved',
        createdAt: new Date().toISOString()
      });
    }
  }
  */
  return [];
}

function getRealNaverRevenuesFallback(reservations: any[]) {
  return reservations.map((res, i) => {
    let price = 10000;
    const isJeongja = res.roomId.startsWith('room-jj-');
    const isSuji = res.roomId.startsWith('room-sj-');
    const isAlu = res.roomId.startsWith('room-al-');
    const isWirye = res.roomId.startsWith('room-wr-');

    if (isJeongja) {
      if (res.roomId.includes('room-jj-7')) price = 18000;
      else if (res.roomId.endsWith('-1') || res.roomId.endsWith('-2')) price = 6000;
      else price = 10000;
    } else if (isSuji) {
      if (res.roomId.includes('room-sj-8')) price = 20000;
      else if (res.roomId.endsWith('-1') || res.roomId.endsWith('-2')) price = 6000;
      else price = 10000;
    } else if (isAlu) {
      if (res.roomId.includes('room-al-1')) price = 13000;
      else if (res.roomId.includes('room-al-7') || res.roomId.includes('room-al-10')) price = 10000;
      else price = 6000;
    } else if (isWirye) {
      if (res.roomId.includes('room-wr-8')) price = 6000;
      else if (res.roomId.endsWith('-1') || res.roomId.endsWith('-2')) price = 2500;
      else price = 3500;
    }

    const paymentDate = `${res.date}T09:00:00.000Z`;
    const branchPrefix = isJeongja ? 'jj' : isSuji ? 'sj' : isWirye ? 'wr' : 'al';

    return {
      id: `rev-naver-${branchPrefix}-${res.id}`,
      reservationId: res.id,
      roomId: res.roomId,
      amount: price * res.totalHours,
      paymentMethod: 'card',
      paymentDate: paymentDate,
      status: 'paid'
    };
  });
}
