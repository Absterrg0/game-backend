import Club from "../../../models/Club";

type DistanceBand = "under50" | "between50And80" | "over80";

const METERS_IN_KM = 1000;
const UNDER_50_KM_MAX = 50 * METERS_IN_KM;
const BETWEEN_50_AND_80_KM_MIN = 50 * METERS_IN_KM;
const BETWEEN_50_AND_80_KM_MAX = 80 * METERS_IN_KM;
const OVER_80_KM_MIN = 80 * METERS_IN_KM;

const DISTANCE_BOUNDS: Record<
  DistanceBand,
  { minDistance?: number; maxDistance?: number }
> = {
  under50: { minDistance: 0, maxDistance: UNDER_50_KM_MAX },
  between50And80: {
    minDistance: BETWEEN_50_AND_80_KM_MIN,
    maxDistance: BETWEEN_50_AND_80_KM_MAX,
  },
  over80: { minDistance: OVER_80_KM_MIN },
};

function getDistanceBounds(distance: DistanceBand) {
  return DISTANCE_BOUNDS[distance];
}

export async function findClubIdsForDistanceBand(
  homeClubCoordinates: [number, number],
  distance: DistanceBand
) {
  const bounds = getDistanceBounds(distance);

  const nearSphere = {
    $geometry: {
      type: "Point" as const,
      coordinates: homeClubCoordinates,
    },
    ...(bounds.minDistance != null && { $minDistance: bounds.minDistance }),
    ...(bounds.maxDistance != null && { $maxDistance: bounds.maxDistance }),
  }

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
