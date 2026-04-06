import Club from "../../../models/Club";

export enum TournamentDistanceBand {
  Under50 = "under50",
  Between50And80 = "between50And80",
  Over80 = "over80",
}

const METERS_IN_KM = 1000;
const UNDER_50_KM_MAX = 50 * METERS_IN_KM;
const BETWEEN_50_AND_80_KM_MIN = 50 * METERS_IN_KM;
const BETWEEN_50_AND_80_KM_MAX = 80 * METERS_IN_KM;
const OVER_80_KM_MIN = 80 * METERS_IN_KM;

function getDistanceBounds(distance: TournamentDistanceBand) {
  if (distance === TournamentDistanceBand.Under50) {
    return { minDistance: 0, maxDistance: UNDER_50_KM_MAX };
  }

  if (distance === TournamentDistanceBand.Between50And80) {
    return {
      minDistance: BETWEEN_50_AND_80_KM_MIN,
      maxDistance: BETWEEN_50_AND_80_KM_MAX,
    };
  }

  return { minDistance: OVER_80_KM_MIN };
}

export async function findClubIdsForDistanceBand(
  homeClubCoordinates: [number, number],
  distance: TournamentDistanceBand
) {
  const bounds = getDistanceBounds(distance);

  const nearSphere: {
    $geometry: {
      type: "Point";
      coordinates: [number, number];
    };
    $minDistance?: number;
    $maxDistance?: number;
  } = {
    $geometry: {
      type: "Point",
      coordinates: homeClubCoordinates,
    },
  };

  if (bounds.minDistance != null) nearSphere.$minDistance = bounds.minDistance;
  if (bounds.maxDistance != null) nearSphere.$maxDistance = bounds.maxDistance;

  const clubs = await Club.find({
    status: "active",
    coordinates: {
      $nearSphere: nearSphere,
    },
  })
    .select("_id")
    .lean()
    .exec();

  return clubs.map((club) => club._id.toString());
}
