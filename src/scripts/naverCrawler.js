const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const delay = (ms) => new Promise(res => setTimeout(res, ms));

function parseTimeIntervals(slots) {
  const bookedSlots = slots.filter(s => s.disabled).map(s => {
    let timeStr = s.originalLabel.replace('오전 ', '').replace('오후 ', '').trim();
    let [h, m] = timeStr.split(':').map(Number);
    let isPm = s.originalLabel.includes('오후');
    if (isPm && h !== 12) h += 12;
    if (!isPm && h === 12) h = 0;
    return h + (m === 30 ? 0.5 : 0);
  }).sort((a, b) => a - b);

  if (bookedSlots.length === 0) return [];

  const intervals = [];
  let start = bookedSlots[0];
  let prev = bookedSlots[0];

  for (let i = 1; i < bookedSlots.length; i++) {
    const curr = bookedSlots[i];
    if (curr - prev === 0.5) {
      prev = curr;
    } else {
      intervals.push({
        startTime: start,
        endTime: prev + 0.5,
        totalHours: (prev + 0.5) - start
      });
      start = curr;
      prev = curr;
    }
  }
  intervals.push({
    startTime: start,
    endTime: prev + 0.5,
    totalHours: (prev + 0.5) - start
  });

  return intervals;
}

// 오늘(29일)부터 7일간의 날짜 목록 자동 생성 헬퍼
function getTargetDates() {
  const dates = [];
  const start = new Date('2026-08-29T12:00:00'); // 시스템 기준시
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = String(d.getDate());
    const fullDate = `${year}-${String(month).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    dates.push({ year, month, day, fullDate });
  }
  return dates;
}

// 모바일 터치(Tap) 이벤트를 활용해 더보기를 눌러 룸 카드 리스트를 무결하게 펼치는 고도화 함수
async function expandList(page) {
  // 스크롤 다운
  await page.evaluate(() => {
    window.scrollTo(0, 5000);
  });
  await delay(1500);
  
  const moreBtnSelector = 'button.button_more, .btn_more_area button, [class*="button_more"]';
  
  try {
    const moreBtn = await page.$(moreBtnSelector);
    if (moreBtn) {
      const isVisible = await page.evaluate((sel) => {
        const btn = document.querySelector(sel);
        return btn && btn.style.display !== 'none' && btn.offsetHeight > 0;
      }, moreBtnSelector);
      
      if (isVisible) {
        console.log(`[Crawler] More button is visible. Hovering & tapping via Puppeteer...`);
        await moreBtn.hover();
        await delay(500);
        // 모바일 터치 이벤트 시뮬레이션
        await page.tap(moreBtnSelector);
        console.log(`[Crawler] Tapped. Waiting 4 seconds for list expansion...`);
        await delay(4000);
        
        // 추가 스크롤 다운
        await page.evaluate(() => {
          window.scrollTo(0, 5000);
        });
        await delay(1000);
      }
    }
  } catch (err) {
    console.log(`[Crawler] Expand list skipped/failed:`, err.message);
  }
}

async function crawlBranch(businessId, branchName, targetDates) {
  console.log(`\n==================================================`);
  console.log(`[Crawler] Starting 7-Day Crawl for branch: ${branchName} (${businessId})...`);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const allReservations = [];
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1');
    
    const listUrl = `https://m.booking.naver.com/booking/10/bizes/${businessId}`;
    await page.goto(listUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    const itemSelector = 'li[class*="booking_item"]';
    await page.waitForSelector(itemSelector, { timeout: 15000 });
    
    // 리스트 확장 적용
    await expandList(page);
    
    // 룸 목록 카드 개수 확인
    const cardCount = await page.evaluate((sel) => {
      return document.querySelectorAll(sel).length;
    }, itemSelector);
    
    console.log(`[Crawler] Total rooms count to crawl: ${cardCount}`);
    
    if (cardCount === 0) {
      console.log(`[Crawler] Warning: Card count is 0. Retrying to read list elements...`);
      // 폴백 셀렉터로 재시도
      const fallbackCount = await page.evaluate(() => {
        return document.querySelectorAll('li[class*="item"], .booking_item').length;
      });
      console.log(`[Crawler] Fallback selector count: ${fallbackCount}`);
    }
    
    for (let i = 0; i < cardCount; i++) {
      console.log(`\n[Crawler] Processing Room index ${i + 1}/${cardCount}...`);
      
      await page.goto(listUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector(itemSelector, { timeout: 15000 });
      await expandList(page);
      
      const roomInfo = await page.evaluate((sel, index) => {
        const list = document.querySelectorAll(sel);
        const card = list[index];
        if (!card) return null;
        
        const text = card.innerText || '';
        const nameMatch = text.match(/(ROOM\d+)/);
        const name = nameMatch ? nameMatch[1] : `ROOM${index + 1}`;
        
        const link = card.querySelector('a, button') || card;
        link.click();
        
        return { name };
      }, itemSelector, i);
      
      if (!roomInfo) continue;
      
      console.log(`[Crawler] Clicked ${roomInfo.name}. Waiting for schedule page load...`);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
      await delay(3000);
      
      for (const targetDate of targetDates) {
        console.log(`[Crawler] Crawling ${roomInfo.name} on: ${targetDate.fullDate}...`);
        
        // A. 달력 헤더 월(Month) 검사 및 이동 처리 (8월 -> 9월 전환 대응)
        const currentCalMonth = await page.evaluate(() => {
          const title = document.querySelector('.calendar_title');
          return title ? title.innerText.trim() : ''; // 예: '2026.8'
        });
        const targetCalMonth = `${targetDate.year}.${targetDate.month}`;
        
        if (currentCalMonth && !currentCalMonth.includes(targetCalMonth)) {
          console.log(`[Crawler] Month mismatch (current: ${currentCalMonth}, target: ${targetCalMonth}). Swapping month...`);
          const nextBtn = await page.$('button.btn_next');
          if (nextBtn) {
            await nextBtn.click();
            await delay(2000);
          }
        }
        
        // B. 날짜 클릭
        const clicked = await page.evaluate((d) => {
          const dates = document.querySelectorAll('button[class*="calendar_date"]');
          for (let el of dates) {
            const numSpan = el.querySelector('.num');
            if (numSpan && numSpan.innerText.trim() === d) {
              if (!el.className.includes('unselectable') && !el.hasAttribute('disabled')) {
                el.click();
                return { success: true };
              }
            }
          }
          return { success: false };
        }, targetDate.day);
        
        if (!clicked.success) {
          console.log(`[Crawler] Day ${targetDate.day} is not selectable.`);
          continue;
        }
        
        await delay(2000); // 로드 대기
        
        // C. 시간 스케줄 획득
        const timeSlots = await page.evaluate(() => {
          const slots = [];
          const items = document.querySelectorAll('li[class*="time_item"]');
          items.forEach((el) => {
            const btn = el.querySelector('button');
            if (btn) {
              const label = btn.getAttribute('aria-label') || '';
              const isDisabled = btn.getAttribute('aria-disabled') === 'true' || 
                                 el.className.includes('disabled') || 
                                 btn.hasAttribute('disabled');
              if (label) {
                slots.push({
                  originalLabel: label,
                  disabled: isDisabled
                });
              }
            }
          });
          return slots;
        });
        
        const intervals = parseTimeIntervals(timeSlots);
        intervals.forEach((interval, idx) => {
          const roomNum = roomInfo.name.replace('ROOM', '');
          const roomId = branchName === '정자점' ? `room-jj-${roomNum}` : `room-sj-${roomNum}`;
          
          allReservations.push({
            id: `res-naver-auto-${branchName === '정자점' ? 'jj' : 'sj'}-${roomNum}-${targetDate.fullDate}-${idx}`,
            roomId: roomId,
            roomName: roomInfo.name,
            userId: 'user-naver-auto',
            userName: '네이버 예약자',
            userPhone: '010-XXXX-XXXX',
            date: targetDate.fullDate,
            startTime: interval.startTime,
            endTime: interval.endTime,
            totalHours: interval.totalHours,
            status: 'reserved',
            createdAt: new Date().toISOString()
          });
        });
      }
    }
    
  } catch (err) {
    console.error(`[Crawler] Branch ${branchName} crawl failed:`, err);
  } finally {
    await browser.close();
    console.log(`[Crawler] Browser closed for ${branchName}.`);
  }
  
  return allReservations;
}

async function run() {
  const targetDates = getTargetDates();
  console.log("[Crawler] Calculated Target Dates (7-Days):", targetDates.map(d => d.fullDate));
  
  // 1. 정자점 크롤링
  const jeongjaRes = await crawlBranch('1294414', '정자점', targetDates);
  // 2. 수지구청점 크롤링
  const sujiRes = await crawlBranch('1457642', '수지구청점', targetDates);
  
  const newReservations = [...jeongjaRes, ...sujiRes];
  
  // ==========================================
  // [영구 보존 데이터 병합 및 Upsert 로직]
  // ==========================================
  const dumpPath = path.join(__dirname, 'syncedReservations.json');
  let existingReservations = [];
  
  if (fs.existsSync(dumpPath)) {
    try {
      const fileContent = fs.readFileSync(dumpPath, 'utf8');
      existingReservations = JSON.parse(fileContent);
    } catch(e) {
      console.error("[Crawler] Failed to read existing database:", e.message);
    }
  }
  
  const newDatesSet = new Set(targetDates.map(d => d.fullDate));
  const preservedReservations = existingReservations.filter(res => !newDatesSet.has(res.date));
  const mergedReservations = [...preservedReservations, ...newReservations];
  
  fs.writeFileSync(dumpPath, JSON.stringify(mergedReservations, null, 2), 'utf8');
  
  console.log(`\n==================================================`);
  console.log(`[Crawler] 7-Day Crawl finished!`);
  console.log(`  - New Crawled: ${newReservations.length} reservations`);
  console.log(`  - Preserved History: ${preservedReservations.length} reservations`);
  console.log(`  - Total Saved Database: ${mergedReservations.length} reservations`);
}

run();
