#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const reportPaths = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const testsDir = "tests";

function deriveStatus(expectedStatus, results) {
  if (results.length === 0) return "skipped";
  const final = results[results.length - 1].status;
  const hadFailure = results.some((r) => r.status !== "passed" && r.status !== "skipped");
  if (final === "passed") {
    if (expectedStatus !== "passed") return "unexpected";
    return hadFailure ? "flaky" : "passed";
  }
  if (final === "skipped") return "skipped";
  if (expectedStatus === "failed") return "expected";
  return "unexpected";
}

function collectSpecs(suite, project, out) {
  const suiteProject = suite.title?.match(/^(unit|api|e2e)$/) ? suite.title : project;

  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const results = test.results ?? [];
      const reqs = [
        ...new Set(
          results.flatMap((r) =>
            (r.annotations ?? [])
              .filter((a) => a.type === "req")
              .map((a) => a.description),
          ),
        ),
      ];
      out.push({
        title: spec.title,
        file: spec.file,
        project: test.projectName || suiteProject || "unknown",
        status: deriveStatus(test.expectedStatus, results),
        expectedStatus: test.expectedStatus,
        duration: results.reduce((sum, r) => sum + (r.duration ?? 0), 0),
        attempts: results.length,
        reqs,
      });
    }
  }

  for (const child of suite.suites ?? []) {
    collectSpecs(child, suiteProject, out);
  }
}

function listSpecFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSpecFiles(path));
    else if (entry.name.endsWith(".spec.ts")) files.push(path);
  }
  return files;
}

function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(1)} с`;
}

function table(rows) {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => String(row[i]).length)));
  return rows
    .map((row) => row.map((cell, i) => String(cell).padEnd(widths[i])).join("  "))
    .join("\n");
}

const tests = [];
let wallClock = 0;
for (const reportPath of reportPaths) {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  for (const suite of report.suites ?? []) {
    collectSpecs(suite, null, tests);
  }
  wallClock += report.stats?.duration ?? 0;
}

if (tests.length === 0) {
  console.error(`В отчётах ${reportPaths.join(", ")} не нашлось тестов`);
  process.exit(1);
}

const expectedFailures = tests.filter((t) => t.expectedStatus === "failed");
const unexpected = tests.filter((t) => t.status === "unexpected");
const flaky = tests.filter((t) => t.status === "flaky");
const skipped = tests.filter((t) => t.status === "skipped");
const retried = tests.filter((t) => t.attempts > 1);

const byProject = new Map();
for (const test of tests) {
  const bucket = byProject.get(test.project) ?? { count: 0, duration: 0 };
  bucket.count += 1;
  bucket.duration += test.duration;
  byProject.set(test.project, bucket);
}

const specFiles = listSpecFiles(testsDir);
const e2eFiles = specFiles.filter((file) => file.includes("/e2e/"));
const withApiArrange = e2eFiles.filter((file) => {
  const source = readFileSync(file, "utf8");
  return source.includes("users.add(") || source.includes("createUserViaApi");
});
const withCleanup = e2eFiles.filter((file) => {
  const source = readFileSync(file, "utf8");
  return source.includes("users.cleanup(") || source.includes("deleteUserViaApi");
});

const slowest = [...tests].sort((a, b) => b.duration - a.duration).slice(0, 5);

console.log("Метрики прогона\n");
console.log(
  table([
    ["Всего тестов", tests.length],
    ["Прошли как ожидалось", tests.length - unexpected.length - flaky.length - skipped.length],
    ["Ожидаемые падения (known defects)", expectedFailures.length],
    ["Непредвиденные падения", unexpected.length],
    ["Flaky (прошли с повтора)", flaky.length],
    ["Пропущены", skipped.length],
    ["Тестов с повторами", retried.length],
    ["Общее время прогона", formatSeconds(wallClock)],
  ])
);

console.log("\nПо уровням пирамиды\n");
console.log(
  table([
    ["Уровень", "Тестов", "Время"],
    ...[...byProject.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([project, bucket]) => [project, bucket.count, formatSeconds(bucket.duration)]),
  ])
);

const requirements = JSON.parse(readFileSync("docs/requirements.json", "utf8"));
const PASSED = new Set(["passed", "flaky"]);

const reqToTests = new Map();
for (const test of tests) {
  for (const req of test.reqs) {
    const bucket = reqToTests.get(req) ?? [];
    bucket.push(test);
    reqToTests.set(req, bucket);
  }
}

const coverageRows = requirements.map((req) => {
  const covering = reqToTests.get(req.id) ?? [];
  const green = covering.filter((t) => PASSED.has(t.status));
  const knownDefect = covering.some(
    (t) => t.expectedStatus === "failed" && t.status === "expected"
  );
  let status;
  if (req.status === "out_of_scope") status = "out of scope";
  else if (knownDefect) status = "known defect";
  else if (green.length > 0) status = req.status === "partial" ? "partial" : "automated";
  else status = "uncovered";
  return { req, covering, green, status };
});

const byStatus = new Map();
for (const row of coverageRows) {
  const bucket = byStatus.get(row.status) ?? 0;
  byStatus.set(row.status, bucket + 1);
}
const covered = ["automated", "partial", "known defect"]
  .map((s) => byStatus.get(s) ?? 0)
  .reduce((a, b) => a + b, 0);
const coveragePercent = Math.round((covered / requirements.length) * 100);

console.log("\nПокрытие требований\n");
console.log(
  table([
    ["Требований в эталоне", requirements.length],
    ["Покрыто тестами", `${covered} из ${requirements.length}`],
    ["Процент покрытия", `${coveragePercent}%`],
    ...[...byStatus.entries()].map(([status, count]) => [status, count]),
  ])
);

const coveredByLevel = new Map();
for (const row of coverageRows) {
  if (!["automated", "partial", "known defect"].includes(row.status)) continue;
  const levels = new Set(row.green.map((t) => t.project));
  for (const level of levels) {
    const bucket = coveredByLevel.get(level) ?? new Set();
    bucket.add(row.req.id);
    coveredByLevel.set(level, bucket);
  }
}
if (coveredByLevel.size > 0) {
  console.log("\nПокрытые требования по уровням\n");
  console.log(
    table(
      [...coveredByLevel.entries()].map(([level, ids]) => [
        level,
        ids.size,
        [...ids].join(" "),
      ])
    )
  );
}

const uncovered = coverageRows.filter((r) => r.status === "uncovered");
if (uncovered.length > 0) {
  console.log("\nБез тестов\n");
  console.log(table(uncovered.map((r) => [r.req.id, r.req.title])));
}
const oos = coverageRows.filter((r) => r.status === "out of scope");
if (oos.length > 0) {
  console.log("\nНедостижимо в black-box\n");
  console.log(table(oos.map((r) => [r.req.id, r.req.note])));
}

console.log("\nДисциплина E2E\n");
console.log(
  table([
    ["Файлов E2E", e2eFiles.length],
    ["Готовят данные через API", `${withApiArrange.length} из ${e2eFiles.length}`],
    ["Гарантируют cleanup", `${withCleanup.length} из ${e2eFiles.length}`],
  ])
);

console.log("\nСамые медленные сценарии\n");
console.log(
  table(slowest.map((test) => [formatSeconds(test.duration), test.project, test.title]))
);

if (unexpected.length > 0) {
  console.log("\nНепредвиденные падения\n");
  console.log(table(unexpected.map((test) => [test.project, test.file, test.title])));
}

const writeMatrix = process.argv.includes("--write-matrix");

function testRef(t) {
  const file = t.file.replace(/^.*tests\//, "").replace(/\.spec\.ts$/, "");
  return `\`${file}\``;
}

function matrixMarkdown() {
  const lines = [];
  lines.push("# Матрица покрытия PomidorQA");
  lines.push("");
  lines.push(
    "Покрытие считается по функциональным требованиям MVP из [`requirements.md`](../requirements.md). " +
      "Каждый тест несёт номера требований в аннотациях `req`; матрица генерируется из JSON-отчёта " +
      "реального прогона командой `npm run coverage` и руками не редактируется."
  );
  lines.push("");
  lines.push(`**Покрыто ${covered} из ${requirements.length} требований (${coveragePercent}%)**`);
  lines.push("");
  lines.push("| Статус | Требований |");
  lines.push("|---|---|");
  for (const [status, count] of byStatus) {
    lines.push(`| \`${status}\` | ${count} |`);
  }
  lines.push(`| **Всего** | **${requirements.length}** |`);
  lines.push("");
  let section = null;
  for (const row of coverageRows) {
    if (row.req.section !== section) {
      section = row.req.section;
      if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
      lines.push(`## ${section}`);
      lines.push("");
      lines.push("| ID | Требование | Статус | Тесты |");
      lines.push("|---|---|---|---|");
    }
    const testList = [...new Set(row.green.map(testRef))].join(", ");
    const note = row.req.note ? ` — ${row.req.note}` : "";
    lines.push(
      `| ${row.req.id} | ${row.req.title} | \`${row.status}\`${note} | ${testList || "—"} |`
    );
  }
  const defects = tests.filter(
    (t) => t.expectedStatus === "failed" && t.status === "expected" && t.reqs.length > 0
  );
  if (defects.length > 0) {
    lines.push("");
    lines.push("## Известные дефекты");
    lines.push("");
    lines.push(
      "Тесты написаны по требованию, а не по фактическому поведению, и помечены `test.fail()`: " +
        "пока дефект жив, ожидаемый результат — падение, и прогон остаётся зелёным."
    );
    lines.push("");
    for (const t of defects) {
      lines.push(`- **${t.reqs.join(", ")}** — ${testRef(t)}: ${t.title}`);
    }
  }
  return lines.join("\n") + "\n";
}

if (writeMatrix) {
  writeFileSync("docs/coverage-matrix.md", matrixMarkdown());
  console.log("\nМатрица записана: docs/coverage-matrix.md");
}

process.exit(unexpected.length > 0 ? 1 : 0);
