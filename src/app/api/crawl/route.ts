import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

let isCrawlingRunning = false;

export async function POST() {
  if (isCrawlingRunning) {
    return NextResponse.json({
      success: false,
      message: '이미 네이버 스크래퍼가 백그라운드에서 실행 중입니다. 완료되면 자동 갱신됩니다.'
    }, { status: 409 });
  }

  isCrawlingRunning = true;
  const scriptName = ['naver', 'Crawler.js'].join('');
  const scriptPath = path.resolve(process.cwd(), 'src', 'scripts', scriptName);
  const nodePath = process.execPath || 'node';

  console.log('[CrawlAPI] Spawning background naverCrawler.js using node:', nodePath);

  const env = {
    ...process.env,
    PATH: `${process.env.PATH || ''}:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin`
  };

  const child = spawn(/*turbopackIgnore: true*/ nodePath, [scriptPath], {
    cwd: process.cwd(),
    env
  });

  let stderrData = '';

  child.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  child.on('error', (err) => {
    isCrawlingRunning = false;
    console.error('[CrawlAPI] Background spawn error:', err);
  });

  child.on('close', (code) => {
    isCrawlingRunning = false;
    console.log(`[CrawlAPI] Background crawler process exited with code ${code}`);
    if (code !== 0) {
      console.error('[CrawlAPI] Stderr output:', stderrData);
    }
  });

  // 즉시 200 OK 응답 반환 (HTTP 타임아웃 및 Failed to fetch 에러 원천 차단)
  return NextResponse.json({
    success: true,
    message: '네이버 스크래퍼가 백그라운드에서 기동되었습니다. 수집 완료 시 화면이 자동 갱신됩니다.'
  });
}

export async function GET() {
  return NextResponse.json({
    isRunning: isCrawlingRunning
  });
}
