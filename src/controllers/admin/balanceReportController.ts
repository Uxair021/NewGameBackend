import { Request, Response } from "express";
import { Types } from "mongoose";
import { BalanceAdjustment, BalanceAdjustmentType } from "../../models/BalanceAdjustment";
import { User } from "../../models/User";

const PAGE_SIZE = 50;
const MAX_EXPORT_ROWS = 50_000;

/** Rows saved before `type` existed: a player's own row was demo credits, anything else was an
 * admin typing a new total. */
const LEGACY_ADMIN = { type: null, $expr: { $ne: ["$createdBy", "$userId"] } };
const LEGACY_SELF = { type: null, $expr: { $eq: ["$createdBy", "$userId"] } };

type ReportType = BalanceAdjustmentType | "admin_set";

const TYPE_LABELS: Record<ReportType, string> = {
  admin_add: "Added by admin",
  admin_remove: "Removed by admin",
  admin_set: "Set by admin (old)",
  starting_balance: "Starting balance",
  demo_credits: "Demo credits",
};

function typeFilter(type: string): Record<string, unknown> {
  switch (type) {
    case "admin":
      return { $or: [{ type: { $in: ["admin_add", "admin_remove"] } }, LEGACY_ADMIN] };
    case "admin_add":
      return { $or: [{ type: "admin_add" }, { ...LEGACY_ADMIN, delta: { $gt: 0 } }] };
    case "admin_remove":
      return { $or: [{ type: "admin_remove" }, { ...LEGACY_ADMIN, delta: { $lt: 0 } }] };
    case "starting_balance":
      return { type: "starting_balance" };
    case "demo_credits":
      return { $or: [{ type: "demo_credits" }, LEGACY_SELF] };
    default:
      return {};
  }
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function parseDate(value: unknown): Date | null | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The match for the query's filters, or null if a filter is invalid. ObjectIds are real ObjectIds
 * here because this also goes into an aggregate, which doesn't cast them the way find() does. */
async function buildMatch(query: Request["query"]): Promise<Record<string, unknown> | null> {
  const conditions: Record<string, unknown>[] = [typeFilter(String(query.type ?? "all"))];

  const from = parseDate(query.from);
  const to = parseDate(query.to);
  if (from === null || to === null) return null;
  if (from || to) conditions.push({ createdAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } });

  if (typeof query.adminId === "string" && query.adminId) {
    if (!Types.ObjectId.isValid(query.adminId)) return null;
    conditions.push({ createdBy: new Types.ObjectId(query.adminId) });
  }

  const player = typeof query.player === "string" ? query.player.trim() : "";
  if (player) {
    const pattern = new RegExp(escapeRegex(player), "i");
    const users = await User.find({ $or: [{ username: pattern }, { fullName: pattern }] }).select("_id").lean();
    // The stored name also finds players whose account has since been purged.
    conditions.push({ $or: [{ userId: { $in: users.map((u) => u._id) } }, { username: pattern }] });
  }

  return { $and: conditions };
}

/** Fills in each row's type and names, preferring the live account over the stored name. */
async function toReportRows(docs: Awaited<ReturnType<typeof findRows>>) {
  const ids = [...new Set(docs.flatMap((d) => [String(d.userId), String(d.createdBy)]))];
  const users = await User.find({ _id: { $in: ids } }).select("username fullName").lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  return docs.map((d) => {
    const userId = String(d.userId);
    const createdBy = String(d.createdBy);
    const player = byId.get(userId);
    const byPlayer = createdBy === userId;
    const type: ReportType = d.type ?? (byPlayer ? "demo_credits" : "admin_set");
    return {
      _id: String(d._id),
      userId,
      username: player?.username ?? d.username ?? "(deleted player)",
      fullName: player?.fullName ?? null,
      playerExists: Boolean(player),
      type,
      typeLabel: TYPE_LABELS[type],
      delta: d.delta,
      previousBalance: d.previousBalance,
      newBalance: d.newBalance,
      changedBy: byPlayer ? "Player" : byId.get(createdBy)?.username ?? d.createdByUsername ?? "(deleted admin)",
      createdAt: d.createdAt,
    };
  });
}

function findRows(match: Record<string, unknown>, skip: number, limit: number) {
  return BalanceAdjustment.find(match).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean();
}

export async function getBalanceReport(req: Request, res: Response): Promise<void> {
  const match = await buildMatch(req.query);
  if (!match) {
    res.status(400).json({ error: "Invalid filter" });
    return;
  }

  const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
  const [docs, total, totalsAgg, admins] = await Promise.all([
    findRows(match, (page - 1) * PAGE_SIZE, PAGE_SIZE),
    BalanceAdjustment.countDocuments(match),
    BalanceAdjustment.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          added: { $sum: { $cond: [{ $gt: ["$delta", 0] }, "$delta", 0] } },
          removed: { $sum: { $cond: [{ $lt: ["$delta", 0] }, { $abs: "$delta" }, 0] } },
        },
      },
    ]),
    User.find({ role: "admin" }).select("username").sort({ username: 1 }).lean(),
  ]);

  const added = totalsAgg[0]?.added ?? 0;
  const removed = totalsAgg[0]?.removed ?? 0;
  res.json({
    rows: await toReportRows(docs),
    page,
    pageSize: PAGE_SIZE,
    total,
    totals: {
      added: Math.round(added * 100) / 100,
      removed: Math.round(removed * 100) / 100,
      net: Math.round((added - removed) * 100) / 100,
    },
    admins: admins.map((a) => ({ _id: String(a._id), username: a.username })),
  });
}

/** Quotes a text cell. A leading = + - @ would run as a formula when the file is opened in Excel,
 * and usernames and names are free text, so those cells are forced to plain text. */
function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function exportBalanceReport(req: Request, res: Response): Promise<void> {
  const match = await buildMatch(req.query);
  if (!match) {
    res.status(400).json({ error: "Invalid filter" });
    return;
  }
  const total = await BalanceAdjustment.countDocuments(match);
  if (total > MAX_EXPORT_ROWS) {
    res.status(400).json({ error: `Too many rows to export (${total}). Narrow the dates and try again.` });
    return;
  }

  const rows = await toReportRows(await findRows(match, 0, MAX_EXPORT_ROWS));
  const header = "Date (UTC),Player,Full name,Type,Amount,Balance before,Balance after,Changed by";
  const lines = rows.map((r) =>
    [
      new Date(r.createdAt).toISOString(),
      csvText(r.username),
      csvText(r.fullName ?? ""),
      csvText(r.typeLabel),
      r.delta.toFixed(2),
      r.previousBalance.toFixed(2),
      r.newBalance.toFixed(2),
      csvText(r.changedBy),
    ].join(",")
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="balance-report.csv"');
  // The leading BOM makes Excel read the file as UTF-8.
  res.send(`﻿${[header, ...lines].join("\r\n")}\r\n`);
}
