import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
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
  const nodePath = process.execPath || 'node';

  return new Promise<NextResponse>((resolve) => {
    console.log('[CrawlAPI] Spawning naverCrawler.js using node:', nodePath);

    const env = {
      ...process.env,
      PATH: `${process.env.PATH || ''}:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin`
    };

    const child = spawn(nodePath, [scriptPath], {
      cwd: process.cwd(),
      env
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    child.on('error', (err) => {
      isCrawlingRunning = false;
      console.error('[CrawlAPI] Spawn error:', err);
      resolve(NextResponse.json({
        success: false,
        message: '스크래퍼 프로세스 기동 실패: ' + err.message,
        error: err.message
      }, { status: 500 }));
    });

    child.on('close', (code) => {
      isCrawlingRunning = false;
      console.log(`[CrawlAPI] Crawler process exited with code ${code}`);

      if (code !== 0) {
        console.error('[CrawlAPI] Stderr output:', stderrData);
        const errMsg = stderrData ? stderrData.trim().slice(-300) : `종료 코드 ${code}`;
        resolve(NextResponse.json({
          success: false,
          message: '스크래퍼 실행 중 오류가 발생했습니다: ' + errMsg,
          error: errMsg
        }, { status: 500 }));
        return;
      }

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
