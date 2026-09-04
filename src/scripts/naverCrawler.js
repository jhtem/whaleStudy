const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const delay = (ms) => new Promise(res => setTimeout(res, ms));

// 100% 네이버 원본 4개 지점 33개 룸 실물 URL 맵
const BRANCH_ROOMS = {
  '1294414': [
    { name: 'ROOM1', url: 'https://m.booking.naver.com/booking/10/bizes/1294414/items/6401642' },
    { name: 'ROOM2', url: 'https://m.booking.naver.com/booking/10/bizes/1294414/items/6413488' },
    { name: 'ROOM3', url: 'https://m.booking.naver.com/booking/10/bizes/1294414/items/6413520' },
    { name: 'ROOM4', url: 'https://m.booking.naver.com/booking/10/bizes/1294414/items/6413525' },
    { name: 'ROOM5', url: 'https://m.booking.naver.com/booking/10/bizes/1294414/items/6413534' },
    { name: 'ROOM6', url: 'https://m.booking.naver.com/booking/10/bizes/1294414/items/6413542' },
    { name: 'ROOM7', url: 'https://m.booking.naver.com/booking/10/bizes/1294414/items/6413548' }
  ],
  '1457642': [
    { name: 'ROOM1', url: 'https://m.booking.naver.com/booking/10/bizes/1457642/items/6911601' },
    { name: 'ROOM2', url: 'https://m.booking.naver.com/booking/10/bizes/1457642/items/6911608' },
    { name: 'ROOM3', url: 'https://m.booking.naver.com/booking/10/bizes/1457642/items/6911610' },
    { name: 'ROOM4', url: 'https://m.booking.naver.com/booking/10/bizes/1457642/items/6911611' },
    { name: 'ROOM5', url: 'https://m.booking.naver.com/booking/10/bizes/1457642/items/6911612' },
    { name: 'ROOM6', url: 'https://m.booking.naver.com/booking/10/bizes/1457642/items/6911613' },
    { name: 'ROOM7', url: 'https://m.booking.naver.com/booking/10/bizes/1457642/items/6911614' },
    { name: 'ROOM8', url: 'https://m.booking.naver.com/booking/10/bizes/1457642/items/6911615' }
  ],
  '1689190': [
    { name: 'ALU. 1', url: 'https://m.booking.naver.com/booking/10/bizes/1689190/items/7830318' },
    { name: 'ALU. 2', url: 'https://m.booking.naver.com/booking/10/bizes/1689190/items/7830388' },
    { name: 'ALU. 3', url: 'https://m.booking.naver.com/booking/10/bizes/1689190/items/7836327' },
    { name: 'ALU. 4', url: 'https://m.booking.naver.com/booking/10/bizes/1689190/items/7836336' },
    { name: 'ALU. 5', url: 'https://m.booking.naver.com/booking/10/bizes/1689190/items/7836343' },
    { name: 'ALU. 6', url: 'https://m.booking.naver.com/booking/10/bizes/1689190/items/7836347' },
    { name: 'ALU. 7', url: 'https://m.booking.naver.com/booking/10/bizes/1689190/items/7836353' },
    { name: 'ALU. 8', url: 'https://m.booking.naver.com/booking/10/bizes/1689190/items/7836370' },
    { name: 'ALU. 9', url: 'https://m.booking.naver.com/booking/10/bizes/1689190/items/7836389' },
    { name: 'ALU. 10', url: 'https://m.booking.naver.com/booking/10/bizes/1689190/items/7836395' }
  ],
  '1720088': [
    { name: 'ROOM1', url: 'https://m.booking.naver.com/booking/10/bizes/1720088/items/7993899' },
    { name: 'ROOM2', url: 'https://m.booking.naver.com/booking/10/bizes/1720088/items/7993909' },
    { name: 'ROOM3', url: 'https://m.booking.naver.com/booking/10/bizes/1720088/items/7993910' },
    { name: 'ROOM4', url: 'https://m.booking.naver.com/booking/10/bizes/1720088/items/7993934' },
    { name: 'ROOM5', url: 'https://m.booking.naver.com/booking/10/bizes/1720088/items/7993943' },
    { name: 'ROOM6', url: 'https://m.booking.naver.com/booking/10/bizes/1720088/items/7993945' },
    { name: 'ROOM7', url: 'https://m.booking.naver.com/booking/10/bizes/1720088/items/7993948' },
    { name: 'ROOM8', url: 'https://m.booking.naver.com/booking/10/bizes/1720088/items/7993951' }
  ]
};

function parse30MinSlots(slots) {
  const bookedBlocks = [];
  slots.forEach(s => {
    if (!s.disabled) return;
    const raw = s.label || '';
    if (raw.includes('주소') || raw.includes('전화') || raw.includes('확인') || raw.includes('운영시간') || raw.includes('시작하기') || raw.includes('공간')) return;

    let h = null;
    let m = 0;

    const match24 = raw.match(/(\d{1,2}):(\d{2})/);
    if (match24) {
      h = parseInt(match24[1], 10);
      m = parseInt(match24[2], 10);
      let isPm = raw.includes('오후') || raw.includes('PM') || raw.includes('pm');
      if (isPm && h < 12) h += 12;
      if (!isPm && raw.includes('오전') && h === 12) h = 0;
    } else {
      const matchHour = raw.match(/(\d{1,2})\s*시/);
      if (matchHour) {
        h = parseInt(matchHour[1], 10);
        let isPm = raw.includes('오후') || raw.includes('PM') || raw.includes('pm');
        if (isPm && h < 12) h += 12;
        if (!isPm && raw.includes('오전') && h === 12) h = 0;
        if (raw.includes('30분') || raw.includes(':30')) m = 30;
      }
    }

    if (h === null) return;
    const startVal = h + (m >= 30 ? 0.5 : 0);
    if (startVal >= 23) return; // 23시 이상 야간 휴무 슬롯 제외

    bookedBlocks.push({
      startTime: startVal,
      endTime: Math.round((startVal + 0.5) * 10) / 10,
      totalHours: 0.5
    });
  });

  if (bookedBlocks.length === 0) return [];
  bookedBlocks.sort((a, b) => a.startTime - b.startTime);

  const merged = [];
  let cur = { ...bookedBlocks[0] };

  for (let i = 1; i < bookedBlocks.length; i++) {
    const next = bookedBlocks[i];
    if (Math.abs(next.startTime - cur.endTime) < 0.01) {
      cur.endTime = Math.round((next.endTime) * 10) / 10;
      cur.totalHours = Math.round((cur.endTime - cur.startTime) * 10) / 10;
    } else {
      merged.push(cur);
      cur = { ...next };
    }
  }
  merged.push(cur);
  return merged;
}

function getTargetDates() {
  const dates = [];
  const kst = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
  const start = new Date(kst.toISOString().split('T')[0] + 'T00:00:00');
  
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

async function crawlBranch(businessId, branchName, targetDates) {
  console.log(`\n==================================================`);
  console.log(`[Crawler] Starting Crawl for branch: ${branchName} (${businessId})...`);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const allReservations = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1');
    
    const targetRooms = BRANCH_ROOMS[businessId] || [];
    console.log(`[Crawler] Processing ${targetRooms.length} rooms for ${branchName}.`);

    for (let i = 0; i < targetRooms.length; i++) {
      const targetRoom = targetRooms[i];
      const roomName = targetRoom.name;
      console.log(`[Crawler] (${i + 1}/${targetRooms.length}) Processing ${branchName} - ${roomName}...`);
      
      await page.goto(targetRoom.url, { waitUntil: 'networkidle2', timeout: 30000 });
      await delay(2500);
      
      for (const targetDate of targetDates) {
        let currentCalMonth = await page.evaluate(() => {
          const title = document.querySelector('.calendar_title, [class*="calendar_title"], .month');
          return title ? title.innerText.trim() : '';
        });
        const targetCalMonth = `${targetDate.year}.${targetDate.month}`;
        const targetCalMonthAlt = `${targetDate.year}. ${targetDate.month}`;
        
        if (currentCalMonth && !currentCalMonth.includes(targetCalMonth) && !currentCalMonth.includes(targetCalMonthAlt)) {
          const btn = await page.$('button.btn_next, [class*="btn_next"]');
          if (btn) {
            await btn.click();
            await delay(2000);
          }
        }
        
        const clickResult = await page.evaluate((targetDay) => {
          const dates = document.querySelectorAll('button[class*="calendar_date"]');
          for (let el of dates) {
            const numSpan = el.querySelector('.num');
            if (numSpan && numSpan.innerText.trim() === targetDay) {
              el.scrollIntoView({ block: 'center' });
              el.click();
              return true;
            }
          }
          return false;
        }, targetDate.day);
        
        if (!clickResult) continue;
        await delay(2500);
        
        const timeSlots = await page.evaluate(() => {
          const slots = [];
          const items = document.querySelectorAll('li[class*="time_item"], div[class*="time_item"], [class*="time_item"]');
          items.forEach((el) => {
            const btn = el.querySelector('button') || el;
            const label = (btn.getAttribute('aria-label') || el.innerText || btn.innerText || '').replace(/\n/g, ' ').trim();
            const isDisabled = btn.getAttribute('aria-disabled') === 'true' || 
                               el.className.includes('disabled') || 
                               btn.hasAttribute('disabled');
            if (label) slots.push({ label, disabled: isDisabled });
          });
          return slots;
        });
        
        const intervals = parse30MinSlots(timeSlots);
        
        let prefix = "jj";
        if (businessId === '1457642') prefix = "sj";
        else if (businessId === '1689190') prefix = "al";
        else if (businessId === '1720088') prefix = "wr";
        
        let roomNumStr = "1";
        const numMatch = roomName.match(/\d+/);
        if (numMatch) roomNumStr = numMatch[0];
        const mappedRoomId = `room-${prefix}-${roomNumStr}`;
        
        intervals.forEach((interval, idx) => {
          allReservations.push({
            id: `crawl-${prefix}-${targetDate.fullDate.replace(/-/g, '')}-${roomNumStr}-${idx + 1}`,
            roomId: mappedRoomId,
            roomName: roomName,
            userId: `user-crawl-${idx + 1}`,
            userName: `네이버예약자${idx + 1}`,
            userPhone: '010-0000-0000',
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
  }
  
  return allReservations;
}

function loadBranchConfigs() {
  const configPath = path.join(__dirname, 'branchConfigs.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {}
  }
  return {
    '정자점': { name: '정자점', businessId: '1294414' },
    '수지구청점': { name: '수지구청점', businessId: '1457642' },
    '알루': { name: '알루', businessId: '1689190' },
    '위례점': { name: '위례점', businessId: '1720088' }
  };
}

async function run() {
  const targetDates = getTargetDates();
  const branchConfigs = loadBranchConfigs();
  const allBranchKeys = Object.keys(branchConfigs);
  const newReservations = [];

  for (const key of allBranchKeys) {
    const config = branchConfigs[key];
    const branchRes = await crawlBranch(config.businessId, config.name, targetDates);
    newReservations.push(...branchRes);
  }
  
  const dumpPath = path.join(__dirname, 'syncedReservations.json');
  let existingReservations = [];
  
  if (fs.existsSync(dumpPath)) {
    try {
      existingReservations = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
    } catch(e) {}
  }
  
  const kst = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
  const todayStr = kst.toISOString().split('T')[0];
  const mergedReservations = [];
  
  // A. 지나간 과거 날짜 데이터만 메모리/DB 영구 보존
  existingReservations.forEach(res => {
    if (res && res.date && res.date < todayStr) {
      if (res.startTime < 23 && res.endTime <= 23) {
        mergedReservations.push(res);
      }
    }
  });
  
  // B. 현재 및 미래 날짜 데이터는 신규 크롤링 데이터로 100% 교체/덮어쓰기
  newReservations.forEach(res => {
    if (res && res.date && res.date >= todayStr) {
      mergedReservations.push(res);
    }
  });
  
  fs.writeFileSync(dumpPath, JSON.stringify(mergedReservations, null, 2), 'utf8');
  
  console.log(`\n==================================================`);
  console.log(`[Crawler] 30-Min Pure Crawl Finished!`);
  console.log(`  - New Crawled (Current & Future): ${newReservations.length} reservations`);
  console.log(`  - Preserved History (Past): ${mergedReservations.length - newReservations.length} reservations`);
  console.log(`  - Total Saved Database: ${mergedReservations.length} reservations`);
}

run();
