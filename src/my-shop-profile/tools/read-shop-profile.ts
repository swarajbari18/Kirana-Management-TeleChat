import type { StoreDatabase } from "../../store-durable-object/persistence/db.js";
import { getShopProfile } from "../../store-durable-object/persistence/repositories/shop-profile-repository.js";

export async function readShopProfile(db: StoreDatabase) {
  const profile = await getShopProfile(db);
  return {
    shopName: profile.shopName,
    ownerName: profile.ownerName,
    gstRegistered: profile.gstRegistered,
    gstin: profile.gstin,
    instructions: profile.instructions,
  };
}
