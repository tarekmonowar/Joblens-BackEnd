const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const srcAdapters = path.join(root, "backend", "src", "ingestion", "adapters");
const destAdapters = path.join(
  root,
  "ExpressBackend",
  "src",
  "app",
  "modules",
  "ingestion",
  "adapters",
);

fs.mkdirSync(destAdapters, { recursive: true });

const rewrite = (text, kind) => {
  let t = text;
  t = t.replace(/import \{ Injectable, Logger \} from '@nestjs\/common';\r?\n/g, "");
  t = t.replace(/import \{ Logger \} from '@nestjs\/common';\r?\n/g, "");
  t = t.replace(/import \{ Injectable \} from '@nestjs\/common';\r?\n/g, "");
  t = t.replace(/import \{ ConfigService \} from '@nestjs\/config';\r?\n/g, "");
  t = t.replace(/import \{ AppConfig \} from '@\/config\/configuration';\r?\n/g, "");
  t = t.replace(/@Injectable\(\)\r?\n/g, "");

  if (kind === "adapter") {
    t = t.replace(
      /from '@\/generated\/prisma'/g,
      "from '../../../../generated/prisma'",
    );
    t = t.replace(/from '@\/ingestion\/adapters\//g, "from './");
    t = t.replace(
      /from '@\/common\/constants\/job-list.constants'/g,
      "from '../../../utils/jobList'",
    );
    t = t.replace(
      /from '@\/common\/utils\/normalize.util'/g,
      "from '../../../utils/normalize'",
    );
    t = t.replace(
      /from '@\/common\/utils\/fingerprint.util'/g,
      "from '../../../utils/fingerprint'",
    );
    t = t.replace(
      /from '@\/common\/utils\/description-extract.util'/g,
      "from '../../../utils/descriptionExtract'",
    );

    if (t.includes("configService") || t.includes("Logger")) {
      const imports = [];
      if (t.includes("Logger") && !t.includes("from '../../../utils/logger'")) {
        imports.push("import { Logger } from '../../../utils/logger';");
      }
      if (
        t.includes("configService") &&
        !t.includes("from '../../../config/appConfig'")
      ) {
        imports.push(
          "import { configService } from '../../../config/appConfig';",
        );
      }
      if (imports.length) {
        t = `${imports.join("\n")}\n${t}`;
      }
    }

    t = t.replace(
      /constructor\(private readonly configService: ConfigService<AppConfig, true>\) \{\s*\}/g,
      "private readonly configService = configService;",
    );
    t = t.replace(
      /constructor\(private readonly configService: ConfigService<AppConfig, true>\) \{\}/g,
      "private readonly configService = configService;",
    );
  }

  if (kind === "util") {
    t = t.replace(
      /from '@\/common\/utils\/normalize.util'/g,
      "from './normalize'",
    );
  }

  return t;
};

for (const file of fs.readdirSync(srcAdapters)) {
  if (!file.endsWith(".ts")) continue;
  const src = fs.readFileSync(path.join(srcAdapters, file), "utf8");
  fs.writeFileSync(path.join(destAdapters, file), rewrite(src, "adapter"));
  console.log("adapter", file);
}

const descSrc = path.join(
  root,
  "backend",
  "src",
  "common",
  "utils",
  "description-extract.util.ts",
);
const descDest = path.join(
  root,
  "ExpressBackend",
  "src",
  "app",
  "utils",
  "descriptionExtract.ts",
);
fs.writeFileSync(
  descDest,
  rewrite(fs.readFileSync(descSrc, "utf8"), "util"),
);
console.log("descriptionExtract.ts");
