import "dotenv/config";
import { connectToDatabase } from "../src/lib/db";
import Club from "../src/models/Club";
import Tournament from "../src/models/Tournament";
import { LogError, LogInfo, LogWarning } from "../src/lib/logger";

const SCRIPT_PATH = "scripts/backfill-tournament-createdBy";

/**
 * Sets `createdBy` on tournaments that are missing it, using the club's
 * defaultAdminId or first organiserIds entry. Run once against each environment
 * before making `createdBy` required on the Tournament schema.
 */
async function main() {
  await connectToDatabase();

  const cursor = Tournament.find({
    $or: [{ createdBy: { $exists: false } }, { createdBy: null }],
  })
    .select("_id club")
    .cursor();

  let updated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    const club = await Club.findById(doc.club)
      .select("defaultAdminId organiserIds")
      .lean()
      .exec();

    const candidate =
      club?.defaultAdminId ?? club?.organiserIds?.[0] ?? null;

    if (!candidate) {
      LogWarning(
        SCRIPT_PATH,
        `Skip tournament ${doc._id}: club ${doc.club} has no defaultAdminId or organiserIds`
      );
      skipped += 1;
      continue;
    }

    await Tournament.updateOne(
      { _id: doc._id },
      { $set: { createdBy: candidate } }
    ).exec();
    updated += 1;
  }

  LogInfo(
    SCRIPT_PATH,
    `Done. Updated ${updated} tournament(s), skipped ${skipped}.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    LogError(SCRIPT_PATH, "script", "backfill-tournament-createdBy", err);
    process.exit(1);
  });
