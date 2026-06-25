// PM2 ecosystem file for Maira Sales — VPS Services
// Usage: pm2 start ecosystem.config.cjs
const _token = "6f2327e1cbb246175708fdb19a4eab84ceabf24a44d4ca0234bf8911bfcff4c5";
const _scraperToken = "1355f77aad0c2030540fe65b1d5e371ccbce1ab4dfab5dc49980623552716bc6";

module.exports = {
  apps: [
    {
      name: "maira-wa-gateway",
      script: "index.js",
      cwd: __dirname,
      env: {
        VERCEL_BASE_URL: "https://new-sales-agent.vercel.app",
        WA_GATEWAY_TOKEN: _token,
        POLL_MS: "4000",
        PINO_LEVEL: "warn",
      },
      restart_delay: 5000,
      max_restarts: 10,
      error_file: "./logs/gateway-err.log",
      out_file: "./logs/gateway-out.log",
      merge_logs: true,
      max_memory_restart: "500M",
    },
    {
      name: "vps-scraper",
      script: "../vps-scraper/server.py",
      cwd: __dirname,
      interpreter: "python3",
      env: {
        VPS_SCRAPER_TOKEN: _scraperToken,
        VPS_SCRAPER_PORT: "8765",
      },
      restart_delay: 5000,
      max_restarts: 10,
      error_file: "./logs/scraper-err.log",
      out_file: "./logs/scraper-out.log",
      merge_logs: true,
      max_memory_restart: "500M",
    },
  ],
};
