import { schedulesOverlap, timeToMinutes } from "@/lib/timetable/conflicts";

import type { DiscoveryWeekday, TimeRules } from "@/lib/assistant/discovery/schema";

export type Meeting = { day: DiscoveryWeekday | "SUN"; start: string; end: string };

export type RuleOutcome = {
  rule: "startAfter" | "endBefore" | "avoidDays" | "avoidWindows" | "fewerDays";
  label: string;
  status: "met" | "violated" | "unknown";
};

function meetingTimeRange(meeting: Meeting) {
  return { date: meeting.day, time: `${meeting.start}-${meeting.end}` };
}

function ruleStatus(
  meetings: Meeting[],
  meetingsComplete: boolean,
  violates: (meeting: Meeting) => boolean,
): "met" | "violated" | "unknown" {
  if (meetings.some(violates)) return "violated";
  if (!meetingsComplete || meetings.length === 0) return "unknown";
  return "met";
}

function startAfterOutcome(
  meetings: Meeting[],
  meetingsComplete: boolean,
  startAfter: string,
): RuleOutcome {
  const threshold = timeToMinutes(startAfter);
  return {
    rule: "startAfter",
    label: `starts at or after ${startAfter}`,
    status: ruleStatus(meetings, meetingsComplete, (m) => timeToMinutes(m.start) < threshold),
  };
}

function endBeforeOutcome(
  meetings: Meeting[],
  meetingsComplete: boolean,
  endBefore: string,
): RuleOutcome {
  const threshold = timeToMinutes(endBefore);
  return {
    rule: "endBefore",
    label: `ends at or before ${endBefore}`,
    status: ruleStatus(meetings, meetingsComplete, (m) => timeToMinutes(m.end) > threshold),
  };
}

function avoidDaysOutcome(
  meetings: Meeting[],
  meetingsComplete: boolean,
  avoidDays: DiscoveryWeekday[],
): RuleOutcome {
  const avoided = new Set(avoidDays);
  const hit = avoidDays.find((day) => meetings.some((m) => m.day === day));
  const label =
    avoidDays.length === 1 ? `no ${avoidDays[0]}` : `no ${avoidDays.join(", ")}`;
  let status: RuleOutcome["status"];
  if (hit) {
    status = "violated";
  } else if (!meetingsComplete || meetings.length === 0) {
    status = "unknown";
  } else {
    status = "met";
  }
  return { rule: "avoidDays", label: hit ? `no ${hit}` : label, status };
}

function avoidWindowOutcome(
  meetings: Meeting[],
  meetingsComplete: boolean,
  window: { start: string; end: string; days?: DiscoveryWeekday[] },
): RuleOutcome {
  const windowDays = window.days ? new Set(window.days) : null;
  const windowSchedule = { date: "MON", time: `${window.start}-${window.end}` };

  const violates = (meeting: Meeting) => {
    if (windowDays && !windowDays.has(meeting.day as DiscoveryWeekday)) return false;
    return schedulesOverlap(meetingTimeRange(meeting), {
      date: meeting.day,
      time: windowSchedule.time,
    });
  };

  const label =
    window.days && window.days.length > 0
      ? `avoid ${window.start}-${window.end} on ${window.days.join(", ")}`
      : `avoid ${window.start}-${window.end}`;

  return {
    rule: "avoidWindows",
    label,
    status: ruleStatus(meetings, meetingsComplete, violates),
  };
}

function fewerDaysOutcome(meetings: Meeting[], meetingsComplete: boolean): RuleOutcome {
  const distinctDays = new Set(meetings.map((m) => m.day));
  let status: RuleOutcome["status"];
  if (distinctDays.size > 2) {
    status = "violated";
  } else if (!meetingsComplete || meetings.length === 0) {
    status = "unknown";
  } else {
    status = "met";
  }
  return { rule: "fewerDays", label: "fewer class days", status };
}

export function evaluateTimeRules(
  meetings: Meeting[],
  meetingsComplete: boolean,
  rules: TimeRules | undefined,
  fewerDays?: boolean,
): RuleOutcome[] {
  const outcomes: RuleOutcome[] = [];
  if (rules?.startAfter) {
    outcomes.push(startAfterOutcome(meetings, meetingsComplete, rules.startAfter));
  }
  if (rules?.endBefore) {
    outcomes.push(endBeforeOutcome(meetings, meetingsComplete, rules.endBefore));
  }
  if (rules?.avoidDays?.length) {
    outcomes.push(avoidDaysOutcome(meetings, meetingsComplete, rules.avoidDays));
  }
  for (const window of rules?.avoidWindows ?? []) {
    outcomes.push(avoidWindowOutcome(meetings, meetingsComplete, window));
  }
  if (fewerDays) {
    outcomes.push(fewerDaysOutcome(meetings, meetingsComplete));
  }
  return outcomes;
}
