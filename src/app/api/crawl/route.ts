import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

let isCrawlingRunning = false;

export async function POST() {
  if (isCrawlingRunning) {
    return NextResponse.json({
      success: false,
      message: '이미 네이버 스크래퍼가 백그라운드에서 실행 중입니다. 잠시 후 완료되면 자동 갱신됩니다.'
    }, { status: 409 });
  }

  isCrawlingRunning = true;
  const scriptPath = path.join(process.cwd(), 'src/scripts/naverCrawler.js');

  return new Promise<NextResponse>((resolve) => {
    console.log('[CrawlAPI] Triggering naverCrawler.js execution...');

    exec(`node "${scriptPath}"`, { cwd: process.cwd(), timeout: 180000 }, (error, stdout, stderr) => {
      isCrawlingRunning = false;

      if (error) {
        console.error('[CrawlAPI] Crawler execution error:', error);
        resolve(NextResponse.json({
          success: false,
          message: '스크래퍼 실행 중 오류가 발생했습니다: ' + error.message,
          error: error.message
        }, { status: 500 }));
        return;
      }

      console.log('[CrawlAPI] Crawler finished successfully.');
      
      // syncedReservations.json 파일 읽기
      try {
        const jsonPath = path.join(process.cwd(), 'src/scripts/syncedReservations.json');
        let totalCount = 0;
        if (fs.existsSync(jsonPath)) {
          const fileData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          totalCount = fileData.length;
        }

        resolve(NextResponse.json({
          success: true,
          message: `네이버 4개 지점 전체 스크래핑 갱신이 완료되었습니다. (총 ${totalCount}건 수집)`,
          totalCount
        }));
      } catch (e: any) {
        resolve(NextResponse.json({
          success: true,
          message: '네이버 스크래퍼 실행이 완료되었습니다.',
        }));
      }
    });
  });
}

export async function GET() {
  return NextResponse.json({
    isRunning: isCrawlingRunning
  });
}
