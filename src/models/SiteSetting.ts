import { Schema, model, Document, Types } from "mongoose";

/**
 * Site-wide settings — a single document (key "site"). Currently: maintenance mode, switched from
 * the admin dashboard. While it's on, every player request is refused (middleware/maintenanceGate)
 * and the frontend shows its maintenance page; admins keep full access.
 */
export interface ISiteSetting extends Document {
  key: string;
  maintenanceEnabled: boolean;
  /** optional note shown on the maintenance page (empty → the page's default text) */
  maintenanceMessage: string;
  maintenanceUpdatedBy: Types.ObjectId | null;
  maintenanceUpdatedAt: Date | null;
  /** country block (services/geoBlock): on / off, ISO country codes, IPs that always get through */
  geoBlockEnabled: boolean;
  geoBlockCountries: string[];
  geoBlockAllowIps: string[];
  geoBlockUpdatedBy: Types.ObjectId | null;
  geoBlockUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const siteSettingSchema = new Schema<ISiteSetting>(
  {
    key: { type: String, required: true, unique: true, default: "site" },
    maintenanceEnabled: { type: Boolean, required: true, default: false },
    maintenanceMessage: { type: String, default: "", maxlength: 500 },
    maintenanceUpdatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    maintenanceUpdatedAt: { type: Date, default: null },
    geoBlockEnabled: { type: Boolean, required: true, default: false },
    geoBlockCountries: { type: [String], default: ["PK"] },
    geoBlockAllowIps: { type: [String], default: [] },
    geoBlockUpdatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    geoBlockUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const SiteSetting = model<ISiteSetting>("SiteSetting", siteSettingSchema);
