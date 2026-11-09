import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "data");
const LOGIN = "Zakura-sa";

const query = `query {
  viewer {
    login
    repositories(first: 50, ownerAffiliations: OWNER) {
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

const raw = JSON.parse(execFileSync("gh", ["api", "graphql", "-f", `query=${query}`], { encoding: "utf8" }));
const viewer = raw.data.viewer;

// 汇总各仓库 commit 日期（完全匿名化，不落盘任何私有仓库名或提交信息）
const dateCounts = new Map<string, number>();
for (const repo of viewer.repositories.nodes) {
  const hist = repo.defaultBranchRef?.target?.history?.nodes ?? [];
  for (const c of hist) {
    const d = c.committedDate.slice(0, 10);
    dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1);
  }
}

// 聚合语言字节数（仅保留语言名称与总大小，不保留具体仓库列表）
const langTotals = new Map<string, number>();
for (const repo of viewer.repositories.nodes) {
  if (repo.isFork) continue;
  for (const e of repo.languages?.edges ?? []) {
    langTotals.set(e.node.name, (langTotals.get(e.node.name) ?? 0) + e.size);
  }
}

const weeks = viewer.contributionsCollection.contributionCalendar.weeks;
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

writeFileSync(join(DATA, "stats.json"), JSON.stringify(sanitized, null, 2) + "\n");
console.log(`stats.json 已生成（脱敏聚合完成，近一年总计 ${total} 次提交）`);
