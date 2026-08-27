import { Logger } from '../../../utils/logger';
import { configService } from '../../../config/appConfig';
// Primary job-source adapter (RapidAPI).
//
// NOTE: The project's RapidAPI key is subscribed to the "LinkedIn Job Search API"
// (host: linkedin-job-search-api.p.rapidapi.com, endpoint: /active-jb), NOT to the
// classic JSearch /search endpoint (that returns 404 for this key). To keep the
// plan's file name + JobSourceAdapter contract stable, this adapter is still named
// JsearchAdapter but talks to the subscribed LinkedIn API. It shares its schema +
// normalizer with the active-jobs-db adapter (both are "Fantastic Jobs" feeds).
import { JobSource } from '../../../../generated/prisma';
import {
  FetchQuery,
  JobSourceAdapter,
  NormalizedJobInput,
  RawJob,
} from './job-source.adapter';
import {
  FantasticJobsRawJob,
  mapCountryToLocation,
  mapFantasticTimeFrame,
  normalizeFantasticJob,
} from './fantastic-jobs.shared';
import { rapidApiGet } from './rapidapi.util';

const ENDPOINT_PATH = '/active-jb';
const PAGE_SIZE = 10; // results per request (offset steps by this each page)

export class JsearchAdapter implements JobSourceAdapter {
  // Adapter-level source used for FetchLog rows (the data feed is LinkedIn).
  readonly source = JobSource.LINKEDIN;

  private readonly logger = new Logger(JsearchAdapter.name);

  private readonly configService = configService;

  /** Fetches developer jobs across the configured number of pages. */
  async fetchJobs(_query: FetchQuery): Promise<RawJob[]> {
    const jsearch = this.configService.get('jsearch', { infer: true });
    const allJobs: RawJob[] = [];

    for (let page = 1; page <= jsearch.pages; page += 1) {
      const data = await rapidApiGet<FantasticJobsRawJob[]>({
        host: jsearch.apiHost,
        path: ENDPOINT_PATH,
        apiKey: jsearch.apiKey,
        params: {
          title: jsearch.query,
          location: mapCountryToLocation(jsearch.country),
          time_frame: mapFantasticTimeFrame(jsearch.datePosted),
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        },
        logger: this.logger,
      });

      const jobs = Array.isArray(data) ? data : [];
      allJobs.push(...(jobs as unknown as RawJob[]));

      // Fewer than a full page means we've reached the end — stop early.
      if (jobs.length < PAGE_SIZE) {
        break;
      }
    }

    this.logger.log(`LinkedIn API fetched ${allJobs.length} raw jobs`);
    return allJobs;
  }

  /** Maps one raw LinkedIn job into our normalized Job shape + dedup fingerprint. */
  normalize(raw: RawJob): NormalizedJobInput {
    return normalizeFantasticJob(raw);
  }
}
