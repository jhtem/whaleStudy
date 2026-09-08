"use client";

import React, { useState, useMemo, useEffect } from "react";
import styles from "./page.module.css";
import {
  mockRooms as initialRooms,
  mockReservations as initialReservations,
  mockRevenues as initialRevenues,
  Room,
  Reservation,
  Revenue,
  ReservationStatus
} from "./data/mockData";

export default function StudyRoomAdmin() {
  // --- States ---
  const [activeTab, setActiveTab] = useState<"dashboard" | "reservations" | "rooms">("dashboard");
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [reservations, setReservations] = useState<Reservation[]>(initialReservations);
  const [revenues, setRevenues] = useState<Revenue[]>(initialRevenues);
  
  // Current Active Branch (default: 정자점)
  const [currentBranch, setCurrentBranch] = useState<"정자점" | "수지구청점" | "위례점" | "알루">("정자점");
  
  // Naver Sync Status State
  const [syncStatus, setSyncStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [syncSource, setSyncSource] = useState<string>("");
  const [syncDailySales, setSyncDailySales] = useState<any[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // System Current Date & Time (2026-09-02 Wednesday)
  const getKstToday = () => {
    const d = new Date();
    const kst = new Date(d.getTime() + (9 * 60 * 60 * 1000));
    const iso = kst.toISOString().split('T')[0];
    return (iso && iso.startsWith('2026-')) ? iso : "2026-09-02";
  };

  const SYSTEM_TODAY = getKstToday();
  const SYSTEM_CURRENT_HOUR = 0.5; // 0시 30분
  
  const getYesterday = (todayStr: string) => {
    const d = new Date(`${todayStr}T00:00:00`);
    d.setDate(d.getDate() - 1);
    const yr = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${yr}-${m}-${day}`;
  };

  const getTomorrow = (todayStr: string) => {
    const d = new Date(`${todayStr}T00:00:00`);
    d.setDate(d.getDate() + 1);
    const yr = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${yr}-${m}-${day}`;
  };

  // Date Picker State for Timeline (Initial is today)
  const [selectedDate, setSelectedDate] = useState(SYSTEM_TODAY);
  
  // 일별 매출 조회를 위한 일자 쿼리 State (초기값: 오늘 날짜)
  const [pastDateQuery, setPastDateQuery] = useState(SYSTEM_TODAY);
  
  // Filter for Room Type in Timeline
  const [roomFilter, setRoomFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // Modal / Drawer States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedResId, setSelectedResId] = useState<string | null>(null);
  const [isEditRoomOpen, setIsEditRoomOpen] = useState<string | null>(null);

  // 지점 네이버 URL 설정 모달 State
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [branchUrlConfigs, setBranchUrlConfigs] = useState<Record<string, any>>({});
  const [editingUrlInput, setEditingUrlInput] = useState<Record<string, string>>({});

  // 지점별 룸 가격 안내 모달 State
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [selectedPriceBranch, setSelectedPriceBranch] = useState<"정자점" | "수지구청점" | "알루" | "위례점">("정자점");

  // 지점 URL 설정 목록 조회
  const fetchBranchConfigs = async () => {
    try {
      const res = await fetch('/api/branches');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.configs) {
          setBranchUrlConfigs(data.configs);
        }
      }
    } catch (e) {
      console.error("fetchBranchConfigs error:", e);
    }
  };

  useEffect(() => {
    fetchBranchConfigs();
  }, []);

  // 지점 URL 저장 핸들러
  const handleSaveBranchUrl = async (bName: string, bookingUrl: string) => {
    if (!bookingUrl) {
      alert("네이버 예약 URL을 입력해 주세요.");
      return;
    }
    try {
      const res = await fetch('/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchName: bName, bookingUrl })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchBranchConfigs();
        syncNaverReservations(currentBranch, selectedDate);
      } else {
        alert(data.message || "URL 저장에 실패했습니다.");
      }
    } catch (e: any) {
      alert("URL 저장 중 오류가 발생했습니다: " + e.message);
    }
  };

  // 과거 확정 매출 & 미래 예약 예측 매출 통합 연산식
  const pastDateSales = useMemo(() => {
    const getSalesData = (prefix: string) => {
      const branchRevs = revenues.filter(rev => {
        if (!rev || rev.status !== "paid" || !rev.roomId || !rev.roomId.startsWith(`room-${prefix}-`)) return false;
        const linkedRes = reservations.find(r => r && r.id === rev.reservationId);
        return linkedRes && linkedRes.date === pastDateQuery && linkedRes.status !== "canceled";
      });
      const amount = branchRevs.reduce((sum, rev) => sum + (rev.amount || 0), 0);
      
      const branchRes = reservations.filter(r => r && r.date === pastDateQuery && r.roomId.startsWith(`room-${prefix}-`) && r.status !== "canceled");
      const count = branchRes.length;
      const hours = branchRes.reduce((sum, r) => sum + (r.totalHours || (r.endTime - r.startTime)), 0);

      // 확정 결제 매출액이 0원이나 예약이 존재하는 경우(미래 예약 예측 등), 룸 시간당 요금 기반 예측 매출 자동 연산
      let effectiveAmount = amount;
      if (effectiveAmount === 0 && count > 0) {
        effectiveAmount = branchRes.reduce((sum, r) => {
          const roomObj = rooms.find(m => m.id === r.roomId);
          const price = roomObj ? roomObj.pricePerHour : 7000;
          return sum + (price * (r.totalHours || (r.endTime - r.startTime)));
        }, 0);
      }

      return { amount: effectiveAmount, count, hours };
    };

    const jj = getSalesData("jj");
    const sj = getSalesData("sj");
    const al = getSalesData("al");
    const wr = getSalesData("wr");

    const totalAmount = jj.amount + sj.amount + al.amount + wr.amount;
    const totalCount = jj.count + sj.count + al.count + wr.count;
    const totalHours = jj.hours + sj.hours + al.hours + wr.hours;

    return { 
      jjAmount: jj.amount, jjCount: jj.count, jjHours: jj.hours,
      sjAmount: sj.amount, sjCount: sj.count, sjHours: sj.hours,
      alAmount: al.amount, alCount: al.count, alHours: al.hours,
      wrAmount: wr.amount, wrCount: wr.count, wrHours: wr.hours,
      totalAmount, totalCount, totalHours
    };
  }, [reservations, revenues, pastDateQuery, rooms]);

  // 3일치 연속 지점별 매출 통합 연산식 (선택일 기준 어제-오늘-내일 또는 3일 연속 비교)
  const threeDaySalesData = useMemo(() => {
    const getSalesForDateAndBranch = (targetDate: string, prefix: string) => {
      const branchRevs = revenues.filter(rev => {
        if (!rev || rev.status !== "paid" || !rev.roomId || !rev.roomId.startsWith(`room-${prefix}-`)) return false;
        const linkedRes = reservations.find(r => r && r.id === rev.reservationId);
        return linkedRes && linkedRes.date === targetDate && linkedRes.status !== "canceled";
      });
      const amount = branchRevs.reduce((sum, rev) => sum + (rev.amount || 0), 0);
      
      const branchRes = reservations.filter(r => r && r.date === targetDate && r.roomId.startsWith(`room-${prefix}-`) && r.status !== "canceled");
      const count = branchRes.length;
      const hours = branchRes.reduce((sum, r) => sum + (r.totalHours || (r.endTime - r.startTime)), 0);

      let effectiveAmount = amount;
      if (effectiveAmount === 0 && count > 0) {
        effectiveAmount = branchRes.reduce((sum, r) => {
          const roomObj = rooms.find(m => m.id === r.roomId);
          const price = roomObj ? roomObj.pricePerHour : 7000;
          return sum + (price * (r.totalHours || (r.endTime - r.startTime)));
        }, 0);
      }

      return { amount: effectiveAmount, count, hours };
    };

    const calcForDate = (dateStr: string) => {
      const jj = getSalesForDateAndBranch(dateStr, "jj");
      const sj = getSalesForDateAndBranch(dateStr, "sj");
      const al = getSalesForDateAndBranch(dateStr, "al");
      const wr = getSalesForDateAndBranch(dateStr, "wr");
      const totalAmount = jj.amount + sj.amount + al.amount + wr.amount;
      const totalCount = jj.count + sj.count + al.count + wr.count;
      const totalHours = jj.hours + sj.hours + al.hours + wr.hours;

      return { date: dateStr, jj, sj, al, wr, totalAmount, totalCount, totalHours };
    };

    const day1 = getYesterday(pastDateQuery);
    const day2 = pastDateQuery;
    const day3 = getTomorrow(pastDateQuery);

    return {
      day1: calcForDate(day1),
      day2: calcForDate(day2),
      day3: calcForDate(day3)
    };
  }, [reservations, revenues, pastDateQuery, rooms]);

  // Form States for New Reservation
  const [newResForm, setNewResForm] = useState({
    userName: "",
    userPhone: "",
    roomId: "",
    startTime: 18.0, // Default to a future time
    endTime: 19.5,
    date: SYSTEM_TODAY,
    paymentMethod: "card" as "card" | "transfer" | "easy-pay"
  });

  // Form States for Room Edit
  const [editRoomForm, setEditRoomForm] = useState({
    name: "",
    pricePerHour: 0,
    capacity: 4,
    description: ""
  });

  // --- Filtering Rooms by Branch ---
  const activeRooms = useMemo(() => {
    return rooms.filter(r => r.branch === currentBranch);
  }, [rooms, currentBranch]);

  // 실시간 네이버 예약 현황 자동 동기화 Fetcher (마스터 572건 전체 데이터 보존)
  const syncNaverReservations = async (branchName?: string, targetDate?: string) => {
    setSyncStatus("loading");
    try {
      const response = await fetch(`/api/sync?all=true&_t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setReservations(data.reservations || []);
          setRevenues(data.revenues || []);
          if (data.dailyComparisonSales) {
            setSyncDailySales(data.dailyComparisonSales);
          }
          setSyncSource(data.source);
          setSyncStatus("success");
          return;
        }
      }
      setSyncStatus("error");
    } catch (err) {
      console.error("Naver sync failed:", err);
      setSyncStatus("error");
    }
  };

  // 전체 예약/매출 마스터 데이터 로드 헬퍼 함수
  const loadAllReservations = async () => {
    try {
      const response = await fetch(`/api/sync?all=true&_t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setReservations(data.reservations);
          setRevenues(data.revenues);
          if (data.dailyComparisonSales) {
            setSyncDailySales(data.dailyComparisonSales);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load master reservations:", err);
    }
  };

  // 네이버 실물 웹 스크래퍼 즉시 실행 핸들러 (비동기 백그라운드 기동 & 3초 주기 자동 폴링)
  const [isCrawlExecuting, setIsCrawlExecuting] = useState(false);

  const handleRunCrawlerNow = async () => {
    if (isCrawlExecuting) {
      alert("현재 네이버 스크래퍼가 백그라운드에서 실행 중입니다. 잠시만 기다려 주세요.");
      return;
    }
    
    if (!confirm("네이버 4개 지점(총 39개 룸) 전체의 실시간 예약 현황을 스크래핑해 오시겠습니까?\n(약 40초~1분 소요)")) {
      return;
    }

    setIsCrawlExecuting(true);
    try {
      const res = await fetch('/api/crawl', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        // 즉시 기동 성공! 백그라운드 완료 시까지 3초 주기 폴링 대기
        const checkInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/crawl?_t=${Date.now()}`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (!statusData.isRunning) {
                clearInterval(checkInterval);
                setIsCrawlExecuting(false);
                await loadAllReservations();
                alert("🚀 네이버 4개 지점 전체 스크래핑 수집 및 화면 갱신이 완료되었습니다!");
              }
            }
          } catch (err) {
            console.error("Crawler status polling error:", err);
          }
        }, 3000);
      } else {
        alert(data.message || "스크래퍼 실행 실패");
        setIsCrawlExecuting(false);
      }
    } catch (e: any) {
      alert("스크래퍼 실행 중 오류가 발생했습니다: " + e.message);
      setIsCrawlExecuting(false);
    }
  };

  // 컴포넌트 최초 마운트 세팅 및 전체 예약/매출 데이터 최초 1회 마스터 로드
  useEffect(() => {
    setIsMounted(true);
    loadAllReservations();
  }, []);

  // 지점 및 일자 변경 시 자동으로 네이버 실시간 예약 동기화 트리거
  useEffect(() => {
    syncNaverReservations(currentBranch, selectedDate);
  }, [currentBranch, selectedDate]);

  // Set default room in form when activeRooms or Branch changes
  useEffect(() => {
    if (activeRooms.length > 0) {
      setNewResForm(prev => ({ ...prev, roomId: activeRooms[0].id }));
    }
  }, [activeRooms]);

  // --- Time Format Helper ---
  const formatTime = (time: number) => {
    const hours = Math.floor(time);
    const minutes = time % 1 === 0 ? "00" : "30";
    return `${String(hours).padStart(2, "0")}:${minutes}`;
  };

  // 요일 추출 헬퍼 함수
  const getDayOfWeek = (dateStr: string) => {
    const week = ["일", "월", "화", "수", "목", "금", "토"];
    const day = new Date(dateStr.replace(/-/g, "/")).getDay();
    return week[day] ? `(${week[day]})` : "";
  };

  // Generate 30-min time options (07:00 ~ 24:00)
  const timeOptions = useMemo(() => {
    const options = [];
    for (let t = 7.0; t <= 24.0; t += 0.5) {
      options.push({ value: t, label: formatTime(t) });
    }
    return options;
  }, []);

  // 로컬 타임존의 년-월-일을 유지하며 포맷팅하는 헬퍼 함수
  const formatDateString = (dateObj: Date) => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // --- Date Navigation Helpers ---
  const handlePrevDay = () => {
    const d = new Date(selectedDate.replace(/-/g, "/"));
    d.setDate(d.getDate() - 1);
    setSelectedDate(formatDateString(d));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate.replace(/-/g, "/"));
    d.setDate(d.getDate() + 1);
    setSelectedDate(formatDateString(d));
  };

  const handleSetToday = () => {
    setSelectedDate(SYSTEM_TODAY);
  };

  // --- Statistics Computations (Filtered by Branch) ---
  const stats = useMemo(() => {
    const activeRoomIds = activeRooms.map(r => r ? r.id : "").filter(Boolean);
    
    // 1. 해당 지점의 오늘 총 예약 시간 (취소건 제외)
    const todayRes = reservations.filter(
      res => res && res.date === selectedDate && activeRoomIds.includes(res.roomId) && res.status !== "canceled"
    );
    const todayResHours = todayRes.reduce((sum, res) => sum + (res.totalHours || 0), 0);
    
    // 2. 현재 시뮬레이션 시각 기준 실제 가동중인 방 아이디 목록
    const occupiedRoomIds = Array.from(new Set(
      todayRes
        .filter(res => res && (res.status === "completed" || res.status === "reserved"))
        .filter(res => res && res.startTime <= SYSTEM_CURRENT_HOUR && res.endTime > SYSTEM_CURRENT_HOUR)
        .map(res => res.roomId)
        .filter(Boolean)
    ));
    
    // 당일 지점 전체 룸 평균 가동률 연산 (하루 7시~24시 = 17시간 총용량 대비 이용 시간 비율)
    const totalCapacityHours = activeRooms.length * 17;
    const occupancyRate = totalCapacityHours > 0 
      ? Math.round((todayResHours / totalCapacityHours) * 100) 
      : 0;

    // 3. 오늘 실시간 매출액 (이용일자 selectedDate 기준, 취소건 제외)
    const todayRevenue = revenues
      .filter(rev => {
        if (!rev || rev.status !== "paid" || !activeRoomIds.includes(rev.roomId)) return false;
        const linkedRes = reservations.find(r => r && r.id === rev.reservationId);
        return linkedRes && linkedRes.date === selectedDate && linkedRes.status !== "canceled";
      })
      .reduce((sum, rev) => sum + (rev.amount || 0), 0);

    // 4. 최근 3개월 매출 추이 (정자본점 / 수지구청점 개별 정밀 집계)
    const monthlySalesJj = {
      "6월": revenues
        .filter(r => r && r.status === "paid" && r.paymentDate && String(r.paymentDate).includes("-06-") && r.roomId && r.roomId.startsWith("room-jj-"))
        .reduce((s, r) => s + (r.amount || 0), 0),
      "7월": revenues
        .filter(r => r && r.status === "paid" && r.paymentDate && String(r.paymentDate).includes("-07-") && r.roomId && r.roomId.startsWith("room-jj-"))
        .reduce((s, r) => s + (r.amount || 0), 0),
      "8월": revenues
        .filter(r => r && r.status === "paid" && r.paymentDate && String(r.paymentDate).includes("-08-") && r.roomId && r.roomId.startsWith("room-jj-"))
        .reduce((s, r) => s + (r.amount || 0), 0)
    };

    const monthlySalesSj = {
      "6월": revenues
        .filter(r => r && r.status === "paid" && r.paymentDate && String(r.paymentDate).includes("-06-") && r.roomId && r.roomId.startsWith("room-sj-"))
        .reduce((s, r) => s + (r.amount || 0), 0),
      "7월": revenues
        .filter(r => r && r.status === "paid" && r.paymentDate && String(r.paymentDate).includes("-07-") && r.roomId && r.roomId.startsWith("room-sj-"))
        .reduce((s, r) => s + (r.amount || 0), 0),
      "8월": revenues
        .filter(r => r && r.status === "paid" && r.paymentDate && String(r.paymentDate).includes("-08-") && r.roomId && r.roomId.startsWith("room-sj-"))
        .reduce((s, r) => s + (r.amount || 0), 0)
    };

    const monthlySalesAl = {
      "6월": revenues
        .filter(r => r && r.status === "paid" && r.paymentDate && String(r.paymentDate).includes("-06-") && r.roomId && r.roomId.startsWith("room-al-"))
        .reduce((s, r) => s + (r.amount || 0), 0),
      "7월": revenues
        .filter(r => r && r.status === "paid" && r.paymentDate && String(r.paymentDate).includes("-07-") && r.roomId && r.roomId.startsWith("room-al-"))
        .reduce((s, r) => s + (r.amount || 0), 0),
      "8월": revenues
        .filter(r => r && r.status === "paid" && r.paymentDate && String(r.paymentDate).includes("-08-") && r.roomId && r.roomId.startsWith("room-al-"))
        .reduce((s, r) => s + (r.amount || 0), 0)
    };

    const monthlySalesWr = {
      "6월": revenues
        .filter(r => r && r.status === "paid" && r.paymentDate && String(r.paymentDate).includes("-06-") && r.roomId && r.roomId.startsWith("room-wr-"))
        .reduce((s, r) => s + (r.amount || 0), 0),
      "7월": revenues
        .filter(r => r && r.status === "paid" && r.paymentDate && String(r.paymentDate).includes("-07-") && r.roomId && r.roomId.startsWith("room-wr-"))
        .reduce((s, r) => s + (r.amount || 0), 0),
      "8월": revenues
        .filter(r => r && r.status === "paid" && r.paymentDate && String(r.paymentDate).includes("-08-") && r.roomId && r.roomId.startsWith("room-wr-"))
        .reduce((s, r) => s + (r.amount || 0), 0)
    };

    // 오늘 기준 최근 7일간(D-6 ~ Today) 지점별 매출 비교 데이터 동적 계산
    const getLast7Days = (todayStr: string) => {
      const dates = [];
      const base = new Date(`${todayStr}T00:00:00`);
      for (let i = 6; i >= 0; i--) {
        const d = new Date(base);
        d.setDate(base.getDate() - i);
        const yr = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dates.push(`${yr}-${m}-${day}`);
      }
      return dates;
    };
    
    const dateList = getLast7Days(SYSTEM_TODAY);
    const dailyComparisonSales = dateList.map(fullDate => {
      const label = fullDate.substring(5); // "08-29"
      
      const getBranchSales = (branchPrefix: string) => {
        const isFuture = fullDate > SYSTEM_TODAY;
        if (isFuture) {
          return reservations
            .filter(res => {
              if (!res || res.status === "canceled" || !res.roomId || !res.roomId.startsWith(`room-${branchPrefix}-`)) return false;
              return res.date === fullDate;
            })
            .reduce((sum, res) => {
              const room = rooms.find(rm => rm.id === res.roomId);
              const price = room ? room.pricePerHour : 10000;
              return sum + (price * (res.totalHours || 0));
            }, 0);
        } else {
          return revenues
            .filter(rev => {
              if (!rev || rev.status !== "paid" || !rev.roomId || !rev.roomId.startsWith(`room-${branchPrefix}-`)) return false;
              const linkedRes = reservations.find(r => r && r.id === rev.reservationId);
              return linkedRes && linkedRes.date === fullDate && linkedRes.status !== "canceled";
            })
            .reduce((sum, rev) => sum + (rev.amount || 0), 0);
        }
      };

      const jjAmount = getBranchSales("jj");
      const sjAmount = getBranchSales("sj");
      const alAmount = getBranchSales("al");
      const wrAmount = getBranchSales("wr");
        
      return { date: label, jeongja: jjAmount, suji: sjAmount, alu: alAmount, wirye: wrAmount };
    });

    return {
      todayResHours,
      occupancyRate,
      todayRevenue,
      monthlySalesJj,
      monthlySalesSj,
      monthlySalesAl,
      monthlySalesWr,
      occupiedRoomIds,
      dailyComparisonSales
    };
  }, [reservations, revenues, activeRooms, selectedDate]);

  // 꺾은선그래프 동적 스케일링 활성 데이터 추출
  const activeDailySales = useMemo(() => {
    return syncDailySales.length > 0 ? syncDailySales : stats.dailyComparisonSales;
  }, [syncDailySales, stats.dailyComparisonSales]);

  // 꺾은선그래프 SVG Path 좌표 연산 (500x200 viewBox 기준, 동적 Y축 10만원 단위 스케일)
  const lineChartPaths = useMemo(() => {
    if (!isMounted) {
      return { jjLine: "", jjArea: "", sjLine: "", sjArea: "", alLine: "", alArea: "", wrLine: "", wrArea: "", pointsJj: [], pointsSj: [], pointsAl: [], pointsWr: [], activeDailySales: [], ticks: [] };
    }

    // NaN 방지: d.jeongja, d.suji, d.alu, d.wirye 속성을 안전하게 숫자로 변환
    const safeSales = activeDailySales.map(d => ({
      ...d,
      jeongja: typeof d.jeongja === 'number' && !isNaN(d.jeongja) ? d.jeongja : 0,
      suji: typeof d.suji === 'number' && !isNaN(d.suji) ? d.suji : 0,
      alu: typeof d.alu === 'number' && !isNaN(d.alu) ? d.alu : 0,
      wirye: typeof d.wirye === 'number' && !isNaN(d.wirye) ? d.wirye : 0
    }));

    const maxDailyRevenue = safeSales.length > 0 
      ? Math.max(...safeSales.map(d => Math.max(d.jeongja, d.suji, d.alu, d.wirye)))
      : 0;
    
    // 최대 매출액을 10만원 단위 올림하여 maxVal 설정 (최소 10만원 시작)
    const step = 100000;
    const maxVal = (typeof maxDailyRevenue === 'number' && !isNaN(maxDailyRevenue) && maxDailyRevenue > 0)
      ? Math.max(Math.ceil(maxDailyRevenue / step) * step, 100000) 
      : 100000;

    // Y축 눈금선 및 보조 라벨 생성 (0원부터 maxVal까지 10만원 간격)
    const ticks = [];
    for (let val = 0; val <= maxVal; val += step) {
      const y = 170 - (val / maxVal) * 140;
      const label = val === 0 ? "0" : `${val / 10000}만`;
      ticks.push({ val, y, label });
    }

    const pointsJj = safeSales.map((item, i) => ({
      x: 70 + i * 62, // 왼쪽 라벨 영역(70px) 패딩 확보를 위해 x좌표 조정 (70, 132, 194, 256, 318, 380, 442)
      y: 170 - (item.jeongja / maxVal) * 140
    }));
    const pointsSj = safeSales.map((item, i) => ({
      x: 70 + i * 62,
      y: 170 - (item.suji / maxVal) * 140
    }));
    const pointsAl = safeSales.map((item, i) => ({
      x: 70 + i * 62,
      y: 170 - (item.alu / maxVal) * 140
    }));
    const pointsWr = safeSales.map((item, i) => ({
      x: 70 + i * 62,
      y: 170 - (item.wirye / maxVal) * 140
    }));

    const jjLine = pointsJj.length > 0 ? "M " + pointsJj.map(p => `${p.x} ${p.y}`).join(" L ") : "";
    const jjArea = jjLine ? jjLine + ` L ${pointsJj[pointsJj.length - 1].x} 170 L ${pointsJj[0].x} 170 Z` : "";

    const sjLine = pointsSj.length > 0 ? "M " + pointsSj.map(p => `${p.x} ${p.y}`).join(" L ") : "";
    const sjArea = sjLine ? sjLine + ` L ${pointsSj[pointsSj.length - 1].x} 170 L ${pointsSj[0].x} 170 Z` : "";

    const alLine = pointsAl.length > 0 ? "M " + pointsAl.map(p => `${p.x} ${p.y}`).join(" L ") : "";
    const alArea = alLine ? alLine + ` L ${pointsAl[pointsAl.length - 1].x} 170 L ${pointsAl[0].x} 170 Z` : "";

    const wrLine = pointsWr.length > 0 ? "M " + pointsWr.map(p => `${p.x} ${p.y}`).join(" L ") : "";
    const wrArea = wrLine ? wrLine + ` L ${pointsWr[pointsWr.length - 1].x} 170 L ${pointsWr[0].x} 170 Z` : "";

    return { jjLine, jjArea, sjLine, sjArea, alLine, alArea, wrLine, wrArea, pointsJj, pointsSj, pointsAl, pointsWr, activeDailySales: safeSales, ticks };
  }, [activeDailySales]);

  // --- Handlers ---
  
  // 1. 예약 등록 (30분 단위 및 과거 시간대 차단 적용)
  const handleAddReservation = (e: React.FormEvent) => {
    e.preventDefault();

    // 1) 과거 날짜 및 과거 시간 유효성 검사
    if (newResForm.date < SYSTEM_TODAY) {
      alert("과거 날짜로는 예약을 신규 등록할 수 없습니다.");
      return;
    }
    
    if (newResForm.date === SYSTEM_TODAY && newResForm.startTime < SYSTEM_CURRENT_HOUR) {
      alert(`지난 시간으로는 예약할 수 없습니다. (현재 시스템 시간: ${formatTime(SYSTEM_CURRENT_HOUR)})`);
      return;
    }

    if (!newResForm.userName || !newResForm.userPhone) {
      alert("예약자 이름과 연락처를 입력해 주세요.");
      return;
    }

    const selectedRoom = activeRooms.find(r => r.id === newResForm.roomId);
    if (!selectedRoom) return;

    const totalHours = newResForm.endTime - newResForm.startTime;
    if (totalHours <= 0) {
      alert("종료 시간은 시작 시간보다 늦어야 합니다.");
      return;
    }

    // 중복 예약 검증
    const hasOverlap = reservations.some(res => 
      res.roomId === newResForm.roomId &&
      res.date === newResForm.date &&
      res.status !== "canceled" &&
      !(newResForm.endTime <= res.startTime || newResForm.startTime >= res.endTime)
    );

    if (hasOverlap) {
      alert("해당 시간에 이미 예약이 존재합니다. 다른 시간이나 룸을 선택해 주세요.");
      return;
    }

    const resPrefix = currentBranch === "정자점" ? "jj" : currentBranch === "수지구청점" ? "sj" : currentBranch === "알루" ? "al" : "wr";
    const resId = `res-${resPrefix}-${String(reservations.length + 1).padStart(5, "0")}`;
    const revId = `rev-${resPrefix}-${String(revenues.length + 1).padStart(5, "0")}`;
    const amount = selectedRoom.pricePerHour * totalHours;

    // 예약 객체 생성
    const newReservation: Reservation = {
      id: resId,
      roomId: newResForm.roomId,
      userId: `user-${Math.floor(Math.random() * 100) + 10}`,
      userName: newResForm.userName,
      userPhone: newResForm.userPhone,
      date: newResForm.date,
      startTime: newResForm.startTime,
      endTime: newResForm.endTime,
      totalHours: totalHours,
      status: "reserved",
      createdAt: new Date().toISOString()
    };

    // 결제 내역 생성
    const newRevenue: Revenue = {
      id: revId,
      reservationId: resId,
      roomId: newResForm.roomId,
      amount: amount,
      paymentMethod: newResForm.paymentMethod,
      paymentDate: new Date().toISOString(),
      status: "paid"
    };

    setReservations(prev => [...prev, newReservation]);
    setRevenues(prev => [...prev, newRevenue]);
    setIsAddModalOpen(false);

    // 폼 초기화
    setNewResForm(prev => ({
      ...prev,
      userName: "",
      userPhone: "",
      startTime: 18.0,
      endTime: 19.5,
      date: selectedDate,
      paymentMethod: "card"
    }));

    alert("예약이 정상적으로 등록되었습니다!");
  };

  // 2. 예약 취소 (환불 연동)
  const handleCancelReservation = (id: string) => {
    if (!confirm("정말로 이 예약을 취소하시겠습니까?")) return;

    setReservations(prev =>
      prev.map(res => (res.id === id ? { ...res, status: "canceled" } : res))
    );

    setRevenues(prev =>
      prev.map(rev =>
        rev.reservationId === id ? { ...rev, status: "refunded" } : rev
      )
    );

    setSelectedResId(null);
    alert("예약 취소 및 환불 처리가 완료되었습니다.");
  };

  // 3. 룸 정보 편집
  const handleOpenEditRoom = (room: Room) => {
    setEditRoomForm({
      name: room.name,
      pricePerHour: room.pricePerHour,
      capacity: room.capacity,
      description: room.description
    });
    setIsEditRoomOpen(room.id);
  };

  const handleSaveRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditRoomOpen) return;

    setRooms(prev =>
      prev.map(r =>
        r.id === isEditRoomOpen
          ? {
              ...r,
              name: editRoomForm.name,
              pricePerHour: Number(editRoomForm.pricePerHour),
              capacity: Number(editRoomForm.capacity),
              description: editRoomForm.description
            }
          : r
      )
    );

    setIsEditRoomOpen(null);
    alert("스터디룸 정보가 성공적으로 업데이트되었습니다.");
  };

  // Filtered reservations for selected date and branch
  const filteredReservations = useMemo(() => {
    const activeRoomIds = activeRooms.map(r => r.id);
    return reservations.filter(res => {
      const matchDate = res.date === selectedDate;
      const matchBranch = activeRoomIds.includes(res.roomId);
      const matchRoom = roomFilter === "all" || res.roomId === roomFilter;
      const matchStatus = statusFilter === "all" || res.status === statusFilter;
      return matchDate && matchBranch && matchRoom && matchStatus;
    });
  }, [reservations, selectedDate, activeRooms, roomFilter, statusFilter]);

  // Selected reservation details for Slide Drawer
  const selectedResDetail = useMemo(() => {
    if (!selectedResId) return null;
    const res = reservations.find(r => r.id === selectedResId);
    if (!res) return null;
    const room = rooms.find(rm => rm.id === res.roomId);
    const rev = revenues.find(rv => rv.reservationId === res.id);
    return { res, room, rev };
  }, [selectedResId, reservations, rooms, revenues]);

  // 가로 = 룸 번호, 세로 = 시간 (30분 단위) 축 반전 타임라인 렌더링 함수
  const renderTransposedScheduler = () => {
    const times: number[] = [];
    for (let t = 7.0; t < 24.0; t += 0.5) {
      times.push(t);
    }

    return times.map(t => {
      const isHourHeader = t % 1 === 0;
      const timeLabel = formatTime(t);
      const isPastTime = selectedDate === SYSTEM_TODAY && t < SYSTEM_CURRENT_HOUR;

      return (
        <tr key={`time-row-${t}`} style={{ height: "36px" }}>
          {/* 세로 1열: 시간 라벨 (Sticky 고정) */}
          <td 
            style={{ 
              width: "65px", 
              minWidth: "65px", 
              maxWidth: "65px",
              textAlign: "center", 
              fontWeight: isHourHeader ? "800" : "500", 
              fontSize: "0.75rem",
              backgroundColor: "var(--background)",
              borderRight: "2px solid var(--border)",
              borderBottom: "1px solid var(--border)",
              color: isHourHeader ? "var(--text-primary)" : "var(--text-muted)",
              padding: 0,
              position: "sticky",
              left: 0,
              zIndex: 10,
              boxShadow: "2px 0 5px rgba(0, 0, 0, 0.08)"
            }}
          >
            {timeLabel}
          </td>

          {/* 각 룸별 30분 셀 / 예약 블럭 */}
          {activeRooms.map(room => {
            const roomRes = filteredReservations
              .filter(res => res.roomId === room.id && res.status !== "canceled")
              .sort((a, b) => a.startTime - b.startTime);

            // 시작점 슬롯인가?
            const startRes = roomRes.find(r => Math.abs(r.startTime - t) < 0.01);

            if (startRes) {
              const rowSpan = Math.round(startRes.totalHours * 2);
              return (
                <td
                  key={`res-${startRes.id}`}
                  rowSpan={rowSpan}
                  className={styles.timelineCell}
                  onClick={() => setSelectedResId(startRes.id)}
                  style={{
                    padding: 0,
                    verticalAlign: "middle",
                    height: `${rowSpan * 36}px`,
                    width: "75px",
                    minWidth: "75px",
                    maxWidth: "75px",
                    borderRight: "1px solid var(--border)",
                    borderBottom: "1px solid var(--border)"
                  }}
                >
                  <div
                    className={`${styles.reservationBlockInside} ${
                      startRes.status === "completed" 
                        ? styles.resStatusCompleted 
                        : styles.resStatusReserved
                    }`}
                    style={{
                      height: "calc(100% - 4px)",
                      width: "calc(100% - 4px)",
                      margin: "2px",
                      borderRadius: "4px",
                      cursor: "pointer"
                    }}
                    title={`${room.name}: ${formatTime(startRes.startTime)} ~ ${formatTime(startRes.endTime)} (${startRes.totalHours}시간)`}
                  >
                    {/* 지혜님 지침: 블럭 내 시작시간~종료시간 (소요시간h) 텍스트 표시 안 함 (순수 블럭으로만 표출) */}
                  </div>
                </td>
              );
            }

            // 중간 연장 슬롯인가?
            const inMiddleRes = roomRes.some(r => r.startTime < t && t < r.endTime);
            if (inMiddleRes) {
              return null;
            }

            // 빈 30분 슬롯
            return (
              <td
                key={`empty-${room.id}-${t}`}
                className={`${styles.timelineCell} ${isPastTime ? styles.pastCell : ""}`}
                style={{ 
                  height: "36px", 
                  width: "75px",
                  minWidth: "75px",
                  maxWidth: "75px",
                  borderRight: "1px solid var(--border)",
                  borderBottom: "1px solid var(--border)"
                }}
              />
            );
          })}
        </tr>
      );
    });
  };



  return (
    <div className={styles.container}>
      {/* ==========================================
         Sidebar LNB
         ========================================== */}
      <aside className={styles.sidebar}>
        <div className={styles.logoArea} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/images/whalestudy_brand_whale.png" style={{ width: "36px", height: "36px", borderRadius: "6px", backgroundColor: "#ffffff", padding: "3px" }} alt="whaleStudy logo" />
          <h1 className={styles.logoText} style={{ margin: 0, fontSize: "1.25rem" }}>
            whaleStudy
          </h1>
        </div>
        <nav className={styles.navMenu}>
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`${styles.navItem} ${activeTab === "dashboard" ? styles.navItemActive : ""}`}
            id="tab-dashboard"
          >
            📊 대시보드
          </button>
          <button
            onClick={() => setActiveTab("reservations")}
            className={`${styles.navItem} ${activeTab === "reservations" ? styles.navItemActive : ""}`}
            id="tab-reservations"
          >
            📅 예약 관리
          </button>
          <button
            onClick={() => setActiveTab("rooms")}
            className={`${styles.navItem} ${activeTab === "rooms" ? styles.navItemActive : ""}`}
            id="tab-rooms"
          >
            🚪 스터디룸 관리
          </button>
        </nav>
        <div className={styles.sidebarFooter}>
          <p>© 2026 whaleStudy</p>
          <p>Ver 1.2.0 (다지점/30분)</p>
        </div>
      </aside>

      {/* ==========================================
         Main Wrapper & Shell Header
         ========================================== */}
      <div className={styles.mainWrapper}>
        <header className={styles.header}>
          <div className={styles.headerLeft} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <select
              value={currentBranch}
              onChange={(e) => setCurrentBranch(e.target.value as any)}
              className={styles.branchSelector}
              id="branch-selector"
            >
              <option value="정자점">정자본점</option>
              <option value="수지구청점">수지구청점</option>
              <option value="위례점">위례점</option>
              <option value="알루">알루점</option>
            </select>
            <button
              onClick={() => setIsUrlModalOpen(true)}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
                fontSize: "0.85rem",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}
              id="btn-open-url-setting"
            >
              ⚙️ 지점 URL 설정
            </button>
            <button
              onClick={() => {
                setSelectedPriceBranch(currentBranch);
                setIsPriceModalOpen(true);
              }}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
                fontSize: "0.85rem",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}
              id="btn-open-price-modal"
            >
              🏷️ 지점별 룸 가격 안내
            </button>
            <button
              onClick={handleRunCrawlerNow}
              disabled={isCrawlExecuting}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: isCrawlExecuting ? "#6b7280" : "#2563eb",
                color: "#ffffff",
                fontSize: "0.85rem",
                fontWeight: "700",
                cursor: isCrawlExecuting ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 4px rgba(37, 99, 235, 0.2)"
              }}
              id="btn-run-crawler-header"
            >
              {isCrawlExecuting ? "🔄 네이버 스크래퍼 실행 중..." : "🚀 네이버 스크래퍼 즉시 실행"}
            </button>
          </div>
          <div className={styles.headerRight}>
            <button className={styles.iconBtn} aria-label="알림" id="notif-btn">
              🔔
              <span className={styles.badge} />
            </button>
            <div className={styles.userInfo}>
              <div className={styles.avatar}>🐋</div>
              <div>
                <p className={styles.userName}>지혜 매니저</p>
                <p className={styles.userRole}>최고관리자 ({currentBranch})</p>
              </div>
            </div>
          </div>
        </header>
        
        {/* 모바일 전용 LNB 가로 대체 탭 바 */}
        <div className={styles.mobileTabBar}>
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`${styles.mobileTabItem} ${activeTab === "dashboard" ? styles.mobileTabActive : ""}`}
          >
            📊 대시보드
          </button>
          <button
            onClick={() => setActiveTab("reservations")}
            className={`${styles.mobileTabItem} ${activeTab === "reservations" ? styles.mobileTabActive : ""}`}
          >
            📅 예약 관리
          </button>
          <button
            onClick={() => setActiveTab("rooms")}
            className={`${styles.mobileTabItem} ${activeTab === "rooms" ? styles.mobileTabActive : ""}`}
          >
            🚪 룸 관리
          </button>
        </div>

        {/* ==========================================
           Content Router
           ========================================== */}
        <main className={styles.content}>
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === "dashboard" && (
            <div>
              <div className={styles.pageHeader}>
                <h2 className={styles.pageTitle}>{currentBranch} 운영 현황</h2>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  조회 기준일: <strong>{selectedDate} {getDayOfWeek(selectedDate)} (오늘)</strong>
                </div>
              </div>

              {/* KPI Cards */}
              <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                  <p className={styles.kpiTitle}>오늘 총 예약 시간</p>
                  <p className={styles.kpiValue}>{stats.todayResHours.toFixed(1)} 시간</p>
                  <p className={styles.kpiSub}>
                    현재 지점의 당일 이용 시간 합계
                  </p>
                </div>
                <div className={styles.kpiCard}>
                  <p className={styles.kpiTitle}>오늘 평균 룸 가동률</p>
                  <p className={styles.kpiValue}>{stats.occupancyRate}%</p>
                  <p className={styles.kpiSub}>
                    하루 가용시간 대비 사용율 (현재 {stats.occupiedRoomIds.length}개 이용중)
                  </p>
                </div>
                <div className={styles.kpiCard}>
                  <p className={styles.kpiTitle}>오늘 당일 매출액</p>
                  <p className={styles.kpiValue}>
                    {stats.todayRevenue.toLocaleString()} 원
                  </p>
                  <p className={styles.kpiSub}>
                    결제 완료(확정) 매출 기준
                  </p>
                </div>
              </div>

              {/* Main Analytics Layout */}
              <div className={styles.dashboardLayout}>
                {/* Left: Branch Comparison Chart */}
                <div className={styles.dashboardSection}>
                  <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>지점별 일별 매출 비교 (최근 7일)</h3>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>단위: 원</span>
                  </div>
                  <div className={styles.comparisonChartContainer}>
                    <div className={styles.lineChartWrapper}>
                      <svg className={styles.lineChartSvg} viewBox="0 0 500 200" width="100%" height="100%">
                        <defs>
                          <linearGradient id="jj-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0D9488" stopOpacity="0.25"/>
                            <stop offset="100%" stopColor="#0D9488" stopOpacity="0"/>
                          </linearGradient>
                          <linearGradient id="sj-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.25"/>
                            <stop offset="100%" stopColor="#4F46E5" stopOpacity="0"/>
                          </linearGradient>
                          <linearGradient id="al-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#F97316" stopOpacity="0.25"/>
                            <stop offset="100%" stopColor="#F97316" stopOpacity="0"/>
                          </linearGradient>
                          <linearGradient id="wr-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#A855F7" stopOpacity="0.25"/>
                            <stop offset="100%" stopColor="#A855F7" stopOpacity="0"/>
                          </linearGradient>
                        </defs>
                        
                        {/* 동적 5만원 단위 Y축 격자선 및 라벨 렌더링 */}
                        {lineChartPaths.ticks.map(tick => (
                          <g key={`tick-${tick.val}`}>
                            {/* 격자선 */}
                            <line 
                              x1="60" 
                              y1={tick.y} 
                              x2="460" 
                              y2={tick.y} 
                              stroke="var(--border)" 
                              strokeDasharray={tick.val === 0 ? "none" : "3 3"} 
                            />
                            {/* Y축 5만원 단위 라벨 */}
                            <text 
                              x="50" 
                              y={tick.y + 4} 
                              textAnchor="end" 
                              fill="var(--text-secondary)" 
                              fontSize="9" 
                              fontWeight="600"
                            >
                              {tick.label}
                            </text>
                          </g>
                        ))}
                        
                        {/* Area 면적 채우기 */}
                        {lineChartPaths.wrArea && <path d={lineChartPaths.wrArea} fill="url(#wr-grad)" />}
                        {lineChartPaths.alArea && <path d={lineChartPaths.alArea} fill="url(#al-grad)" />}
                        {lineChartPaths.sjArea && <path d={lineChartPaths.sjArea} fill="url(#sj-grad)" />}
                        {lineChartPaths.jjArea && <path d={lineChartPaths.jjArea} fill="url(#jj-grad)" />}
                        
                        {/* Lines 꺾은선 */}
                        {lineChartPaths.wrLine && <path d={lineChartPaths.wrLine} fill="none" stroke="#A855F7" strokeWidth="3" strokeLinecap="round" />}
                        {lineChartPaths.alLine && <path d={lineChartPaths.alLine} fill="none" stroke="#F97316" strokeWidth="3" strokeLinecap="round" />}
                        {lineChartPaths.sjLine && <path d={lineChartPaths.sjLine} fill="none" stroke="#4F46E5" strokeWidth="3" strokeLinecap="round" />}
                        {lineChartPaths.jjLine && <path d={lineChartPaths.jjLine} fill="none" stroke="#0D9488" strokeWidth="3" strokeLinecap="round" />}

                        {/* 날짜 텍스트 축 */}
                        {lineChartPaths.activeDailySales.map((item, idx) => {
                          const x = 70 + idx * 62;
                          return (
                            <text key={item.date} x={x} y="192" textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontWeight="600">
                              {item.date}
                            </text>
                          );
                        })}
                        
                        {/* 호버 서클 */}
                        {lineChartPaths.activeDailySales.map((item, idx) => {
                          const x = 70 + idx * 62;
                          const jjP = lineChartPaths.pointsJj[idx];
                          const sjP = lineChartPaths.pointsSj[idx];
                          const alP = lineChartPaths.pointsAl[idx];
                          const wrP = lineChartPaths.pointsWr ? lineChartPaths.pointsWr[idx] : null;
                          return (
                            <g key={`dots-${idx}`} className={styles.svgDotGroup}>
                              {jjP && (
                                <g>
                                  <circle cx={x} cy={jjP.y} r="5" fill="#0D9488" stroke="#ffffff" strokeWidth="2" style={{ cursor: "pointer" }} />
                                  <title>정자본점: {item.jeongja.toLocaleString()}원</title>
                                </g>
                              )}
                              {sjP && (
                                <g>
                                  <circle cx={x} cy={sjP.y} r="5" fill="#4F46E5" stroke="#ffffff" strokeWidth="2" style={{ cursor: "pointer" }} />
                                  <title>수지구청점: {item.suji.toLocaleString()}원</title>
                                </g>
                              )}
                              {alP && (
                                <g>
                                  <circle cx={x} cy={alP.y} r="5" fill="#F97316" stroke="#ffffff" strokeWidth="2" style={{ cursor: "pointer" }} />
                                  <title>알루점: {item.alu.toLocaleString()}원</title>
                                </g>
                              )}
                              {wrP && (
                                <g>
                                  <circle cx={x} cy={wrP.y} r="5" fill="#A855F7" stroke="#ffffff" strokeWidth="2" style={{ cursor: "pointer" }} />
                                  <title>위례점: {item.wirye.toLocaleString()}원</title>
                                </g>
                              )}
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                    <div className={styles.chartLegends} style={{ marginTop: "12px" }}>
                      <div className={styles.legendItem}>
                        <span className={styles.legendColor} style={{ backgroundColor: "#0D9488" }} />
                        <span>정자본점</span>
                      </div>
                      <div className={styles.legendItem}>
                        <span className={styles.legendColor} style={{ backgroundColor: "#4F46E5" }} />
                        <span>수지구청점</span>
                      </div>
                      <div className={styles.legendItem}>
                        <span className={styles.legendColor} style={{ backgroundColor: "#F97316" }} />
                        <span>알루점</span>
                      </div>
                      <div className={styles.legendItem}>
                        <span className={styles.legendColor} style={{ backgroundColor: "#A855F7" }} />
                        <span>위례점</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Today Room Status */}
                <div className={styles.dashboardSection}>
                  <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>실시간 룸 가동 상태 (현재 {formatTime(SYSTEM_CURRENT_HOUR)})</h3>
                    <button 
                      onClick={() => setActiveTab("reservations")} 
                      className={styles.secondaryBtn} 
                      style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                    >
                      타임라인 ➔
                    </button>
                  </div>
                  <div className={styles.roomStatusList}>
                    {activeRooms.length === 0 ? (
                      <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
                        등록된 룸 정보가 없습니다.
                      </div>
                    ) : (
                      activeRooms.map(room => {
                        const isOccupied = stats.occupiedRoomIds.includes(room.id);
                        
                        // Check for future reservations today
                        const nextRes = reservations.find(
                          r => r.roomId === room.id && 
                          r.date === selectedDate && 
                          r.status === "reserved" && 
                          r.startTime > SYSTEM_CURRENT_HOUR
                        );

                        return (
                          <div key={room.id} className={styles.roomStatusRow}>
                            <div className={styles.roomStatusInfo}>
                              <p className={styles.roomStatusName}>{room.name}</p>
                              <p className={styles.roomStatusCapacity}>
                                정원 {room.capacity}명 · {room.pricePerHour.toLocaleString()}원/시간
                              </p>
                            </div>
                            <div>
                              {isOccupied ? (
                                <span className={`${styles.statusBadge} ${styles.statusOccupied}`}>사용중</span>
                              ) : nextRes ? (
                                <span className={`${styles.statusBadge} ${styles.statusReserved}`}>예약됨 ({formatTime(nextRes.startTime)})</span>
                              ) : (
                                <span className={`${styles.statusBadge} ${styles.statusAvailable}`}>공실</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* 과거 매출 데이터 연계 종합 분석 섹션 (과거 데이터 쌓임 대응 및 월 누적 요약) */}
              <div className={styles.dashboardLayout} style={{ marginTop: "24px" }}>
                {/* Left: 일별 매출 비교 (과거 매출 및 미래 예측 매출) */}
                <div className={styles.dashboardSection}>
                  <div className={styles.sectionHeader} style={{ flexWrap: "wrap", gap: "8px" }}>
                    <h3 className={styles.sectionTitle}>📊 일별 매출 비교</h3>
                    {/* Quick Date Chips (어제, 오늘, 내일 기본 제공) */}
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      <button
                        onClick={() => setPastDateQuery(getYesterday(SYSTEM_TODAY))}
                        style={{
                          padding: "2px 10px",
                          borderRadius: "12px",
                          fontSize: "0.75rem",
                          fontWeight: "700",
                          border: "1px solid var(--border)",
                          backgroundColor: pastDateQuery === getYesterday(SYSTEM_TODAY) ? "var(--primary-teal)" : "var(--bg-secondary)",
                          color: pastDateQuery === getYesterday(SYSTEM_TODAY) ? "#ffffff" : "var(--text-secondary)",
                          cursor: "pointer"
                        }}
                      >
                        어제
                      </button>
                      <button
                        onClick={() => setPastDateQuery(SYSTEM_TODAY)}
                        style={{
                          padding: "2px 10px",
                          borderRadius: "12px",
                          fontSize: "0.75rem",
                          fontWeight: "700",
                          border: "1px solid var(--border)",
                          backgroundColor: pastDateQuery === SYSTEM_TODAY ? "var(--primary-teal)" : "var(--bg-secondary)",
                          color: pastDateQuery === SYSTEM_TODAY ? "#ffffff" : "var(--text-secondary)",
                          cursor: "pointer"
                        }}
                      >
                        오늘
                      </button>
                      <button
                        onClick={() => setPastDateQuery(getTomorrow(SYSTEM_TODAY))}
                        style={{
                          padding: "2px 10px",
                          borderRadius: "12px",
                          fontSize: "0.75rem",
                          fontWeight: "700",
                          border: "1px solid var(--border)",
                          backgroundColor: pastDateQuery === getTomorrow(SYSTEM_TODAY) ? "var(--primary-teal)" : "var(--bg-secondary)",
                          color: pastDateQuery === getTomorrow(SYSTEM_TODAY) ? "#ffffff" : "var(--text-secondary)",
                          cursor: "pointer"
                        }}
                      >
                        내일
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                      {/* 좌측 화살표 버튼 ◀ */}
                      <button
                        onClick={() => setPastDateQuery(prev => getYesterday(prev))}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "6px",
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                          cursor: "pointer",
                          fontWeight: "700",
                          fontSize: "0.85rem"
                        }}
                        title="어제 (이전 날짜)"
                        id="btn-past-date-prev"
                      >
                        ◀
                      </button>
                      <input 
                        type="date" 
                        value={pastDateQuery} 
                        onChange={(e) => setPastDateQuery(e.target.value)}
                        className={styles.selectInput}
                        style={{ maxWidth: "160px", padding: "4px 8px", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "0.85rem" }}
                        id="input-past-date"
                      />
                      {/* 우측 화살표 버튼 ▶ */}
                      <button
                        onClick={() => setPastDateQuery(prev => getTomorrow(prev))}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "6px",
                          border: "1px solid var(--border)",
                          backgroundColor: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                          cursor: "pointer",
                          fontWeight: "700",
                          fontSize: "0.85rem"
                        }}
                        title="내일 (다음 날짜)"
                        id="btn-past-date-next"
                      >
                        ▶
                      </button>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: "600", marginLeft: "4px" }}>
                        ({getDayOfWeek(pastDateQuery)})
                      </span>
                      {pastDateQuery < SYSTEM_TODAY && (
                        <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: "4px", backgroundColor: "rgba(107, 114, 128, 0.15)", color: "var(--text-secondary)", fontWeight: "600" }}>
                          과거 확정
                        </span>
                      )}
                      {pastDateQuery === SYSTEM_TODAY && (
                        <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: "4px", backgroundColor: "rgba(13, 148, 136, 0.15)", color: "#0D9488", fontWeight: "600" }}>
                          오늘 실시간
                        </span>
                      )}
                      {pastDateQuery > SYSTEM_TODAY && (
                        <span style={{ fontSize: "0.72rem", padding: "2px 6px", borderRadius: "4px", backgroundColor: "rgba(79, 70, 229, 0.15)", color: "#4F46E5", fontWeight: "600" }}>
                          미래 예측
                        </span>
                      )}
                    </div>

                  {/* 3일치 지점별 매출 한눈에 보기 종합 비교 표 */}
                  <div style={{ overflowX: "auto", marginBottom: "16px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "center" }}>
                      <thead>
                        <tr style={{ backgroundColor: "var(--bg-secondary)", borderBottom: "2px solid var(--border)" }}>
                          <th style={{ padding: "10px 8px", fontWeight: "700", color: "var(--text-primary)", textAlign: "left", width: "25%" }}>지점명</th>
                          <th style={{ padding: "10px 8px", fontWeight: "700", color: "var(--text-primary)", width: "25%" }}>
                            <div>{threeDaySalesData.day1.date.substring(5)} {getDayOfWeek(threeDaySalesData.day1.date)}</div>
                            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: "600" }}>
                              {threeDaySalesData.day1.date < SYSTEM_TODAY ? "과거 확정" : threeDaySalesData.day1.date === SYSTEM_TODAY ? "오늘 실시간" : "미래 예측"}
                            </div>
                          </th>
                          <th style={{ padding: "10px 8px", fontWeight: "700", color: "#0D9488", backgroundColor: "rgba(13, 148, 136, 0.08)", width: "25%" }}>
                            <div>{threeDaySalesData.day2.date.substring(5)} {getDayOfWeek(threeDaySalesData.day2.date)} ⭐</div>
                            <div style={{ fontSize: "0.68rem", color: "#0D9488", fontWeight: "700" }}>
                              {threeDaySalesData.day2.date < SYSTEM_TODAY ? "과거 확정" : threeDaySalesData.day2.date === SYSTEM_TODAY ? "오늘 실시간" : "미래 예측"}
                            </div>
                          </th>
                          <th style={{ padding: "10px 8px", fontWeight: "700", color: "var(--text-primary)", width: "25%" }}>
                            <div>{threeDaySalesData.day3.date.substring(5)} {getDayOfWeek(threeDaySalesData.day3.date)}</div>
                            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: "600" }}>
                              {threeDaySalesData.day3.date < SYSTEM_TODAY ? "과거 확정" : threeDaySalesData.day3.date === SYSTEM_TODAY ? "오늘 실시간" : "미래 예측"}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* 1. 정자본점 */}
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 8px", textAlign: "left", fontWeight: "700", color: "#0D9488" }}>🏢 정자본점</td>
                          <td style={{ padding: "10px 8px" }}>
                            <div style={{ fontWeight: "700" }}>{threeDaySalesData.day1.jj.amount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{threeDaySalesData.day1.jj.count}건 ({threeDaySalesData.day1.jj.hours.toFixed(1)}h)</div>
                          </td>
                          <td style={{ padding: "10px 8px", backgroundColor: "rgba(13, 148, 136, 0.04)" }}>
                            <div style={{ fontWeight: "800", color: "#0D9488" }}>{threeDaySalesData.day2.jj.amount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{threeDaySalesData.day2.jj.count}건 ({threeDaySalesData.day2.jj.hours.toFixed(1)}h)</div>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <div style={{ fontWeight: "700" }}>{threeDaySalesData.day3.jj.amount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{threeDaySalesData.day3.jj.count}건 ({threeDaySalesData.day3.jj.hours.toFixed(1)}h)</div>
                          </td>
                        </tr>

                        {/* 2. 수지구청점 */}
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 8px", textAlign: "left", fontWeight: "700", color: "#4F46E5" }}>🏫 수지구청점</td>
                          <td style={{ padding: "10px 8px" }}>
                            <div style={{ fontWeight: "700" }}>{threeDaySalesData.day1.sj.amount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{threeDaySalesData.day1.sj.count}건 ({threeDaySalesData.day1.sj.hours.toFixed(1)}h)</div>
                          </td>
                          <td style={{ padding: "10px 8px", backgroundColor: "rgba(13, 148, 136, 0.04)" }}>
                            <div style={{ fontWeight: "800", color: "#4F46E5" }}>{threeDaySalesData.day2.sj.amount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{threeDaySalesData.day2.sj.count}건 ({threeDaySalesData.day2.sj.hours.toFixed(1)}h)</div>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <div style={{ fontWeight: "700" }}>{threeDaySalesData.day3.sj.amount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{threeDaySalesData.day3.sj.count}건 ({threeDaySalesData.day3.sj.hours.toFixed(1)}h)</div>
                          </td>
                        </tr>

                        {/* 3. 알루점 */}
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 8px", textAlign: "left", fontWeight: "700", color: "#F97316" }}>☕ 알루점</td>
                          <td style={{ padding: "10px 8px" }}>
                            <div style={{ fontWeight: "700" }}>{threeDaySalesData.day1.al.amount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{threeDaySalesData.day1.al.count}건 ({threeDaySalesData.day1.al.hours.toFixed(1)}h)</div>
                          </td>
                          <td style={{ padding: "10px 8px", backgroundColor: "rgba(13, 148, 136, 0.04)" }}>
                            <div style={{ fontWeight: "800", color: "#F97316" }}>{threeDaySalesData.day2.al.amount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{threeDaySalesData.day2.al.count}건 ({threeDaySalesData.day2.al.hours.toFixed(1)}h)</div>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <div style={{ fontWeight: "700" }}>{threeDaySalesData.day3.al.amount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{threeDaySalesData.day3.al.count}건 ({threeDaySalesData.day3.al.hours.toFixed(1)}h)</div>
                          </td>
                        </tr>

                        {/* 4. 위례점 */}
                        <tr style={{ borderBottom: "2px solid var(--border)" }}>
                          <td style={{ padding: "10px 8px", textAlign: "left", fontWeight: "700", color: "#A855F7" }}>🏙️ 위례점</td>
                          <td style={{ padding: "10px 8px" }}>
                            <div style={{ fontWeight: "700" }}>{threeDaySalesData.day1.wr.amount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{threeDaySalesData.day1.wr.count}건 ({threeDaySalesData.day1.wr.hours.toFixed(1)}h)</div>
                          </td>
                          <td style={{ padding: "10px 8px", backgroundColor: "rgba(13, 148, 136, 0.04)" }}>
                            <div style={{ fontWeight: "800", color: "#A855F7" }}>{threeDaySalesData.day2.wr.amount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{threeDaySalesData.day2.wr.count}건 ({threeDaySalesData.day2.wr.hours.toFixed(1)}h)</div>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            <div style={{ fontWeight: "700" }}>{threeDaySalesData.day3.wr.amount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{threeDaySalesData.day3.wr.count}건 ({threeDaySalesData.day3.wr.hours.toFixed(1)}h)</div>
                          </td>
                        </tr>

                        {/* Footer: 4개 지점 일별 총합계 */}
                        <tr style={{ backgroundColor: "rgba(13, 148, 136, 0.1)", fontWeight: "800" }}>
                          <td style={{ padding: "12px 8px", textAlign: "left", color: "var(--primary-teal)", fontSize: "0.9rem" }}>🌐 지점 총합계</td>
                          <td style={{ padding: "12px 8px", color: "var(--text-primary)" }}>
                            <div style={{ fontSize: "0.95rem" }}>{threeDaySalesData.day1.totalAmount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: "600" }}>{threeDaySalesData.day1.totalCount}건 ({threeDaySalesData.day1.totalHours.toFixed(1)}h)</div>
                          </td>
                          <td style={{ padding: "12px 8px", color: "#0D9488", backgroundColor: "rgba(13, 148, 136, 0.15)" }}>
                            <div style={{ fontSize: "1rem" }}>{threeDaySalesData.day2.totalAmount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "#0D9488", fontWeight: "600" }}>{threeDaySalesData.day2.totalCount}건 ({threeDaySalesData.day2.totalHours.toFixed(1)}h)</div>
                          </td>
                          <td style={{ padding: "12px 8px", color: "var(--text-primary)" }}>
                            <div style={{ fontSize: "0.95rem" }}>{threeDaySalesData.day3.totalAmount.toLocaleString()}원</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: "600" }}>{threeDaySalesData.day3.totalCount}건 ({threeDaySalesData.day3.totalHours.toFixed(1)}h)</div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 지점별 매출 점유 비중 바 */}
                    <div style={{ flex: 1, minWidth: "180px", backgroundColor: "var(--bg-secondary)", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", fontWeight: "700", marginBottom: "4px" }}>
                        <span>매출 점유 비중</span>
                        <span style={{ color: "var(--primary-teal)" }}>총 {pastDateSales.totalAmount.toLocaleString()}원</span>
                      </div>
                      <div style={{ height: "8px", borderRadius: "4px", overflow: "hidden", display: "flex", backgroundColor: "rgba(0,0,0,0.06)" }}>
                        {pastDateSales.totalAmount > 0 ? (
                          <>
                            <div style={{ width: `${(pastDateSales.jjAmount / pastDateSales.totalAmount) * 100}%`, backgroundColor: "#0D9488" }} title={`정자: ${((pastDateSales.jjAmount / pastDateSales.totalAmount) * 100).toFixed(1)}%`} />
                            <div style={{ width: `${(pastDateSales.sjAmount / pastDateSales.totalAmount) * 100}%`, backgroundColor: "#4F46E5" }} title={`수지: ${((pastDateSales.sjAmount / pastDateSales.totalAmount) * 100).toFixed(1)}%`} />
                            <div style={{ width: `${(pastDateSales.alAmount / pastDateSales.totalAmount) * 100}%`, backgroundColor: "#F97316" }} title={`알루: ${((pastDateSales.alAmount / pastDateSales.totalAmount) * 100).toFixed(1)}%`} />
                            <div style={{ width: `${(pastDateSales.wrAmount / pastDateSales.totalAmount) * 100}%`, backgroundColor: "#A855F7" }} title={`위례: ${((pastDateSales.wrAmount / pastDateSales.totalAmount) * 100).toFixed(1)}%`} />
                          </>
                        ) : (
                          <div style={{ width: "100%", backgroundColor: "var(--border)", textAlign: "center", fontSize: "0.65rem", color: "var(--text-muted)" }}>매출 없음</div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* 4개 지점 + 통합 5개 비교 카드 그리드 */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px", marginBottom: "14px" }}>
                    <div style={{ backgroundColor: "rgba(13, 148, 136, 0.05)", border: "1px solid rgba(13, 148, 136, 0.2)", borderRadius: "8px", padding: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.8rem", color: "#0D9488", fontWeight: "700" }}>🏢 정자본점</span>
                        <span style={{ fontSize: "0.7rem", color: "#0D9488", fontWeight: "700" }}>
                          {pastDateSales.totalAmount > 0 ? ((pastDateSales.jjAmount / pastDateSales.totalAmount) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                      <p style={{ margin: "6px 0 2px 0", fontSize: "1.15rem", fontWeight: "800", color: "var(--text-primary)" }}>
                        {pastDateSales.jjAmount.toLocaleString()}원
                      </p>
                      <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        {pastDateSales.jjCount}건 ({pastDateSales.jjHours.toFixed(1)}h)
                      </p>
                    </div>

                    <div style={{ backgroundColor: "rgba(79, 70, 229, 0.05)", border: "1px solid rgba(79, 70, 229, 0.2)", borderRadius: "8px", padding: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.8rem", color: "#4F46E5", fontWeight: "700" }}>🏫 수지구청점</span>
                        <span style={{ fontSize: "0.7rem", color: "#4F46E5", fontWeight: "700" }}>
                          {pastDateSales.totalAmount > 0 ? ((pastDateSales.sjAmount / pastDateSales.totalAmount) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                      <p style={{ margin: "6px 0 2px 0", fontSize: "1.15rem", fontWeight: "800", color: "var(--text-primary)" }}>
                        {pastDateSales.sjAmount.toLocaleString()}원
                      </p>
                      <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        {pastDateSales.sjCount}건 ({pastDateSales.sjHours.toFixed(1)}h)
                      </p>
                    </div>

                    <div style={{ backgroundColor: "rgba(249, 115, 22, 0.05)", border: "1px solid rgba(249, 115, 22, 0.2)", borderRadius: "8px", padding: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.8rem", color: "#F97316", fontWeight: "700" }}>☕ 알루점 (16룸)</span>
                        <span style={{ fontSize: "0.7rem", color: "#F97316", fontWeight: "700" }}>
                          {pastDateSales.totalAmount > 0 ? ((pastDateSales.alAmount / pastDateSales.totalAmount) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                      <p style={{ margin: "6px 0 2px 0", fontSize: "1.15rem", fontWeight: "800", color: "var(--text-primary)" }}>
                        {pastDateSales.alAmount.toLocaleString()}원
                      </p>
                      <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        {pastDateSales.alCount}건 ({pastDateSales.alHours.toFixed(1)}h)
                      </p>
                    </div>

                    <div style={{ backgroundColor: "rgba(168, 85, 247, 0.05)", border: "1px solid rgba(168, 85, 247, 0.2)", borderRadius: "8px", padding: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.8rem", color: "#A855F7", fontWeight: "700" }}>🏙️ 위례점</span>
                        <span style={{ fontSize: "0.7rem", color: "#A855F7", fontWeight: "700" }}>
                          {pastDateSales.totalAmount > 0 ? ((pastDateSales.wrAmount / pastDateSales.totalAmount) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                      <p style={{ margin: "6px 0 2px 0", fontSize: "1.15rem", fontWeight: "800", color: "var(--text-primary)" }}>
                        {pastDateSales.wrAmount.toLocaleString()}원
                      </p>
                      <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        {pastDateSales.wrCount}건 ({pastDateSales.wrHours.toFixed(1)}h)
                      </p>
                    </div>
                  </div>

                  {/* 4개 지점 통합 총합 바 카드 */}
                  <div style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: "0.8rem", fontWeight: "800", color: "var(--text-primary)" }}>🌐 4개 지점 일 매출 총합계</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "8px" }}>
                        총 {pastDateSales.totalCount}건 ({pastDateSales.totalHours.toFixed(1)}시간)
                      </span>
                    </div>
                    <span style={{ fontSize: "1.25rem", fontWeight: "800", color: "var(--primary-teal)" }}>
                      {pastDateSales.totalAmount.toLocaleString()}원
                    </span>
                  </div>
                </div>

                {/* Right: 최근 3개월 월별 정밀 정합 매출 누계 */}
                <div className={styles.dashboardSection}>
                  <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>📊 최근 3개월 월별 지점 매출 누계</h3>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>단위: 원</span>
                  </div>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px", lineHeight: "1.4" }}>
                    정합 완료된 전체 과거 데이터의 이용일자 기준 월 누적 매출 집계 보고서입니다.
                  </p>
                  
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", borderTop: "1px solid var(--border)" }}>
                      <thead>
                        <tr style={{ backgroundColor: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
                          <th style={{ padding: "10px", textAlign: "left", color: "var(--text-secondary)" }}>조회 기수</th>
                          <th style={{ padding: "10px", textAlign: "right", color: "var(--text-secondary)" }}>정자본점</th>
                          <th style={{ padding: "10px", textAlign: "right", color: "var(--text-secondary)" }}>수지구청점</th>
                          <th style={{ padding: "10px", textAlign: "right", color: "var(--text-secondary)" }}>알루점</th>
                          <th style={{ padding: "10px", textAlign: "right", color: "var(--text-secondary)" }}>위례점</th>
                          <th style={{ padding: "10px", textAlign: "right", color: "var(--text-primary)", fontWeight: "700" }}>합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "12px 10px", fontWeight: "600" }}>6월 이용매출</td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>{stats.monthlySalesJj["6월"].toLocaleString()}원</td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>{stats.monthlySalesSj["6월"].toLocaleString()}원</td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>{stats.monthlySalesAl["6월"].toLocaleString()}원</td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>{stats.monthlySalesWr["6월"].toLocaleString()}원</td>
                          <td style={{ padding: "12px 10px", textAlign: "right", fontWeight: "700", color: "var(--primary-teal)" }}>
                            {(stats.monthlySalesJj["6월"] + stats.monthlySalesSj["6월"] + stats.monthlySalesAl["6월"] + stats.monthlySalesWr["6월"]).toLocaleString()}원
                          </td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "12px 10px", fontWeight: "600" }}>7월 이용매출</td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>{stats.monthlySalesJj["7월"].toLocaleString()}원</td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>{stats.monthlySalesSj["7월"].toLocaleString()}원</td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>{stats.monthlySalesAl["7월"].toLocaleString()}원</td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>{stats.monthlySalesWr["7월"].toLocaleString()}원</td>
                          <td style={{ padding: "12px 10px", textAlign: "right", fontWeight: "700", color: "var(--primary-teal)" }}>
                            {(stats.monthlySalesJj["7월"] + stats.monthlySalesSj["7월"] + stats.monthlySalesAl["7월"] + stats.monthlySalesWr["7월"]).toLocaleString()}원
                          </td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "12px 10px", fontWeight: "600" }}>8월 이용매출</td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>{stats.monthlySalesJj["8월"].toLocaleString()}원</td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>{stats.monthlySalesSj["8월"].toLocaleString()}원</td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>{stats.monthlySalesAl["8월"].toLocaleString()}원</td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>{stats.monthlySalesWr["8월"].toLocaleString()}원</td>
                          <td style={{ padding: "12px 10px", textAlign: "right", fontWeight: "700", color: "var(--primary-teal)" }}>
                            {(stats.monthlySalesJj["8월"] + stats.monthlySalesSj["8월"] + stats.monthlySalesAl["8월"] + stats.monthlySalesWr["8월"]).toLocaleString()}원
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RESERVATIONS */}
          {activeTab === "reservations" && (
            <div>
              <div className={styles.pageHeader}>
                <div>
                  <h2 className={styles.pageTitle}>{currentBranch} 예약 스케줄러 (30분 단위)</h2>
                  <div className={styles.syncBadgeContainer}>
                    {syncStatus === "loading" && <span className={styles.syncBadgeLoading}>🔄 수집 데이터 로딩 중...</span>}
                    {syncStatus === "success" && (
                      <span className={styles.syncBadgeSuccess}>
                        ✅ 수집 DB 정합 연동 완료 (100% 동기화)
                      </span>
                    )}
                    {syncStatus === "error" && <span className={styles.syncBadgeError}>⚠️ 네이버 연동 상태 확인필요</span>}
                    <button 
                      onClick={() => syncNaverReservations(currentBranch, selectedDate)}
                      className={styles.syncBtn}
                      title="실시간 네이버 예약 새로 긁어오기"
                    >
                      새로고침
                    </button>
                    <button 
                      onClick={handleRunCrawlerNow}
                      disabled={isCrawlExecuting}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "none",
                        backgroundColor: isCrawlExecuting ? "#6b7280" : "#2563eb",
                        color: "#ffffff",
                        fontSize: "0.8rem",
                        fontWeight: "700",
                        cursor: isCrawlExecuting ? "not-allowed" : "pointer",
                        marginLeft: "8px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                      id="btn-run-crawler-scheduler"
                    >
                      {isCrawlExecuting ? "🔄 스크래핑 진행 중..." : "🚀 네이버 스크래퍼 즉시 실행"}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className={styles.primaryBtn}
                  id="add-res-btn"
                >
                  ➕ 새 예약 등록
                </button>
              </div>

              {/* Filter and Date Navigation Bar */}
              <div className={styles.filterBar}>
                <div className={styles.dateNav} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <button 
                    onClick={handlePrevDay} 
                    className={styles.dateButton}
                    style={{ cursor: "pointer" }}
                    id="btn-timeline-prev"
                  >
                    ◀ 이전
                  </button>
                  <input 
                    type="date" 
                    value={selectedDate} 
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className={styles.selectInput}
                    style={{ maxWidth: "150px", padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "0.85rem" }}
                    id="input-timeline-date"
                  />
                  <button 
                    onClick={handleNextDay} 
                    className={styles.dateButton}
                    style={{ cursor: "pointer" }}
                    id="btn-timeline-next"
                  >
                    다음 ▶
                  </button>
                  <button onClick={handleSetToday} className={styles.dateButton} style={{ color: "var(--primary-teal)", fontWeight: "700" }}>오늘</button>
                  <span className={styles.currentDate}>({getDayOfWeek(selectedDate)})</span>
                </div>
                
                <div className={styles.filtersGroup}>
                  <select
                    value={roomFilter}
                    onChange={(e) => setRoomFilter(e.target.value)}
                    className={styles.selectInput}
                    aria-label="룸 필터"
                  >
                    <option value="all">모든 룸 보기</option>
                    {activeRooms.map(rm => (
                      <option key={rm.id} value={rm.id}>{rm.name}</option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className={styles.selectInput}
                    aria-label="상태 필터"
                  >
                    <option value="all">모든 상태 보기</option>
                    <option value="reserved">예약 완료</option>
                    <option value="completed">사용 완료</option>
                    <option value="canceled">취소됨</option>
                  </select>
                </div>
              </div>

              {/* Timeline Scheduler Grid */}
              <div className={styles.schedulerContainer}>
                {activeRooms.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px" }}>
                    운영 예정 지점으로 아직 등록된 예약 스케줄이 없습니다.
                  </div>
                ) : (
                  <table className={styles.timelineTable} style={{ width: "auto" }}>
                    <thead className={styles.timelineTableHeader}>
                      <tr>
                        <th 
                          style={{ 
                            width: "65px", 
                            minWidth: "65px", 
                            maxWidth: "65px", 
                            padding: "8px 4px", 
                            textAlign: "center", 
                            fontSize: "0.8rem", 
                            fontWeight: "700",
                            position: "sticky",
                            left: 0,
                            zIndex: 20,
                            backgroundColor: "var(--background)",
                            boxShadow: "2px 0 5px rgba(0, 0, 0, 0.08)"
                          }}
                        >
                          시간 / 룸
                        </th>
                        {activeRooms.map(room => (
                          <th key={room.id} style={{ padding: "8px 4px", width: "75px", minWidth: "75px", maxWidth: "75px", textAlign: "center", borderLeft: "1px solid var(--border)" }}>
                            <div style={{ fontWeight: "800", fontSize: "0.85rem", color: "var(--text-primary)", whiteSpace: "nowrap" }}>{room.name}</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: "400" }}>{room.capacity}인</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {renderTransposedScheduler()}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ROOMS */}
          {activeTab === "rooms" && (
            <div>
              <div className={styles.pageHeader}>
                <h2 className={styles.pageTitle}>{currentBranch} 룸 공간 설정</h2>
              </div>

              <div className={styles.roomGrid}>
                {activeRooms.length === 0 ? (
                  <div style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-muted)", padding: "40px" }}>
                    아직 등록된 룸 정보가 없습니다.
                  </div>
                ) : (
                  activeRooms.map(room => (
                    <div key={room.id} className={styles.roomCard}>
                      <div className={styles.roomImgPlaceholder}>
                        🚪 {room.capacity}인실
                      </div>
                      <div className={styles.roomCardBody}>
                        <h3 className={styles.roomCardTitle}>{room.name}</h3>
                        <p className={styles.roomCardPrice}>
                          {room.pricePerHour.toLocaleString()}원 <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>/ 시간</span>
                        </p>
                        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                          👥 수용인원: 기준/최대 {room.capacity}명
                        </p>
                        <p className={styles.roomCardDesc}>{room.description}</p>
                      </div>
                      <div className={styles.roomCardFooter}>
                        <button
                          onClick={() => handleOpenEditRoom(room)}
                          className={styles.secondaryBtn}
                          style={{ width: "100%" }}
                        >
                          ⚙️ 가격 및 옵션 수정
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ==========================================
         Overlay: New Reservation Modal (30-min Step support)
         ========================================== */}
      {isAddModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <header className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>새 예약 등록 ({currentBranch})</h3>
              <button onClick={() => setIsAddModalOpen(false)} className={styles.closeBtn}>×</button>
            </header>
            <form onSubmit={handleAddReservation}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label htmlFor="user-name">예약자명 *</label>
                  <input
                    type="text"
                    id="user-name"
                    value={newResForm.userName}
                    onChange={(e) => setNewResForm({ ...newResForm, userName: e.target.value })}
                    className={styles.textInput}
                    placeholder="실명을 입력하세요"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="user-phone">연락처 *</label>
                  <input
                    type="text"
                    id="user-phone"
                    value={newResForm.userPhone}
                    onChange={(e) => setNewResForm({ ...newResForm, userPhone: e.target.value })}
                    className={styles.textInput}
                    placeholder="010-XXXX-XXXX"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="room-select">스터디룸 선택 *</label>
                  <select
                    id="room-select"
                    value={newResForm.roomId}
                    onChange={(e) => setNewResForm({ ...newResForm, roomId: e.target.value })}
                    className={styles.selectInput}
                  >
                    {activeRooms.map(rm => (
                      <option key={rm.id} value={rm.id}>{rm.name} (수용: {rm.capacity}명)</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="res-date">예약 일자 *</label>
                    <input
                      type="date"
                      id="res-date"
                      value={newResForm.date}
                      min={SYSTEM_TODAY} // 과거 날짜 선택 차단
                      onChange={(e) => setNewResForm({ ...newResForm, date: e.target.value })}
                      className={styles.textInput}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="payment-method">결제 방식</label>
                    <select
                      id="payment-method"
                      value={newResForm.paymentMethod}
                      onChange={(e) => setNewResForm({ ...newResForm, paymentMethod: e.target.value as any })}
                      className={styles.selectInput}
                    >
                      <option value="card">신용카드</option>
                      <option value="transfer">계좌이체</option>
                      <option value="easy-pay">간편결제 (페이)</option>
                    </select>
                  </div>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="start-time">시작 시간 *</label>
                    <select
                      id="start-time"
                      value={newResForm.startTime}
                      onChange={(e) => setNewResForm({ ...newResForm, startTime: Number(e.target.value) })}
                      className={styles.selectInput}
                    >
                      {timeOptions.slice(0, -1).map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="end-time">종료 시간 *</label>
                    <select
                      id="end-time"
                      value={newResForm.endTime}
                      onChange={(e) => setNewResForm({ ...newResForm, endTime: Number(e.target.value) })}
                      className={styles.selectInput}
                    >
                      {timeOptions.filter(opt => opt.value > newResForm.startTime).map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <footer className={styles.modalFooter}>
                <button type="button" onClick={() => setIsAddModalOpen(false)} className={styles.secondaryBtn}>취소</button>
                <button type="submit" className={styles.primaryBtn}>예약 등록완료</button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
         Overlay Slide Drawer: Reservation Detail
         ========================================== */}


      {/* ==========================================
         Overlay: Edit Room Modal
         ========================================== */}
      {isEditRoomOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <header className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>룸 요금/정보 수정 ({currentBranch})</h3>
              <button onClick={() => setIsEditRoomOpen(null)} className={styles.closeBtn}>×</button>
            </header>
            <form onSubmit={handleSaveRoom}>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label htmlFor="edit-room-name">룸 이름 *</label>
                  <input
                    type="text"
                    id="edit-room-name"
                    value={editRoomForm.name}
                    onChange={(e) => setEditRoomForm({ ...editRoomForm, name: e.target.value })}
                    className={styles.textInput}
                    required
                  />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="edit-price">시간당 요금 (원) *</label>
                    <input
                      type="number"
                      id="edit-price"
                      value={editRoomForm.pricePerHour}
                      onChange={(e) => setEditRoomForm({ ...editRoomForm, pricePerHour: Number(e.target.value) })}
                      className={styles.textInput}
                      min="0"
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="edit-capacity">최대 수용 정원 *</label>
                    <input
                      type="number"
                      id="edit-capacity"
                      value={editRoomForm.capacity}
                      onChange={(e) => setEditRoomForm({ ...editRoomForm, capacity: Number(e.target.value) })}
                      className={styles.textInput}
                      min="1"
                      required
                    />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="edit-description">공간 소개/어메니티 정보</label>
                  <textarea
                    id="edit-description"
                    value={editRoomForm.description}
                    onChange={(e) => setEditRoomForm({ ...editRoomForm, description: e.target.value })}
                    className={styles.textInput}
                    style={{ height: "100px", resize: "none" }}
                  />
                </div>
              </div>
              <footer className={styles.modalFooter}>
                <button type="button" onClick={() => setIsEditRoomOpen(null)} className={styles.secondaryBtn}>취소</button>
                <button type="submit" className={styles.primaryBtn}>수정 완료</button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
         지점 네이버 예약 URL 설정 모달
         ========================================== */}
      {isUrlModalOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.75)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "16px",
            padding: "28px",
            width: "92%",
            maxWidth: "650px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
            color: "#f8fafc"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #1e293b", paddingBottom: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#ffffff" }}>
                ⚙️ 지점별 네이버 예약 원본 URL 설정
              </h3>
              <button
                onClick={() => setIsUrlModalOpen(false)}
                style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#94a3b8", fontSize: "1.1rem", width: "32px", height: "32px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                ✕
              </button>
            </div>
            
            <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginBottom: "20px", lineHeight: "1.5" }}>
              지점별 네이버 예약 원본 주소를 설정합니다. 이 주소를 변수로 참조하여 모든 지점에 동일한 동적 스크래핑 추출 로직이 안전하게 적용됩니다.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {["정자점", "수지구청점", "알루", "위례점"].map(bName => {
                const cfg = branchUrlConfigs[bName] || {};
                const inputVal = editingUrlInput[bName] ?? (cfg.bookingUrl || "");
                return (
                  <div key={bName} style={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "10px", padding: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label style={{ fontSize: "0.9rem", fontWeight: 700, color: "#38bdf8" }}>
                        [{bName}] 네이버 예약 주소
                      </label>
                      <span style={{ fontSize: "0.75rem", color: "#a855f7", backgroundColor: "#0f172a", padding: "2px 8px", borderRadius: "4px", border: "1px solid #334155" }}>
                        Business ID: {cfg.businessId || "미설정"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        value={inputVal}
                        onChange={(e) => setEditingUrlInput({ ...editingUrlInput, [bName]: e.target.value })}
                        placeholder={`https://booking.naver.com/booking/10/bizes/...`}
                        style={{
                          flex: 1,
                          padding: "10px 14px",
                          borderRadius: "6px",
                          border: "1px solid #475569",
                          backgroundColor: "#0f172a",
                          color: "#ffffff",
                          fontSize: "0.85rem",
                          outline: "none"
                        }}
                      />
                      <button
                        onClick={() => handleSaveBranchUrl(bName, inputVal)}
                        style={{
                          padding: "10px 18px",
                          borderRadius: "6px",
                          border: "none",
                          backgroundColor: "#0d9488",
                          color: "#ffffff",
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          whiteSpace: "nowrap"
                        }}
                      >
                        저장
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: "24px", textAlign: "right" }}>
              <button
                onClick={() => setIsUrlModalOpen(false)}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "1px solid #475569",
                  backgroundColor: "#334155",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
         Overlay: Branch Room Price Modal (지점별 룸 가격 안내 팝업 모달)
         ========================================== */}
      {isPriceModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: "720px", width: "90%" }}>
            <header className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>🏷️ 지점별 룸 가격 및 수용인원 안내</h3>
              <button onClick={() => setIsPriceModalOpen(false)} className={styles.closeBtn}>×</button>
            </header>
            
            <div style={{ padding: "20px" }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                각 지점별 룸 공간의 수용 인원 및 1시간당 가격 정보를 한눈에 확인하실 수 있습니다.
              </p>

              {/* 지점 선택 탭 버튼 */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "20px", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>
                {(["정자점", "수지구청점", "알루", "위례점"] as const).map(b => (
                  <button
                    key={b}
                    onClick={() => setSelectedPriceBranch(b)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "none",
                      backgroundColor: selectedPriceBranch === b ? "var(--primary-teal)" : "var(--bg-secondary)",
                      color: selectedPriceBranch === b ? "#ffffff" : "var(--text-primary)",
                      fontWeight: "700",
                      fontSize: "0.85rem",
                      cursor: "pointer"
                    }}
                  >
                    {b === "정자점" ? "정자본점" : b === "알루" ? "알루점" : b}
                  </button>
                ))}
              </div>

              {/* 해당 지점 룸 리스트 가격 안내 테이블 */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ backgroundColor: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "10px", textAlign: "left", color: "var(--text-secondary)" }}>룸 이름</th>
                      <th style={{ padding: "10px", textAlign: "center", color: "var(--text-secondary)" }}>수용 인원</th>
                      <th style={{ padding: "10px", textAlign: "right", color: "var(--text-secondary)" }}>1시간당 가격</th>
                      <th style={{ padding: "10px", textAlign: "left", color: "var(--text-secondary)" }}>공간 옵션 설명</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms
                      .filter(r => r.branch === selectedPriceBranch)
                      .map(r => (
                        <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "12px 10px", fontWeight: "700", color: "var(--text-primary)" }}>
                            {r.name}
                          </td>
                          <td style={{ padding: "12px 10px", textAlign: "center", color: "var(--text-secondary)" }}>
                            👥 {r.capacity}인실
                          </td>
                          <td style={{ padding: "12px 10px", textAlign: "right", fontWeight: "800", color: "var(--primary-teal)" }}>
                            {r.pricePerHour.toLocaleString()} 원
                          </td>
                          <td style={{ padding: "12px 10px", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                            {r.description}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <footer className={styles.modalFooter}>
              <button 
                onClick={() => setIsPriceModalOpen(false)} 
                className={styles.primaryBtn}
                style={{ padding: "8px 20px" }}
              >
                닫기
              </button>
            </footer>
          </div>
        </div>
      )}

    </div>
  );
}
