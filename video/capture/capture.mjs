// Captures the Ogma dashboard with fictional data (capture/fixtures.mjs).
// Every /api request, the metrics WebSocket and the GitHub API are answered by Playwright, so the
// backend never sees the browser. Needs the frontend on OGMA_URL (default http://localhost:5180).
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import * as fx from "./fixtures.mjs";

const BASE = process.env.OGMA_URL ?? "http://localhost:5180";
const W = 1920, H = 1200;

const json = (route, body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });

async function capture(scheme) {
  const out = new URL(`../public/captures/${scheme}/`, import.meta.url).pathname;
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium" });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: "reduce" });
  await ctx.addInitScript((theme) => {
    localStorage.setItem("vault-theme", theme);
    localStorage.setItem("git-roots", JSON.stringify(["/home/dev/projects"]));
    localStorage.setItem("github-username", "demo-dev");
    localStorage.setItem("weather-location", "Berlin");
    localStorage.setItem("sound-enabled", "false");
  }, scheme);
  const page = await ctx.newPage();

  await page.route("https://api.github.com/**", (r) => json(r, r.request().url().includes("/repos") ? fx.githubRepos : fx.githubUser));
  await page.route("**/api/**", (r) => {
    const { pathname } = new URL(r.request().url());
    const routes = {
      "/api/metrics": fx.metrics,
      "/api/docker": () => fx.docker,
      "/api/git/scan": () => ({ repos: fx.gitRepos }),
      "/api/service-status": () => fx.services,
      "/api/connectivity": () => fx.connectivity,
      "/api/weather": () => fx.weather,
      "/api/backups": () => fx.backups,
      "/api/kanban/tasks": () => fx.kanbanTasks,
      "/api/kanban/activity": () => fx.kanbanActivity,
      "/api/kanban/projects": () => fx.kanbanProjects,
    };
    const handler = routes[pathname];
    return handler ? json(r, handler()) : r.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  await page.routeWebSocket("**/ws", (ws) => {
    setInterval(() => ws.send(JSON.stringify(fx.metrics())), 1000);
  });

  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForTimeout(23000);
  await page.addStyleTag({ content: "*{caret-color:transparent!important}::-webkit-scrollbar{display:none}" });

  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: W, height: total });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}page.png`, fullPage: true });

  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll(".react-grid-item")].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent.slice(0, 24), x: r.x, y: r.y + scrollY, w: r.width, h: r.height };
    })
  );
  const header = await page.evaluate(() => {
    const el = document.querySelector("header");
    const r = el?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });
  writeFileSync(`${out}layout.json`, JSON.stringify({ width: W, height: total, header, boxes }, null, 2));
  console.log(scheme, "page", W, "x", total, "widgets", boxes.length);
  await browser.close();
}

for (const scheme of ["light", "dark"]) await capture(scheme);
process.exit(0);
