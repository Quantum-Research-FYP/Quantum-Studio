import { MongoClient, Db } from 'mongodb';

const DEFAULT_DB_NAME = 'quantum_studio';
const CONNECT_TIMEOUT_MS = 30_000;

/**
 * Masks credentials from a MongoDB connection URI for safe logging.
 * Replaces username:password with '***:***' in the authority section.
 */
function maskUri(uri: string): string {
  try {
    return uri.replace(
      /\/\/([^:]+):([^@]+)@/,
      '//***:***@',
    );
  } catch {
    return 'mongodb+srv://***:***@<unparseable>';
  }
}

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Initializes the MongoDB client connection.
 * Fails fast with a clear error if MONGODB_URI is missing or connection fails.
 * Credentials/URI are never logged in cleartext.
 */
export async function connectMongo(): Promise<Db> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error(
      '[db] MONGODB_URI environment variable is not set. ' +
        'Provide a valid MongoDB connection string (e.g. mongodb+srv://user:pass@host/db).',
    );
    process.exit(1);
  }

  const dbName = process.env.MONGODB_DB_NAME || DEFAULT_DB_NAME;

  try {
    client = new MongoClient(uri, {
      connectTimeoutMS: CONNECT_TIMEOUT_MS,
      serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    });

    await client.connect();

    // Verify connectivity with a ping
    db = client.db(dbName);
    await db.command({ ping: 1 });

    console.log(`[db] Connected to MongoDB database "${dbName}" at ${maskUri(uri)}`);
    return db;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[db] Failed to connect to MongoDB (${maskUri(uri)}): ${message}`,
    );
    process.exit(1);
  }
}

/**
 * Returns the active MongoDB Db instance.
 * Throws if called before connectMongo().
 */
export function getDb(): Db {
  if (!db) {
    throw new Error('[db] MongoDB not connected. Call connectMongo() first.');
  }
  return db;
}

/**
 * Returns the active MongoClient instance.
 * Throws if called before connectMongo().
 */
export function getClient(): MongoClient {
  if (!client) {
    throw new Error('[db] MongoDB not connected. Call connectMongo() first.');
  }
  return client;
}

/**
 * Gracefully closes the MongoDB connection.
 */
export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('[db] MongoDB connection closed.');
  }
}
