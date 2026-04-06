
import Club from "../../../models/Club";
import User from "../../../models/User";
import { type AuthenticatedSession } from "../../../shared/authContext";
import { hasRoleOrAbove } from "../../../constants/roles";
import { ROLES } from "../../../constants/roles";
import { ok } from "../../../shared/helpers";

export type ListFilterContext = {
  isOrganiserOrAbove: boolean;
  isSuperAdmin: boolean;
  manageableClubIds: string[];
  homeClubCoordinates: [number, number] | null;
};

/**
 * Builds the authorization context for listing tournaments.
 * Returns manageable club IDs for organisers (empty for players/super-admin uses global scope).
 */
export async function authorizeList(
  session: AuthenticatedSession
){
  const isOrganiserOrAbove = hasRoleOrAbove(session.role, ROLES.ORGANISER);
  const isSuperAdmin = session.role === ROLES.SUPER_ADMIN;

  let manageableClubIds: string[] = [];
  if (isOrganiserOrAbove && !isSuperAdmin) {
    const adminClubs = (session.adminOf ?? []).map((id) => id.toString());
    const organiserClubs = await Club.find({
      organiserIds: session._id,
      status: "active",
    }).select("_id").lean().exec();
    const organiserClubIds = organiserClubs.map((c) => c._id.toString());
    manageableClubIds = Array.from(new Set([...adminClubs, ...organiserClubIds]));
  }

  let homeClubCoordinates: [number, number] | null = null;
  const user = await User.findById(session._id)
    .populate({ path: "homeClub", select: "coordinates" })
    .select("homeClub")
    .lean()
    .exec();
  if (user?.homeClub) {
    const homeClub = user.homeClub as
      | { coordinates?: { coordinates?: [number, number] } }
      | null;
    const coords = homeClub?.coordinates?.coordinates;
    if (
      Array.isArray(coords) &&
      coords.length === 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      homeClubCoordinates = [coords[0], coords[1]];
    }
  }

  const filterContext: ListFilterContext = {
    isOrganiserOrAbove,
    isSuperAdmin,
    manageableClubIds,
    homeClubCoordinates,
  };

  return ok({ filterContext }, { status: 200, message: "Authorized" });
}
