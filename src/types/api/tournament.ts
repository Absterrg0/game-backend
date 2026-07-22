import mongoose from "mongoose";
import type { SchedulePopulatedLean } from "../domain/tournamentSchedule";
import {
  TOURNAMENT_MODES,
  TOURNAMENT_PLAY_MODES,
  type TournamentStatus,
} from "../domain/tournament";
import type { ITournament } from "../../models/Tournament";

export interface PopulatedCourt {
  _id: mongoose.Types.ObjectId;
  name?: string;
  type?: string;
  placement?: string;
}

export interface PopulatedClub {
	_id: mongoose.Types.ObjectId;
	name: string;
  address?: string | null;
  logoUrl?: string | null;
  courts?: PopulatedCourt[];
}

export interface PopulatedSponsor {
	_id: mongoose.Types.ObjectId;
	name: string;
	logoUrl?: string | null;
	link?: string | null;
}

export interface TournamentListDoc {
	_id: mongoose.Types.ObjectId;
	name: string;
	logoUrl?: string | null;
	club: PopulatedClub | null;
	date?: Date;
  startTime?: string | null;
  endTime?: string | null;
	timezone?: string | null;
	status: TournamentStatus;
	sponsor?: PopulatedSponsor | null;
  maxMember: number;
  /** Computed in the list projection ($size of participants). */
  participantCount: number;
}

export interface TournamentForUpdateAuth {
  _id?: mongoose.Types.ObjectId;
  club: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  status: TournamentStatus;
  sponsor?: mongoose.Types.ObjectId | null;
  name?: string;
  minMember?: number;
  maxMember?: number;
  totalRounds?: number;
  participants?: mongoose.Types.ObjectId[];
  participantCount?: number;
  date?: Date | null;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  playMode?: (typeof TOURNAMENT_PLAY_MODES)[number];
  tournamentMode?: (typeof TOURNAMENT_MODES)[number];
  entryFee?: number;
  duration?: number | null;
  breakDuration?: number | null;
  foodInfo?: string | null;
  descriptionInfo?: string | null;
}

export type TournamentPopulated = Omit<
	ITournament,
  'club' | 'sponsor' | 'participants' | 'schedule'
> & {
  club?: {
    _id: mongoose.Types.ObjectId;
    name?: string;
    address?: string | null;
    logoUrl?: string | null;
    courts?: PopulatedCourt[];
  } | null;
	sponsor?: {
		_id: mongoose.Types.ObjectId;
		name?: string;
		logoUrl?: string | null;
		link?: string | null;
	} | null;
	participants?: Array<{
		_id: mongoose.Types.ObjectId;
		name?: string | null;
		alias?: string | null;
		profilePictureUrl?: string | null;
	}>;
  /** Set when `schedule` is populated (lean); `null` if ref is broken; omit if no ref. */
  schedule?: SchedulePopulatedLean | null;
};
