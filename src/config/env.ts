import path from "path";
import dotenv from "dotenv";

dotenv.config();

function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (!value) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  const n = Number(value);
  return Number.isInteger(n) ? n : value;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  mongodbUri: required("MONGODB_URI"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  startingBalance: parseInt(process.env.STARTING_BALANCE ?? "100", 10),
  /** Country block (services/geoip): MaxMind GeoLite2-Country database file, and the free MaxMind
   *  account id + license key that let the server download / update it by itself. */
  geoipDbPath: process.env.GEOIP_DB_PATH ?? path.resolve("data/GeoLite2-Country.mmdb"),
  maxmindAccountId: process.env.MAXMIND_ACCOUNT_ID ?? "",
  maxmindLicenseKey: process.env.MAXMIND_LICENSE_KEY ?? "",
  /** Emergency switch: true = the country block is off whatever the dashboard says. */
  geoBlockForceOff: process.env.GEOBLOCK_FORCE_OFF === "true",
  /** Express "trust proxy": set when something (e.g. a reverse proxy) sits in front of Node, so the
   *  real visitor IP is read from X-Forwarded-For. "1" = one proxy hop; empty = Node is reached
   *  directly. Wrong value → every visitor looks like the proxy's IP and the country block can't work. */
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  /** Emails that are promoted to the admin role on register/login. */
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
};
