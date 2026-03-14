import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
  List, LayoutGrid, Columns, Edit, Trash2, ExternalLink, CheckSquare
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

type CalendarEventItem = {
  id: string;
  title: string;
  date: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  category: string;
  color: string;
  completed?: boolean;
  sourceType: string;
  sourceId?: string;
  description?: string | null;
  assigneeName?: string | null;
  taskType?: string | null;
};

type PageMode = "schedule" | "todo";

type AreaFilter = "all" | "sales" | "project" | "purchase" | "finance";

const AREA_CONFIG: { key: AreaFilter; label: string; sourceTypes: string[] }[] = [
  { key: "all", label: "전체", sourceTypes: [] },
  { key: "sales", label: "영업", sourceTypes: ["inquiryTask"] },
  { key: "project", label: "프로젝트", sourceTypes: ["projectTask", "project"] },
  { key: "purchase", label: "구매", sourceTypes: ["poTask", "purchaseOrder"] },
  { key: "finance", label: "경영지원", sourceTypes: ["financeTask", "payment"] },
];

type ViewMode = "month" | "week" | "list";

const CATEGORY_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string; activeBtn: string }> = {
  task: { label: "할일", dotClass: "bg-blue-500", badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300", activeBtn: "bg-blue-500 text-white hover:bg-blue-600" },
  delivery: { label: "입고", dotClass: "bg-orange-500", badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300", activeBtn: "bg-orange-500 text-white hover:bg-orange-600" },
  deadline: { label: "납품", dotClass: "bg-red-500", badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300", activeBtn: "bg-red-500 text-white hover:bg-red-600" },
  payment: { label: "대금", dotClass: "bg-green-500", badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300", activeBtn: "bg-green-500 text-white hover:bg-green-600" },
  custom: { label: "일정", dotClass: "bg-purple-500", badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300", activeBtn: "bg-purple-500 text-white hover:bg-purple-600" },
};

const COLOR_STYLES: Record<string, { dotClass: string; badgeClass: string }> = {
  purple: { dotClass: "bg-purple-500", badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  blue: { dotClass: "bg-blue-500", badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  green: { dotClass: "bg-green-500", badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  orange: { dotClass: "bg-orange-500", badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  red: { dotClass: "bg-red-500", badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

function getEventStyles(event: CalendarEventItem) {
  if (event.category === "custom" && event.color && COLOR_STYLES[event.color]) {
    return COLOR_STYLES[event.color];
  }
  return CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.custom;
}

function getMonthRange(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const calendarStart = new Date(year, month, 1 - startOffset);
  const lastDay = new Date(year, month + 1, 0);
  const endOffset = 6 - lastDay.getDay();
  const calendarEnd = new Date(year, month + 1, endOffset);
  return {
    start: fmt(calendarStart),
    end: fmt(calendarEnd),
    calendarStart,
    calendarEnd,
  };
}

function getWeekRange(date: Date) {
  const day = date.getDay();
  const start = new Date(date);
  start.setDate(date.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: fmt(start), end: fmt(end), calendarStart: start, calendarEnd: end };
}

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtKorean(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${m}월 ${d}일`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function CalendarPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay());
    return d;
  });
  const [pageMode, setPageMode] = useState<PageMode>("schedule");
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [filters, setFilters] = useState<Record<string, boolean>>({
    task: true, delivery: true, deadline: true, payment: true, custom: true,
  });
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("all");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventItem | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventItem | null>(null);
  const [addForm, setAddForm] = useState({ title: "", date: fmt(today), endDate: "", startTime: "", endTime: "", description: "", color: "purple" });
  const [todoShowCompleted, setTodoShowCompleted] = useState(false);

  const range = useMemo(() => {
    if (viewMode === "month") return getMonthRange(currentYear, currentMonth);
    if (viewMode === "week") return getWeekRange(currentWeekStart);
    return getMonthRange(currentYear, currentMonth);
  }, [viewMode, currentYear, currentMonth, currentWeekStart]);

  const todoRange = useMemo(() => {
    const s = new Date();
    s.setMonth(s.getMonth() - 3);
    const e = new Date();
    e.setMonth(e.getMonth() + 6);
    return { start: fmt(s), end: fmt(e) };
  }, []);

  const activeRange = pageMode === "todo" ? todoRange : range;

  const { data: events = [], isLoading } = useQuery<CalendarEventItem[]>({
    queryKey: ["/api/calendar/events", activeRange.start, activeRange.end],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/events?start=${activeRange.start}&end=${activeRange.end}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load events");
      return res.json();
    },
  });

  const filteredEvents = useMemo(() => {
    const areaSourceTypes = AREA_CONFIG.find(a => a.key === areaFilter)?.sourceTypes || [];
    return events.filter(e => {
      if (e.category === "task" && e.taskType === "todo") return false;
      if (!filters[e.category]) return false;
      if (areaFilter === "all") return true;
      if (e.sourceType === "calendarEvent") return true;
      return areaSourceTypes.includes(e.sourceType);
    });
  }, [events, filters, areaFilter]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEventItem[]> = {};
    for (const e of filteredEvents) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [filteredEvents]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof addForm) => {
      await apiRequest("POST", "/api/calendar/events", {
        title: data.title,
        date: data.date,
        endDate: data.endDate || null,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        description: data.description || null,
        color: data.color,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      setShowAddDialog(false);
      setAddForm({ title: "", date: fmt(today), endDate: "", startTime: "", endTime: "", description: "", color: "purple" });
      toast({ title: "일정이 추가되었습니다" });
    },
    onError: (err: Error) => toast({ title: "오류", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof addForm }) => {
      await apiRequest("PATCH", `/api/calendar/events/${id}`, {
        title: data.title,
        date: data.date,
        endDate: data.endDate || null,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        description: data.description || null,
        color: data.color,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      setEditingEvent(null);
      toast({ title: "일정이 수정되었습니다" });
    },
    onError: (err: Error) => toast({ title: "오류", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/calendar/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      setSelectedEvent(null);
      toast({ title: "일정이 삭제되었습니다" });
    },
    onError: (err: Error) => toast({ title: "오류", description: err.message, variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: async ({ compositeId, completed }: { compositeId: string; completed: boolean }) => {
      await apiRequest("PATCH", `/api/calendar/tasks/${compositeId}/complete`, { completed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
    },
    onError: (err: Error) => toast({ title: "완료 처리 실패", description: err.message, variant: "destructive" }),
  });

  const todoEvents = useMemo(() => {
    const tasks = events.filter(e => e.category === "task" && e.taskType === "todo");
    const areaSourceTypes = AREA_CONFIG.find(a => a.key === areaFilter)?.sourceTypes || [];
    const filtered = tasks.filter(e => {
      if (areaFilter !== "all" && !areaSourceTypes.includes(e.sourceType)) return false;
      if (!todoShowCompleted && e.completed) return false;
      return true;
    });
    return filtered;
  }, [events, areaFilter, todoShowCompleted]);

  const todoByDate = useMemo(() => {
    const map: Record<string, CalendarEventItem[]> = {};
    for (const e of todoEvents) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [todoEvents]);

  function goToday() {
    const t = new Date();
    setCurrentYear(t.getFullYear());
    setCurrentMonth(t.getMonth());
    const ws = new Date(t);
    ws.setDate(t.getDate() - t.getDay());
    setCurrentWeekStart(ws);
  }

  function goPrev() {
    if (viewMode === "month" || viewMode === "list") {
      if (currentMonth === 0) { setCurrentYear(y => y - 1); setCurrentMonth(11); }
      else setCurrentMonth(m => m - 1);
    } else {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() - 7);
      setCurrentWeekStart(d);
    }
  }

  function goNext() {
    if (viewMode === "month" || viewMode === "list") {
      if (currentMonth === 11) { setCurrentYear(y => y + 1); setCurrentMonth(0); }
      else setCurrentMonth(m => m + 1);
    } else {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + 7);
      setCurrentWeekStart(d);
    }
  }

  function getSourceLink(e: CalendarEventItem): string | null {
    if (e.sourceType === "inquiryTask") return `/inquiries?selected=${e.sourceId}`;
    if (e.sourceType === "projectTask" || e.sourceType === "project") return `/projects`;
    if (e.sourceType === "poTask" || e.sourceType === "purchaseOrder") return `/purchase-orders`;
    if (e.sourceType === "financeTask" || e.sourceType === "payment") return `/payment-plan`;
    return null;
  }

  const todayStr = fmt(today);
  const headerTitle = viewMode === "week"
    ? `${currentWeekStart.getFullYear()}년 ${currentWeekStart.getMonth() + 1}월 ${currentWeekStart.getDate()}일 ~ ${range.calendarEnd.getMonth() + 1}월 ${range.calendarEnd.getDate()}일`
    : `${currentYear}년 ${currentMonth + 1}월`;

  function renderMonthGrid() {
    const weeks: Date[][] = [];
    let cursor = new Date(range.calendarStart);
    while (cursor <= range.calendarEnd) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }

    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 border-b sticky top-0 bg-background z-10">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={cn("text-center text-xs font-medium py-2 border-r last:border-r-0", i === 0 && "text-red-500", i === 6 && "text-blue-500")}>
              {d}
            </div>
          ))}
        </div>
        <div className="flex-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b last:border-b-0" style={{ minHeight: "120px" }}>
              {week.map((day, di) => {
                const dateStr = fmt(day);
                const isCurrentMonth = day.getMonth() === currentMonth;
                const isToday = dateStr === todayStr;
                const dayEvents = eventsByDate[dateStr] || [];
                return (
                  <div
                    key={dateStr}
                    className={cn(
                      "border-r last:border-r-0 p-1 overflow-hidden",
                      !isCurrentMonth && "bg-muted/30",
                    )}
                    data-testid={`calendar-day-${dateStr}`}
                  >
                    <div className={cn(
                      "text-xs font-medium mb-0.5 w-6 h-6 flex items-center justify-center rounded-full",
                      isToday && "bg-primary text-primary-foreground",
                      !isToday && di === 0 && "text-red-500",
                      !isToday && di === 6 && "text-blue-500",
                      !isCurrentMonth && !isToday && "text-muted-foreground",
                    )}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 4).map(evt => (
                        <Popover key={evt.id}>
                          <PopoverTrigger asChild>
                            <button
                              className={cn(
                                "w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate",
                                getEventStyles(evt).badgeClass,
                                evt.completed && "line-through opacity-60",
                              )}
                              data-testid={`calendar-event-${evt.id}`}
                            >
                              {evt.startTime && <span className="font-medium">{evt.startTime} </span>}
                              {evt.title}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 p-3" align="start">
                            <EventDetail event={evt} onNavigate={navigate} onEdit={setEditingEvent} onDelete={(id) => deleteMutation.mutate(id)} />
                          </PopoverContent>
                        </Popover>
                      ))}
                      {dayEvents.length > 4 && (
                        <div className="text-[10px] text-muted-foreground text-center">+{dayEvents.length - 4}개 더</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderWeekGrid() {
    const days: Date[] = [];
    const cursor = new Date(range.calendarStart);
    for (let i = 0; i < 7; i++) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 min-h-full">
          {days.map((day, di) => {
            const dateStr = fmt(day);
            const isToday = dateStr === todayStr;
            const dayEvents = eventsByDate[dateStr] || [];
            return (
              <div key={dateStr} className="border-r last:border-r-0 flex flex-col">
                <div className={cn(
                  "text-center py-2 border-b sticky top-0 bg-background z-10",
                  isToday && "bg-primary/5",
                )}>
                  <div className={cn("text-xs", di === 0 && "text-red-500", di === 6 && "text-blue-500")}>
                    {WEEKDAYS[di]}
                  </div>
                  <div className={cn(
                    "text-lg font-semibold mx-auto w-8 h-8 flex items-center justify-center rounded-full",
                    isToday && "bg-primary text-primary-foreground",
                    di === 0 && !isToday && "text-red-500",
                    di === 6 && !isToday && "text-blue-500",
                  )}>
                    {day.getDate()}
                  </div>
                </div>
                <div className="flex-1 p-1 space-y-1">
                  {dayEvents.map(evt => (
                    <Popover key={evt.id}>
                      <PopoverTrigger asChild>
                        <button
                          className={cn(
                            "w-full text-left text-xs px-2 py-1.5 rounded",
                            getEventStyles(evt).badgeClass,
                            evt.completed && "line-through opacity-60",
                          )}
                          data-testid={`calendar-event-${evt.id}`}
                        >
                          {evt.startTime && <span className="font-medium">{evt.startTime} </span>}
                          <span className="break-words">{evt.title}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-3" align="start">
                        <EventDetail event={evt} onNavigate={navigate} onEdit={setEditingEvent} onDelete={(id) => deleteMutation.mutate(id)} />
                      </PopoverContent>
                    </Popover>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderListView() {
    const dates = Object.keys(eventsByDate).sort();
    return (
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {dates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>이 기간에 일정이 없습니다</p>
          </div>
        ) : dates.map(dateStr => {
          const d = new Date(dateStr + "T00:00:00");
          const dayLabel = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
          const isToday = dateStr === todayStr;
          return (
            <div key={dateStr}>
              <div className={cn("text-sm font-semibold mb-2 px-1", isToday && "text-primary")}>
                {isToday && "오늘 · "}{dayLabel}
              </div>
              <div className="space-y-1">
                {eventsByDate[dateStr].map(evt => (
                  <Popover key={evt.id}>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          "w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border hover:bg-accent/50 transition-colors",
                          evt.completed && "opacity-60",
                        )}
                        data-testid={`calendar-event-${evt.id}`}
                      >
                        <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", getEventStyles(evt).dotClass)} />
                        <div className="flex-1 min-w-0">
                          <div className={cn("text-sm truncate", evt.completed && "line-through")}>
                            {evt.title}
                          </div>
                          {evt.description && <div className="text-xs text-muted-foreground truncate">{evt.description}</div>}
                        </div>
                        {evt.startTime && <span className="text-xs text-muted-foreground shrink-0">{evt.startTime}</span>}
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded shrink-0", getEventStyles(evt).badgeClass)}>
                          {CATEGORY_CONFIG[evt.category]?.label}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-3" align="start">
                      <EventDetail event={evt} onNavigate={navigate} onEdit={setEditingEvent} onDelete={(id) => deleteMutation.mutate(id)} />
                    </PopoverContent>
                  </Popover>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderTodoView() {
    const sortedDates = Object.keys(todoByDate).sort();
    return (
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{todoEvents.length}건</span>
          <Button
            variant={todoShowCompleted ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setTodoShowCompleted(!todoShowCompleted)}
            data-testid="button-todo-show-completed"
          >
            {todoShowCompleted ? "전체" : "미완료"}
          </Button>
        </div>
        {sortedDates.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">할 일이 없습니다</div>
        ) : sortedDates.map(date => (
          <div key={date}>
            <div className={cn("text-xs font-semibold mb-2 px-1", date === todayStr ? "text-primary" : "text-muted-foreground")}>
              {fmtKorean(date)} {date === todayStr && "(오늘)"}
            </div>
            <div className="space-y-1">
              {todoByDate[date].map(evt => {
                const styles = getEventStyles(evt);
                const link = getSourceLink(evt);
                return (
                  <div
                    key={evt.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors hover:bg-muted/50",
                      evt.completed && "opacity-50"
                    )}
                    data-testid={`todo-item-${evt.id}`}
                  >
                    <Checkbox
                      checked={!!evt.completed}
                      onCheckedChange={(checked) => {
                        completeMutation.mutate({ compositeId: evt.id, completed: !!checked });
                      }}
                      data-testid={`checkbox-todo-${evt.id}`}
                    />
                    <div className={cn("w-2 h-2 rounded-full shrink-0", styles.dotClass)} />
                    <div className="flex-1 min-w-0">
                      <div className={cn("text-sm break-words", evt.completed && "line-through")}>{evt.title}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {evt.description && <span className="text-[10px] text-muted-foreground">{evt.description}</span>}
                        {evt.assigneeName && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">{evt.assigneeName}</span>
                        )}
                      </div>
                    </div>
                    {evt.startTime && <span className="text-xs text-muted-foreground shrink-0">{evt.startTime}</span>}
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded shrink-0", styles.badgeClass)}>
                      {CATEGORY_CONFIG[evt.category]?.label}
                    </span>
                    {link && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => navigate(link)} data-testid={`todo-navigate-${evt.id}`}>
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="page-calendar">
      <div className="flex items-center justify-between px-4 py-3 border-b gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md mr-2">
            <Button
              variant={pageMode === "schedule" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 rounded-r-none text-xs"
              onClick={() => setPageMode("schedule")}
              data-testid="button-page-schedule"
            >
              <CalendarIcon className="h-3.5 w-3.5 mr-1" />스케줄
            </Button>
            <Button
              variant={pageMode === "todo" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 rounded-l-none text-xs"
              onClick={() => setPageMode("todo")}
              data-testid="button-page-todo"
            >
              <CheckSquare className="h-3.5 w-3.5 mr-1" />할 일
            </Button>
          </div>

          {pageMode === "schedule" && (
            <>
              <Button variant="outline" size="sm" onClick={goToday} data-testid="button-today">오늘</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev} data-testid="button-prev">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext} data-testid="button-next">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <h2 className="text-lg font-semibold whitespace-nowrap" data-testid="text-calendar-title">{headerTitle}</h2>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex border rounded-md mr-1">
            {AREA_CONFIG.map(area => (
              <Button
                key={area.key}
                variant={areaFilter === area.key ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs rounded-none first:rounded-l-md last:rounded-r-md"
                onClick={() => setAreaFilter(area.key)}
                data-testid={`area-filter-${area.key}`}
              >
                {area.label}
              </Button>
            ))}
          </div>
          {pageMode === "schedule" && (
            <>
              <div className="flex items-center gap-1 mr-2">
                {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    className={cn(
                      "h-7 px-2.5 rounded-md text-xs font-medium transition-colors",
                      filters[key]
                        ? cfg.activeBtn
                        : "bg-transparent text-muted-foreground hover:bg-muted"
                    )}
                    onClick={() => setFilters(f => ({ ...f, [key]: !f[key] }))}
                    data-testid={`filter-${key}`}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>

              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === "month" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-2 rounded-r-none"
                  onClick={() => setViewMode("month")}
                  data-testid="button-view-month"
                >
                  <LayoutGrid className="h-3.5 w-3.5 mr-1" />월
                </Button>
                <Button
                  variant={viewMode === "week" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-2 rounded-none border-x"
                  onClick={() => setViewMode("week")}
                  data-testid="button-view-week"
                >
                  <Columns className="h-3.5 w-3.5 mr-1" />주
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-2 rounded-l-none"
                  onClick={() => setViewMode("list")}
                  data-testid="button-view-list"
                >
                  <List className="h-3.5 w-3.5 mr-1" />목록
                </Button>
              </div>

              <Button size="sm" onClick={() => { setAddForm({ ...addForm, date: fmt(today) }); setShowAddDialog(true); }} data-testid="button-add-event">
                <Plus className="h-4 w-4 mr-1" />일정 추가
              </Button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">불러오는 중...</div>
      ) : pageMode === "todo" ? renderTodoView() : viewMode === "month" ? renderMonthGrid() : viewMode === "week" ? renderWeekGrid() : renderListView()}

      <EventFormDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        title="일정 추가"
        form={addForm}
        setForm={setAddForm}
        onSubmit={() => createMutation.mutate(addForm)}
        isPending={createMutation.isPending}
      />

      {editingEvent && (
        <EventFormDialog
          open={!!editingEvent}
          onClose={() => setEditingEvent(null)}
          title="일정 수정"
          form={{
            title: editingEvent.title,
            date: editingEvent.date,
            endDate: editingEvent.endDate || "",
            startTime: editingEvent.startTime || "",
            endTime: editingEvent.endTime || "",
            description: editingEvent.description || "",
            color: editingEvent.color || "purple",
          }}
          setForm={() => {}}
          isEdit
          editingEvent={editingEvent}
          onSubmit={(data) => updateMutation.mutate({ id: editingEvent.sourceId!, data })}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}

function EventDetail({
  event,
  onNavigate,
  onEdit,
  onDelete,
}: {
  event: CalendarEventItem;
  onNavigate: (path: string) => void;
  onEdit: (e: CalendarEventItem) => void;
  onDelete: (id: string) => void;
}) {
  const styles = getEventStyles(event);
  const cfg = CATEGORY_CONFIG[event.category];
  const link = getSourceLinkStatic(event);
  const isCustom = event.sourceType === "calendarEvent";

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <div className={cn("w-3 h-3 rounded-full mt-0.5 shrink-0", styles.dotClass)} />
        <div className="flex-1 min-w-0">
          <div className={cn("text-sm font-medium break-words", event.completed && "line-through opacity-60")}>{event.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {fmtKorean(event.date)}
            {event.startTime && ` ${event.startTime}`}
            {event.endTime && ` ~ ${event.endTime}`}
          </div>
          {event.description && <div className="text-xs text-muted-foreground mt-1">{event.description}</div>}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded inline-block", styles.badgeClass)}>
              {cfg?.label}
            </span>
            {event.assigneeName && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 inline-block" data-testid="text-event-assignee">
                {event.assigneeName}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 pt-1 border-t">
        {link && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate(link)} data-testid="button-event-navigate">
            <ExternalLink className="h-3 w-3 mr-1" />이동
          </Button>
        )}
        {isCustom && (
          <>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onEdit(event)} data-testid="button-event-edit">
              <Edit className="h-3 w-3 mr-1" />수정
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => onDelete(event.sourceId!)} data-testid="button-event-delete">
              <Trash2 className="h-3 w-3 mr-1" />삭제
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function getSourceLinkStatic(e: CalendarEventItem): string | null {
  if (e.sourceType === "inquiryTask") return `/inquiries?selected=${e.sourceId}`;
  if (e.sourceType === "projectTask" || e.sourceType === "project") return `/projects`;
  if (e.sourceType === "poTask" || e.sourceType === "purchaseOrder") return `/purchase-orders`;
  if (e.sourceType === "financeTask" || e.sourceType === "payment") return `/payment-plan`;
  return null;
}

function EventFormDialog({
  open,
  onClose,
  title,
  form: initialForm,
  setForm: _setForm,
  onSubmit,
  isPending,
  isEdit,
  editingEvent,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  form: { title: string; date: string; endDate: string; startTime: string; endTime: string; description: string; color: string };
  setForm: (f: any) => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
  isEdit?: boolean;
  editingEvent?: CalendarEventItem | null;
}) {
  const [localForm, setLocalForm] = useState(initialForm);

  useEffect(() => {
    if (open) {
      setLocalForm(initialForm);
    }
  }, [open]);

  const updateField = (key: string, value: string) => {
    const updated = { ...localForm, [key]: value };
    setLocalForm(updated);
    if (!isEdit) _setForm(updated);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>제목</Label>
            <Input value={localForm.title} onChange={e => updateField("title", e.target.value)} placeholder="일정 제목" data-testid="input-event-title" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>시작일</Label>
              <Input type="date" value={localForm.date} onChange={e => updateField("date", e.target.value)} data-testid="input-event-date" />
            </div>
            <div>
              <Label>종료일 (선택)</Label>
              <Input type="date" value={localForm.endDate} onChange={e => updateField("endDate", e.target.value)} data-testid="input-event-end-date" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>시작시간 (선택)</Label>
              <Input type="time" value={localForm.startTime} onChange={e => updateField("startTime", e.target.value)} data-testid="input-event-start-time" />
            </div>
            <div>
              <Label>종료시간 (선택)</Label>
              <Input type="time" value={localForm.endTime} onChange={e => updateField("endTime", e.target.value)} data-testid="input-event-end-time" />
            </div>
          </div>
          <div>
            <Label>설명 (선택)</Label>
            <Textarea value={localForm.description} onChange={e => updateField("description", e.target.value)} rows={2} placeholder="메모" data-testid="input-event-description" />
          </div>
          <div>
            <Label>색상</Label>
            <Select value={localForm.color} onValueChange={v => updateField("color", v)}>
              <SelectTrigger data-testid="select-event-color">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="purple">보라</SelectItem>
                <SelectItem value="blue">파랑</SelectItem>
                <SelectItem value="green">초록</SelectItem>
                <SelectItem value="orange">주황</SelectItem>
                <SelectItem value="red">빨강</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={() => onSubmit(localForm)} disabled={isPending || !localForm.title || !localForm.date} data-testid="button-save-event">
            {isPending ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
