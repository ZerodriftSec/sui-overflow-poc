import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const SCENARIOS_DIR = "scenarios";

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function sanitizeName(name) {
  return String(name || "step")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "") || "step";
}

async function loadScenario(filePath) {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.steps)) {
    throw new Error(`Scenario ${filePath} must include a 'steps' array.`);
  }
  return parsed;
}

async function discoverScenarios() {
  const scenarioArg = process.env.SCENARIO;
  if (scenarioArg) {
    return [path.resolve(process.cwd(), scenarioArg)];
  }

  const dir = path.resolve(process.cwd(), SCENARIOS_DIR);
  const files = await readdir(dir);
  return files
    .filter((f) => f.endsWith(".json") && f !== "example-flow.json")
    .sort()
    .map((f) => path.join(dir, f));
}

async function waitForRendered(page) {
  // Wait for Next.js hydration — body should have visible content
  await page.waitForFunction(() => {
    const body = document.body;
    if (!body) return false;
    // Check that at least one child element has rendered height
    const children = body.querySelectorAll("*");
    for (const el of children) {
      if (el.offsetHeight > 50 && el.textContent.trim().length > 0) return true;
    }
    return false;
  }, { timeout: 10000 }).catch(() => {});
  // Extra settle time for animations / lazy-loaded styles
  await page.waitForTimeout(1500);
}

async function executeStep(page, step, idx, outputDir, baseUrl) {
  const index = String(idx + 1).padStart(2, "0");
  switch (step.type) {
    case "goto": {
      const target = step.url.startsWith("http") ? step.url : `${baseUrl}${step.url}`;
      await page.goto(target, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {
        return page.goto(target, { waitUntil: "load", timeout: 20000 });
      });
      await waitForRendered(page);
      return `goto ${target}`;
    }
    case "click": {
      await page.click(step.selector);
      return `click ${step.selector}`;
    }
    case "fill": {
      await page.fill(step.selector, step.value ?? "");
      return `fill ${step.selector}`;
    }
    case "press": {
      await page.press(step.selector, step.key || "Enter");
      return `press ${step.selector}`;
    }
    case "check": {
      await page.check(step.selector);
      return `check ${step.selector}`;
    }
    case "uncheck": {
      await page.uncheck(step.selector);
      return `uncheck ${step.selector}`;
    }
    case "selectOption": {
      await page.selectOption(step.selector, step.value);
      return `selectOption ${step.selector}`;
    }
    case "waitForSelector": {
      await page.waitForSelector(step.selector, { state: step.state || "visible", timeout: step.timeoutMs || 10000 });
      return `waitForSelector ${step.selector}`;
    }
    case "waitForURL": {
      await page.waitForURL(step.urlPattern, { timeout: step.timeoutMs || 10000 });
      return `waitForURL ${step.urlPattern}`;
    }
    case "waitForTimeout": {
      await page.waitForTimeout(step.ms || 500);
      return `waitForTimeout ${step.ms || 500}`;
    }
    case "screenshot": {
      const filename = `${index}-${sanitizeName(step.name || `shot-${index}`)}.png`;
      const filepath = path.join(outputDir, filename);
      await page.screenshot({ path: filepath, fullPage: Boolean(step.fullPage) });
      return `screenshot → ${filename}`;
    }
    default:
      throw new Error(`Unknown step type '${step.type}' at index ${idx}.`);
  }
}

async function runScenario(browser, scenarioPath, rootOutputDir) {
  const scenario = await loadScenario(scenarioPath);
  const scenarioName = sanitizeName(scenario.name || path.basename(scenarioPath, ".json"));
  const baseUrl = (process.env.BASE_URL || scenario.baseUrl || "http://localhost:3000").replace(/\/$/, "");
  const outDir = path.join(rootOutputDir, scenarioName);

  await mkdir(outDir, { recursive: true });

  console.log(`\n━━━ ${scenario.name || scenarioName} (${baseUrl}) ━━━`);

  const context = await browser.newContext({
    viewport: scenario.viewport || { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  let captured = 0;
  let failed = 0;

  try {
    for (let i = 0; i < scenario.steps.length; i += 1) {
      try {
        const result = await executeStep(page, scenario.steps[i], i, outDir, baseUrl);
        console.log(`  [${String(i + 1).padStart(2, "0")}] ${result}`);
        if (scenario.steps[i].type === "screenshot") captured++;
      } catch (err) {
        console.error(`  [${String(i + 1).padStart(2, "0")}] FAILED ${scenario.steps[i].type}: ${err.message}`);
        failed++;
      }
    }
  } finally {
    await context.close();
  }

  return { scenarioName, captured, failed, outDir };
}

async function main() {
  const scenarioPaths = await discoverScenarios();
  if (scenarioPaths.length === 0) {
    console.error("No scenario files found in scenarios/ directory.");
    process.exitCode = 1;
    return;
  }

  const rootOutputDir = path.resolve(process.cwd(), process.env.OUTPUT_DIR || `output/${timestamp()}`);
  await mkdir(rootOutputDir, { recursive: true });

  console.log(`Found ${scenarioPaths.length} scenario(s). Output: ${rootOutputDir}`);

  const browser = await chromium.launch({ headless: process.env.HEADLESS !== "false" });

  const results = [];
  try {
    for (const sp of scenarioPaths) {
      try {
        const result = await runScenario(browser, sp, rootOutputDir);
        results.push(result);
      } catch (err) {
        console.error(`\nScenario ${path.basename(sp)} failed: ${err.message}`);
        results.push({ scenarioName: path.basename(sp), captured: 0, failed: 1 });
      }
    }
  } finally {
    await browser.close();
  }

  console.log("\n━━━ Summary ━━━");
  let totalCaptured = 0;
  let totalFailed = 0;
  for (const r of results) {
    console.log(`  ${r.scenarioName}: ${r.captured} captured, ${r.failed} failed`);
    totalCaptured += r.captured;
    totalFailed += r.failed;
  }
  console.log(`  Total: ${totalCaptured} screenshots, ${totalFailed} failures`);
  console.log(`  Output: ${rootOutputDir}`);

  if (totalFailed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Capture failed:", error.message);
  process.exitCode = 1;
});
