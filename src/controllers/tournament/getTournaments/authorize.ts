
import Club from "../../../models/Club";
import { type AuthenticatedSession } from "../../../shared/authContext";
import { hasRoleOrAbove } from "../../../constants/roles";
import { ROLES } from "../../../constants/roles";
import { ok } from "../../../shared/helpers";

export type ListFilterContext = {
  isOrganiserOrAbove: boolean;
  isSuperAdmin: boolean;
  requesterUserId: string;
  manageableClubIds: string[];
  homeClubCoordinates: [number, number] | null;
  /** Favourite club ids for this user (empty if none). */
  favoriteClubIds: string[];
};

/**
 * Builds the authorization context for listing tournaments.
 * Returns manageable club IDs for organisers (empty for players/super-admin uses global scope).
 */
export async function authorizeList(session?: AuthenticatedSession) {
  if (!session) {
    const filterContext: ListFilterContext = {
      isOrganiserOrAbove: false,
      isSuperAdmin: false,
      requesterUserId: "",
      manageableClubIds: [],
      homeClubCoordinates: null,
      favoriteClubIds: [],
    };
    return ok({ filterContext }, { status: 200, message: "Authorized" });
  }

  const isOrganiserOrAbove = hasRoleOrAbove(session.role, ROLES.ORGANISER);
  const isSuperAdmin = session.role === ROLES.SUPER_ADMIN;

  // The auth middleware already loaded homeClub/favoriteClubs onto the session,
  // so we only hit the DB for what it cannot know: organiser club membership
  // and the home club's coordinates. Both run in parallel.
  const [organiserClubs, homeClub] = await Promise.all([
    isOrganiserOrAbove && !isSuperAdmin
      ? Club.find({ organiserIds: session._id, status: "active" })
          .select("_id")
          .lean()
          .exec()
      : Promise.resolve([]),
    session.homeClub
      ? Club.findById(session.homeClub)
          .select("coordinates")
          .lean<{ coordinates?: { coordinates?: [number, number] } }>()
          .exec()
      : Promise.resolve(null),
  ]);

  let manageableClubIds: string[] = [];
  if (isOrganiserOrAbove && !isSuperAdmin) {
    const adminClubs = (session.adminOf ?? []).map((id) => id.toString());
    const organiserClubIds = organiserClubs.map((c) => c._id.toString());
    manageableClubIds = Array.from(new Set([...adminClubs, ...organiserClubIds]));
  }

  const favoriteClubIds = (session.favoriteClubs ?? []).map((id) => id.toString());

  const coords = homeClub?.coordinates?.coordinates;
  const homeClubCoordinates: [number, number] | null = coords
    ? [coords[0], coords[1]]
    : null;

  const filterContext: ListFilterContext = {
    isOrganiserOrAbove,
    isSuperAdmin,
    requesterUserId: session._id.toString(),
    manageableClubIds,
    homeClubCoordinates,
    favoriteClubIds,
  };

  return ok({ filterContext }, { status: 200, message: "Authorized" });
}
