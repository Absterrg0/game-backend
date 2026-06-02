import { Types } from "mongoose";
import type { TournamentListDoc } from "../../../../types/api/tournament";
import {
  isTournamentLiveByScheduleWindow,
  isTournamentPastByScheduleWindow,
} from "../mapper";

function makeListDoc(
  overrides: Partial<TournamentListDoc> = {}
): TournamentListDoc {
  return {
    _id: new Types.ObjectId(),
    name: "Test",
    club: null,
    status: "active",
    maxMember: 8,
    participants: [],
    date: new Date("2026-06-02T00:00:00.000Z"),
    startTime: "10:00",
    endTime: "18:00",
    timezone: "Europe/Stockholm",
    ...overrides,
  };
}

describe("tournament list schedule flags", () => {
  it("is live during the scheduled window", () => {
    const tournament = makeListDoc();
    const now = new Date("2026-06-02T14:00:00.000Z");

    expect(isTournamentLiveByScheduleWindow(tournament, now)).toBe(true);
    expect(isTournamentPastByScheduleWindow(tournament, now)).toBe(false);
  });

  it("is past immediately after the scheduled end time on the same day", () => {
    const tournament = makeListDoc({ endTime: "18:00" });
    const now = new Date("2026-06-02T18:00:01.000Z");

    expect(isTournamentLiveByScheduleWindow(tournament, now)).toBe(false);
    expect(isTournamentPastByScheduleWindow(tournament, now)).toBe(true);
  });

  it("is not past before the scheduled start time", () => {
    const tournament = makeListDoc({ startTime: "10:00", endTime: "18:00" });
    const now = new Date("2026-06-02T07:00:00.000Z");

    expect(isTournamentLiveByScheduleWindow(tournament, now)).toBe(false);
    expect(isTournamentPastByScheduleWindow(tournament, now)).toBe(false);
  });

  it("is past when the tournament calendar date has passed without times", () => {
    const tournament = makeListDoc({
      date: new Date("2026-06-01T00:00:00.000Z"),
      startTime: null,
      endTime: null,
    });
    const now = new Date("2026-06-02T12:00:00.000Z");

    expect(isTournamentLiveByScheduleWindow(tournament, now)).toBe(false);
    expect(isTournamentPastByScheduleWindow(tournament, now)).toBe(true);
  });

  it("never marks unscheduled tournaments as past", () => {
    const tournament = makeListDoc({ date: undefined });
    const now = new Date("2026-06-02T18:00:01.000Z");

    expect(isTournamentPastByScheduleWindow(tournament, now)).toBe(false);
  });
});
