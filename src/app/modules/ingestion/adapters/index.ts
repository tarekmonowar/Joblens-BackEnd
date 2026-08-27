import { JobicyAdapter } from "./jobicy.adapter";
import { IndeedAdapter } from "./indeed.adapter";
import { JsearchAdapter } from "./jsearch.adapter";
import { JsearchApiAdapter } from "./jsearch-api.adapter";
import { ActiveJobsDbAdapter } from "./active-jobs-db.adapter";
import { RemoteJobsAdapter } from "./remote-jobs.adapter";
import { GlassdoorAdapter } from "./glassdoor.adapter";
import { JobSourceAdapter } from "./job-source.adapter";

export const jobSourceAdapters: JobSourceAdapter[] = [
  new JsearchAdapter(),
  new ActiveJobsDbAdapter(),
  new JobicyAdapter(),
  new IndeedAdapter(),
  new RemoteJobsAdapter(),
  new GlassdoorAdapter(),
  new JsearchApiAdapter(),
];
