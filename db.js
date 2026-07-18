import mongoose from "mongoose";

let connecting = null;

export async function ensureDb() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) return { mode: "json", connected: false };

  if (mongoose.connection.readyState === 1) {
    return { mode: "mongodb", connected: true };
  }

  if (!connecting) {
    connecting = mongoose.connect(uri).then(() => {
      console.log("[db] MongoDB 已連線");
      return { mode: "mongodb", connected: true };
    });
  }

  return connecting;
}
