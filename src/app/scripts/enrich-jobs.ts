import { connectDB, disconnectDB } from "../config/prisma";
import { RedisServices } from "../config/redis";
import { prisma } from "../config/prisma";
import { JobEnrichmentServices } from "../modules/ingestion/jobEnrichment.service";
import {
  MIN_DESCRIPTION_FOR_EXTRACT,
  shouldEnrichSkills,
} from "../utils/descriptionExtract";

const main = async () => {
  await connectDB();
  try {
    const candidates = await prisma.job.findMany({
      where: { description: { not: "" } },
      select: {
        id: true,
        title: true,
        description: true,
        skills: true,
        benefits: true,
        category: true,
      },
    });

    let updated = 0;
    let skipped = 0;

    for (const job of candidates) {
      const needsSkills = shouldEnrichSkills(job.skills.length);
      const needsBenefits = job.benefits.length === 0;
      const descOk = job.description.trim().length >= MIN_DESCRIPTION_FOR_EXTRACT;

      if (!descOk || (!needsSkills && !needsBenefits)) {
        skipped += 1;
        continue;
      }

      const enriched = await JobEnrichmentServices.enrichFields({
        title: job.title,
        description: job.description,
        skills: job.skills,
        benefits: job.benefits,
        category: job.category,
      });

      const skillsChanged =
        enriched.skills.length > job.skills.length ||
        enriched.skills.some((skill, index) => skill !== job.skills[index]);
      const benefitsChanged =
        job.benefits.length === 0 && enriched.benefits.length > 0;
      const categoryChanged = enriched.category !== job.category;

      if (!skillsChanged && !benefitsChanged && !categoryChanged) {
        skipped += 1;
        continue;
      }

      await prisma.job.update({
        where: { id: job.id },
        data: {
          skills: enriched.skills,
          ...(benefitsChanged ? { benefits: enriched.benefits } : {}),
          ...(categoryChanged ? { category: enriched.category } : {}),
        },
      });
      updated += 1;
    }

    if (updated > 0) {
      await RedisServices.invalidateCache("jobs");
    }

    process.stdout.write(
      `Enrichment backfill complete: updated=${updated} skipped=${skipped} scanned=${candidates.length}\n`,
    );
  } finally {
    await disconnectDB();
    await RedisServices.quit();
  }
};

void main().catch((err: unknown) => {
  process.stderr.write(`Enrichment backfill failed: ${String(err)}\n`);
  process.exit(1);
});
