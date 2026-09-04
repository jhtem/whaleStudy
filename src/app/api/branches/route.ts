const fs = require('fs');
const path = require('path');
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const configPath = path.join(process.cwd(), 'src/scripts/branchConfigs.json');

function getBranchConfigs() {
  const defaultConfigs: Record<string, any> = {
    '정자점': { name: '정자점', businessId: '1294414', bookingUrl: 'https://booking.naver.com/booking/10/bizes/1294414' },
    '수지구청점': { name: '수지구청점', businessId: '1457642', bookingUrl: 'https://booking.naver.com/booking/10/bizes/1457642' },
    '알루': { name: '알루', businessId: '1689190', bookingUrl: 'https://booking.naver.com/booking/10/bizes/1689190' },
    '위례점': { name: '위례점', businessId: '1720088', bookingUrl: 'https://booking.naver.com/booking/10/bizes/1720088' }
  };

  if (fs.existsSync(configPath)) {
    try {
      const data = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error("[BranchAPI] Failed to read branchConfigs.json:", e);
    }
  }
  return defaultConfigs;
}

export async function GET() {
  const configs = getBranchConfigs();
  return NextResponse.json({ success: true, configs });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { branchName, bookingUrl } = body;

    if (!branchName || !bookingUrl) {
      return NextResponse.json({ success: false, message: '지점명과 예약 URL을 모두 입력해 주세요.' }, { status: 400 });
    }

    // URL에서 businessId 파싱 (bizes/1234567 또는 숫자 6~10자리)
    const match = bookingUrl.match(/bizes\/(\d+)/) || bookingUrl.match(/(\d{6,10})/);
    if (!match) {
      return NextResponse.json({ success: false, message: '유효한 네이버 예약 URL 형식이 아닙니다. (예: https://booking.naver.com/booking/10/bizes/1294414)' }, { status: 400 });
    }

    const businessId = match[1];
    const configs = getBranchConfigs();

    // 입력된 URL을 정제 (bizes/{businessId} 형식)
    const cleanUrl = bookingUrl.includes('bizes/') 
      ? bookingUrl.split('?')[0] 
      : `https://booking.naver.com/booking/10/bizes/${businessId}`;

    configs[branchName] = {
      name: branchName,
      businessId: businessId,
      bookingUrl: cleanUrl
    };

    fs.writeFileSync(configPath, JSON.stringify(configs, null, 2), 'utf8');

    return NextResponse.json({
      success: true,
      message: `${branchName}의 네이버 예약 URL이 업데이트되었습니다.`,
      config: configs[branchName],
      configs
    });
  } catch (error: any) {
    console.error("[BranchAPI] Update error:", error);
    return NextResponse.json({ success: false, message: error.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
