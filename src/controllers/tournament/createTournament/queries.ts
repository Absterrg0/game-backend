import Court from "../../../models/Court";

/**
 * Returns all court ids for a given club.
 */
export async function getClubCourtIds(clubId: string): Promise<string[]> {
  const clubCourts = await Court.find({ club: clubId })
    .select("_id")
    .lean()
    .exec();

  return clubCourts.map((court) => court._id.toString());
}
