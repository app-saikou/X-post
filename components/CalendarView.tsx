"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { DateClickArg } from "@fullcalendar/interaction";
import { EventClickArg, EventDropArg, EventInput } from "@fullcalendar/core";
import { useRef } from "react";
import { CalendarEvent, PostStatus } from "@/lib/types";

interface CalendarViewProps {
  events: CalendarEvent[];
  onDateClick: (date: string) => void;
  onEventClick: (event: CalendarEvent) => void;
  onEventDrop: (eventId: string, newStart: string) => void;
}

const STATUS_COLORS: Record<PostStatus, string> = {
  pending: "#3b82f6",   // blue
  posted: "#6b7280",    // gray
  failed: "#ef4444",    // red
};

export default function CalendarView({
  events,
  onDateClick,
  onEventClick,
  onEventDrop,
}: CalendarViewProps) {
  const calendarRef = useRef<FullCalendar>(null);

  const fcEvents: EventInput[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start,
    backgroundColor: STATUS_COLORS[e.status],
    borderColor: STATUS_COLORS[e.status],
    textColor: "#ffffff",
    extendedProps: { calendarEvent: e },
  }));

  const handleDateClick = (arg: DateClickArg) => {
    onDateClick(arg.date.toISOString());
  };

  const handleEventClick = (arg: EventClickArg) => {
    const ce = arg.event.extendedProps.calendarEvent as CalendarEvent;
    onEventClick(ce);
  };

  const handleEventDrop = (arg: EventDropArg) => {
    if (!arg.event.start) return;
    onEventDrop(arg.event.id, arg.event.start.toISOString());
  };

  return (
    <div className="fc-dark">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale="ja"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek",
        }}
        events={fcEvents}
        editable={true}
        droppable={true}
        dateClick={handleDateClick}
        eventClick={handleEventClick}
        eventDrop={handleEventDrop}
        height="auto"
        eventDisplay="block"
        dayMaxEvents={3}
        buttonText={{
          today: "今日",
          month: "月",
          week: "週",
        }}
      />
    </div>
  );
}
