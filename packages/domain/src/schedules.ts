import { Temporal } from "@js-temporal/polyfill";
import { DomainInvariantError } from "./errors.js";

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface ScheduleRule {
  readonly firstCycleStart: string;
  readonly frequency: Frequency;
  readonly interval: number;
  readonly participantCount: number;
  readonly deadlineOffsetMinutes: number;
  readonly timeZone: string;
}

export interface CycleSchedule {
  readonly cycleNumber: number;
  readonly deadlineAt: Date;
  readonly opensAt: Date;
  readonly recipientPosition: number;
}

export type ChargePreference =
  | {
      readonly kind: "DAILY";
      readonly hour: number;
      readonly minute: number;
    }
  | {
      readonly kind: "WEEKLY";
      readonly weekday: number;
      readonly hour: number;
      readonly minute: number;
    }
  | {
      readonly kind: "MONTHLY";
      readonly ordinal: 1 | 2 | 3 | 4 | "last";
      readonly weekday: number;
      readonly hour: number;
      readonly minute: number;
    }
  | {
      readonly kind: "YEARLY";
      readonly month: number;
      readonly day: number;
      readonly hour: number;
      readonly minute: number;
    };

const validateScheduleRule = (rule: ScheduleRule): void => {
  if (!Number.isSafeInteger(rule.interval) || rule.interval < 1) {
    throw new DomainInvariantError(
      "SCHEDULE_INTERVAL_INVALID",
      "Schedule interval must be a positive safe integer.",
    );
  }
  if (
    !Number.isSafeInteger(rule.participantCount) ||
    rule.participantCount < 2
  ) {
    throw new DomainInvariantError(
      "SCHEDULE_PARTICIPANTS_INVALID",
      "A Collage requires at least two participants.",
    );
  }
  if (
    !Number.isSafeInteger(rule.deadlineOffsetMinutes) ||
    rule.deadlineOffsetMinutes <= 0
  ) {
    throw new DomainInvariantError(
      "SCHEDULE_DEADLINE_INVALID",
      "Deadline offset must be a positive number of minutes.",
    );
  }
};

const addFrequency = (
  value: Temporal.ZonedDateTime,
  frequency: Frequency,
  interval: number,
): Temporal.ZonedDateTime => {
  switch (frequency) {
    case "DAILY":
      return value.add({ days: interval });
    case "WEEKLY":
      return value.add({ weeks: interval });
    case "MONTHLY":
      return value.add({ months: interval }, { overflow: "constrain" });
    case "YEARLY":
      return value.add({ years: interval }, { overflow: "constrain" });
  }
};

const toDate = (value: Temporal.ZonedDateTime): Date =>
  new Date(value.epochMilliseconds);

export const calculateCycleSchedule = (
  rule: ScheduleRule,
): readonly CycleSchedule[] => {
  validateScheduleRule(rule);
  const first = Temporal.Instant.from(rule.firstCycleStart).toZonedDateTimeISO(
    rule.timeZone,
  );

  return Array.from({ length: rule.participantCount }, (_, index) => {
    const cycleNumber = index + 1;
    const opensAt =
      index === 0
        ? first
        : addFrequency(first, rule.frequency, rule.interval * index);
    const deadlineAt = opensAt.add({
      minutes: rule.deadlineOffsetMinutes,
    });
    return {
      cycleNumber,
      opensAt: toDate(opensAt),
      deadlineAt: toDate(deadlineAt),
      recipientPosition: cycleNumber,
    };
  });
};

const validateTime = (hour: number, minute: number): void => {
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    throw new DomainInvariantError(
      "CHARGE_TIME_INVALID",
      "Charge time must be a valid local hour and minute.",
    );
  }
};

const weekdayCandidate = (
  base: Temporal.ZonedDateTime,
  weekday: number,
  hour: number,
  minute: number,
): Temporal.ZonedDateTime => {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw new DomainInvariantError(
      "CHARGE_WEEKDAY_INVALID",
      "Weekday must be between 1 (Monday) and 7 (Sunday).",
    );
  }
  const daysAhead = (weekday - base.dayOfWeek + 7) % 7;
  return base
    .add({ days: daysAhead })
    .with({ hour, minute, second: 0, millisecond: 0 });
};

const monthlyCandidate = (
  base: Temporal.ZonedDateTime,
  preference: Extract<ChargePreference, { kind: "MONTHLY" }>,
): Temporal.ZonedDateTime => {
  const first = base.with({
    day: 1,
    hour: preference.hour,
    minute: preference.minute,
    second: 0,
    millisecond: 0,
  });
  if (preference.ordinal === "last") {
    const last = first.with({ day: first.daysInMonth });
    return last.subtract({
      days: (last.dayOfWeek - preference.weekday + 7) % 7,
    });
  }
  const firstOccurrence = weekdayCandidate(
    first,
    preference.weekday,
    preference.hour,
    preference.minute,
  );
  return firstOccurrence.add({ weeks: preference.ordinal - 1 });
};

export const calculateMemberChargeAt = (
  cycle: Pick<CycleSchedule, "opensAt" | "deadlineAt">,
  timeZone: string,
  preference: ChargePreference,
): Date => {
  const opens = Temporal.Instant.from(
    cycle.opensAt.toISOString(),
  ).toZonedDateTimeISO(timeZone);
  validateTime(preference.hour, preference.minute);

  let candidate: Temporal.ZonedDateTime;
  switch (preference.kind) {
    case "DAILY":
      candidate = opens.with({
        hour: preference.hour,
        minute: preference.minute,
        second: 0,
        millisecond: 0,
      });
      break;
    case "WEEKLY":
      candidate = weekdayCandidate(
        opens,
        preference.weekday,
        preference.hour,
        preference.minute,
      );
      break;
    case "MONTHLY":
      candidate = monthlyCandidate(opens, preference);
      break;
    case "YEARLY":
      candidate = opens.with(
        {
          month: preference.month,
          day: preference.day,
          hour: preference.hour,
          minute: preference.minute,
          second: 0,
          millisecond: 0,
        },
        { overflow: "constrain" },
      );
      break;
  }

  if (toDate(candidate) < cycle.opensAt) {
    switch (preference.kind) {
      case "DAILY":
        candidate = candidate.add({ days: 1 });
        break;
      case "WEEKLY":
        candidate = candidate.add({ weeks: 1 });
        break;
      case "MONTHLY":
        candidate = monthlyCandidate(opens.add({ months: 1 }), preference);
        break;
      case "YEARLY":
        candidate = candidate.add({ years: 1 });
        break;
    }
  }
  const result = toDate(candidate);
  if (result > cycle.deadlineAt) {
    return new Date(cycle.opensAt);
  }
  if (result < cycle.opensAt) {
    throw new DomainInvariantError(
      "CHARGE_OUTSIDE_CYCLE",
      "Preferred charge time must fall inside the cycle window.",
    );
  }
  return result;
};
