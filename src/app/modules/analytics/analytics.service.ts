import { JobSource, SalaryCurrency } from "../../../generated/prisma";
import { prisma } from "../../config/prisma";
import { RedisServices, TTL } from "../../config/redis";
import { listableJobsWhere } from "../../utils/jobList";

type AnalyticsRange = "7d" | "30d";

interface ITopSkillSnapshot {
  skill: string;
  count: number;
  trend?: number;
}

interface ITopCompanySnapshot {
  company: string;
  count: number;
  logo?: string | null;
}

interface ITopLocationSnapshot {
  location: string;
  count: number;
}

interface ISalaryStatsSnapshot {
  average: number;
  median: number;
  byRole: { role: string; avg: number }[];
}

const BD_LOCATION_GEO: Record<string, { lat: number; lng: number }> = {
  dhaka: { lat: 23.8103, lng: 90.4125 },
  chattogram: { lat: 22.3569, lng: 91.7832 },
  sylhet: { lat: 24.8949, lng: 91.8687 },
  rajshahi: { lat: 24.3745, lng: 88.6042 },
  khulna: { lat: 22.8456, lng: 89.5403 },
  barishal: { lat: 22.701, lng: 90.3535 },
  rangpur: { lat: 25.7439, lng: 89.2752 },
  mymensingh: { lat: 24.7471, lng: 90.4203 },
  gazipur: { lat: 24.0023, lng: 90.4264 },
  narayanganj: { lat: 23.6238, lng: 90.4997 },
};

const resolveLocationGeo = (location: string) => {
  const lower = location.toLowerCase();
  for (const [key, coords] of Object.entries(BD_LOCATION_GEO)) {
    if (lower.includes(key)) {
      return coords;
    }
  }
  return BD_LOCATION_GEO.dhaka;
};

const sourceKey = (source: JobSource) => source.toLowerCase();

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const wrapAnalytics = async <T>(suffix: string, fn: () => Promise<T>) => {
  const gen = await RedisServices.getCacheGeneration("analytics");
  return RedisServices.wrap(`analytics:v${gen}:${suffix}`, TTL.ANALYTICS, fn);
};

const topSkillsFromSnapshots = (snapshots: { topSkills: unknown }[]) => {
  const counts = new Map<string, number>();
  for (const snap of snapshots) {
    const top = (snap.topSkills as unknown as ITopSkillSnapshot[]) ?? [];
    for (const row of top) {
      counts.set(row.skill, (counts.get(row.skill) ?? 0) + row.count);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([skill]) => skill);
};

const liveTopLocations = async (): Promise<ITopLocationSnapshot[]> => {
  const grouped = await prisma.job.groupBy({
    by: ["location"],
    where: { isActive: true, isBangladesh: true },
    _count: { location: true },
    orderBy: { _count: { location: "desc" } },
    take: 20,
  });
  return grouped.map((row) => ({
    location: row.location,
    count: row._count.location,
  }));
};

const getOverview = async () => {
  const todayStart = startOfDay(new Date());

  const [totalActiveJobs, newJobsToday, snapshot] = await Promise.all([
    prisma.job.count({ where: listableJobsWhere() }),
    prisma.job.count({ where: { scrapedAt: { gte: todayStart } } }),
    wrapAnalytics("overview-snapshot", async () => {
      const monthStart = new Date(todayStart);
      monthStart.setDate(1);

      const [companiesHiringThisMonth, latest, yesterday] = await Promise.all([
        prisma.job
          .groupBy({
            by: ["company"],
            where: { postedAt: { gte: monthStart }, isActive: true },
          })
          .then((rows) => rows.length),
        prisma.analytics.findFirst({ orderBy: { date: "desc" } }),
        prisma.analytics.findFirst({
          where: { date: { lt: todayStart } },
          orderBy: { date: "desc" },
        }),
      ]);

      const salaryStats =
        (latest?.salaryStats as unknown as ISalaryStatsSnapshot | null) ?? {
          average: 0,
          median: 0,
          byRole: [],
        };

      const demandIndex = latest?.demandIndex ?? 0;
      const priorDemand = yesterday?.demandIndex ?? demandIndex;

      return {
        companiesHiringThisMonth,
        averageSalaryBdt: salaryStats.average,
        demandIndex,
        demandTrend: Math.round((demandIndex - priorDemand) * 10) / 10,
      };
    }),
  ]);

  return {
    totalActiveJobs,
    newJobsToday,
    ...snapshot,
  };
};

const getSkillTrends = async (range = "7d", skills: string[] = []) => {
  const normalizedRange: AnalyticsRange = range === "30d" ? "30d" : "7d";
  const target = skills.slice(0, 5);

  return wrapAnalytics(
    `skills:${normalizedRange}:${target.join(",")}`,
    async () => {
      const days = normalizedRange === "30d" ? 30 : 7;
      const since = new Date();
      since.setDate(since.getDate() - days);

      const snapshots = await prisma.analytics.findMany({
        where: { date: { gte: since } },
        orderBy: { date: "asc" },
      });

      const targetSkills =
        target.length > 0
          ? target
          : topSkillsFromSnapshots(snapshots).slice(0, 5);

      return {
        range: normalizedRange,
        series: targetSkills.map((skill) => ({
          skill,
          points: snapshots.map((snap) => {
            const top =
              (snap.topSkills as unknown as ITopSkillSnapshot[]) ?? [];
            const row = top.find((item) => item.skill === skill);
            return {
              date: snap.date.toISOString().slice(0, 10),
              count: row?.count ?? 0,
            };
          }),
        })),
      };
    },
  );
};

const getCompanies = async (limit = 10) => {
  const take = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10;

  return wrapAnalytics(`companies:${take}`, async () => {
    const latest = await prisma.analytics.findFirst({
      orderBy: { date: "desc" },
    });

    if (latest) {
      const top =
        (latest.topCompanies as unknown as ITopCompanySnapshot[]) ?? [];
      return top.slice(0, take).map((row) => ({
        company: row.company,
        logo: row.logo ?? null,
        count: row.count,
      }));
    }

    const grouped = await prisma.job.groupBy({
      by: ["company", "companyLogo"],
      where: { isActive: true },
      _count: { company: true },
      orderBy: { _count: { company: "desc" } },
      take,
    });

    return grouped.map((row) => ({
      company: row.company,
      logo: row.companyLogo,
      count: row._count.company,
    }));
  });
};

const getSalaries = async (currency = "BDT", experience?: number) => {
  const salaryCurrency =
    currency === "USD" ? SalaryCurrency.USD : SalaryCurrency.BDT;

  return wrapAnalytics(
    `salaries:${salaryCurrency}:${experience ?? "all"}`,
    async () => {
      const jobs = await prisma.job.findMany({
        where: {
          isActive: true,
          salaryCurrency,
          ...(experience !== undefined &&
            !Number.isNaN(experience) && {
              OR: [
                { experienceMax: { gte: experience } },
                { experienceMin: { lte: experience } },
              ],
            }),
        },
        select: {
          category: true,
          salaryMin: true,
          salaryMax: true,
        },
      });

      const byRole = new Map<
        string,
        { min: number; max: number; sum: number; count: number }
      >();

      for (const job of jobs) {
        const min = job.salaryMin ?? job.salaryMax;
        const max = job.salaryMax ?? job.salaryMin;
        if (min === null && max === null) {
          continue;
        }
        const lo = min ?? max!;
        const hi = max ?? min!;
        const entry = byRole.get(job.category) ?? {
          min: lo,
          max: hi,
          sum: 0,
          count: 0,
        };
        entry.min = Math.min(entry.min, lo);
        entry.max = Math.max(entry.max, hi);
        entry.sum += (lo + hi) / 2;
        entry.count += 1;
        byRole.set(job.category, entry);
      }

      return [...byRole.entries()].map(([role, stats]) => ({
        role,
        min: stats.min,
        avg: Math.round(stats.sum / stats.count),
        max: stats.max,
        currency: salaryCurrency,
      }));
    },
  );
};

const getLocations = async () => {
  return wrapAnalytics("locations", async () => {
    const latest = await prisma.analytics.findFirst({
      orderBy: { date: "desc" },
    });

    const locations: ITopLocationSnapshot[] = latest
      ? ((latest.topLocations as unknown as ITopLocationSnapshot[]) ?? [])
      : await liveTopLocations();

    return locations.map((loc) => {
      const geo = resolveLocationGeo(loc.location);
      return {
        location: loc.location,
        lat: geo.lat,
        lng: geo.lng,
        count: loc.count,
      };
    });
  });
};

const getTimeline = async (range = "7d") => {
  const normalizedRange: AnalyticsRange = range === "30d" ? "30d" : "7d";

  return wrapAnalytics(`timeline:${normalizedRange}`, async () => {
    const days = normalizedRange === "30d" ? 30 : 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const jobs = await prisma.job.findMany({
      where: { postedAt: { gte: since } },
      select: { postedAt: true, source: true },
    });

    const byDate = new Map<
      string,
      { total: number; bySource: Record<string, number> }
    >();

    for (const job of jobs) {
      const date = job.postedAt.toISOString().slice(0, 10);
      const entry = byDate.get(date) ?? { total: 0, bySource: {} };
      entry.total += 1;
      const key = sourceKey(job.source);
      entry.bySource[key] = (entry.bySource[key] ?? 0) + 1;
      byDate.set(date, entry);
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        total: stats.total,
        bySource: stats.bySource,
      }));
  });
};

const getDemandIndex = async () => {
  return wrapAnalytics("demand-index", async () => {
    const snapshots = await prisma.analytics.findMany({
      orderBy: { date: "desc" },
      take: 14,
    });

    const latest = snapshots[0];
    const current = latest?.demandIndex ?? 0;
    const history = [...snapshots].reverse().map((snap) => ({
      date: snap.date.toISOString().slice(0, 10),
      value: snap.demandIndex,
    }));

    const topSkills =
      (latest?.topSkills as unknown as ITopSkillSnapshot[]) ?? [];
    const priorSkills =
      (snapshots[1]?.topSkills as unknown as ITopSkillSnapshot[]) ?? [];
    const priorMap = new Map(priorSkills.map((row) => [row.skill, row.count]));

    const growthList = topSkills.map((row) => {
      const prev = priorMap.get(row.skill) ?? 0;
      const growth =
        prev > 0
          ? Math.round(((row.count - prev) / prev) * 1000) / 10
          : row.count > 0
            ? 100
            : 0;
      return { skill: row.skill, growth };
    });

    growthList.sort((a, b) => b.growth - a.growth);

    return {
      current,
      history,
      risingSkills: growthList.filter((row) => row.growth > 0).slice(0, 10),
      decliningSkills: [...growthList]
        .filter((row) => row.growth < 0)
        .sort((a, b) => a.growth - b.growth)
        .slice(0, 10),
    };
  });
};

export const AnalyticsServices = {
  getOverview,
  getSkillTrends,
  getCompanies,
  getSalaries,
  getLocations,
  getTimeline,
  getDemandIndex,
};
