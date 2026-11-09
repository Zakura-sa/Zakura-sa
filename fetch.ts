import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "data");
const STATS_PATH = join(DATA, "stats.json");
const LOGIN = "Zakura-sa";

// 读取已有脱敏数据作为兜底基线（防止 Token 权限回退时丢失历史统计）
const prevDayCounts = new Map<string, number>();
const prevLangTotals = new Map<string, number>();
if (existsSync(STATS_PATH)) {
  try {
    const prev = JSON.parse(readFileSync(STATS_PATH, "utf8")).data?.user;
    for (const w of prev?.contributionsCollection?.contributionCalendar?.weeks ?? []) {
      for (const d of w.contributionDays ?? []) {
        if (d.contributionCount > 0) prevDayCounts.set(d.date, d.contributionCount);
      }
    }
    for (const r of prev?.repositories?.nodes ?? []) {
      for (const e of r.languages?.edges ?? []) {
        prevLangTotals.set(e.node.name, Math.max(prevLangTotals.get(e.node.name) ?? 0, e.size));
      }
    }
  } catch {}
}

const viewerQuery = `query {
  viewer {
    login
    repositories(first: 60, ownerAffiliations: OWNER) {
      nodes {
        name
        isFork
        isPrivate
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name } }
        }
        defaultBranchRef {
          target {
            ... on Commit {
              history(first: 100) {
                nodes { committedDate }
              }
            }
          }
        }
      }
    }
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
            weekday
          }
        }
      }
    }
  }
}`;

const publicUserQuery = `query($login: String!) {
  user(login: $login) {
    login
    repositories(first: 60, ownerAffiliations: OWNER, privacy: PUBLIC) {
      nodes {
        name
        isFork
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name } }
        }
        defaultBranchRef {
          target {
            ... on Commit {
              history(first: 100) {
                nodes { committedDate }
              }
            }
          }
        }
      }
    }
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
            weekday
          }
        }
      }
    }
  }
}`;

let account: any;
try {
  const raw = JSON.parse(execFileSync("gh", ["api", "graphql", "-f", `query=${viewerQuery}`], { encoding: "utf8" }));
  account = raw.data.viewer;
} catch {
  const raw = JSON.parse(
    execFileSync("gh", ["api", "graphql", "-f", `query=${publicUserQuery}`, "-f", `login=${LOGIN}`], { encoding: "utf8" }),
  );
  account = raw.data.user;
}

const dateCounts = new Map<string, number>(prevDayCounts);
const repoDayAcc = new Map<string, number>();
for (const repo of account.repositories.nodes ?? []) {
  const hist = repo.defaultBranchRef?.target?.history?.nodes ?? [];
  for (const c of hist) {
    const d = c.committedDate.slice(0, 10);
    repoDayAcc.set(d, (repoDayAcc.get(d) ?? 0) + 1);
  }
}
for (const [d, cnt] of repoDayAcc) {
  dateCounts.set(d, Math.max(dateCounts.get(d) ?? 0, cnt));
}

const langTotals = new Map<string, number>();
for (const repo of account.repositories.nodes ?? []) {
  if (repo.isFork) continue;
  for (const e of repo.languages?.edges ?? []) {
    langTotals.set(e.node.name, (langTotals.get(e.node.name) ?? 0) + e.size);
  }
}
for (const [name, size] of prevLangTotals) {
  langTotals.set(name, Math.max(langTotals.get(name) ?? 0, size));
}

const weeks = account.contributionsCollection.contributionCalendar.weeks;
let total = 0;
for (const w of weeks) {
  for (const day of w.contributionDays) {
    const extra = dateCounts.get(day.date) ?? 0;
    const count = Math.max(day.contributionCount, extra);
    day.contributionCount = count;
    total += count;
    day.contributionLevel =
      count === 0 ? "NONE" :
      count <= 2 ? "FIRST_QUARTILE" :
      count <= 6 ? "SECOND_QUARTILE" :
      count <= 12 ? "THIRD_QUARTILE" : "FOURTH_QUARTILE";
  }
}

const sanitized = {
  data: {
    user: {
      login: LOGIN,
      repositories: {
        nodes: [
          {
            name: "aggregated-workshop",
            isFork: false,
            languages: {
              edges: [...langTotals.entries()].map(([name, size]) => ({ size, node: { name } })),
            },
          },
        ],
      },
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: total,
          weeks,
        },
      },
    },
  },
};

writeFileSync(STATS_PATH, JSON.stringify(sanitized, null, 2) + "\n");
console.log(`stats.json 已更新（近一年总计 ${total} 次耕耘记录）`);
