const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { Client } = require("pg");

const rootDir = path.resolve(__dirname, "..");
const backupPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(rootDir, "backup_20260529.sql");
const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/aim_fa_erp";
const adminUrl = databaseUrl.replace(/\/[^/?]+(\?.*)?$/, "/postgres$1");
const databaseName = new URL(databaseUrl).pathname.slice(1);

function shouldSkipMeta(line) {
  return line.startsWith("\\restrict") || line.startsWith("\\unrestrict");
}

async function ensureDatabase() {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const exists = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName],
    );
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE ${JSON.stringify(databaseName)}`);
      console.log(`created database ${databaseName}`);
    }
  } finally {
    await client.end();
  }
}

async function executeStatement(client, statement) {
  const sql = statement.trim();
  if (!sql) return;
  await client.query(sql);
}

function parseCopySql(copySql) {
  const match = copySql.match(/^COPY\s+(.+?)\s+\((.+)\)\s+FROM\s+stdin;$/i);
  if (!match) {
    throw new Error(`Unsupported COPY statement: ${copySql}`);
  }
  return {
    tableName: match[1],
    columns: match[2],
    columnCount: splitCopyColumns(match[2]).length,
  };
}

function splitCopyColumns(columns) {
  const result = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < columns.length; index += 1) {
    const char = columns[index];
    if (char === '"') quoted = !quoted;

    if (char === "," && !quoted) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) result.push(current.trim());
  return result;
}

function parseCopyValue(value) {
  if (value === "\\N") return null;
  return value.replace(/\\([btnfrv\\])/g, (_match, char) => {
    switch (char) {
      case "b":
        return "\b";
      case "t":
        return "\t";
      case "n":
        return "\n";
      case "f":
        return "\f";
      case "r":
        return "\r";
      case "v":
        return "\v";
      case "\\":
        return "\\";
      default:
        return char;
    }
  });
}

async function insertCopyBatch(client, copySql, rows) {
  if (rows.length === 0) return;

  const { tableName, columns, columnCount } = parseCopySql(copySql);
  const values = [];
  const placeholders = rows.map((row, rowIndex) => {
    const parsed = row.split("\t").map(parseCopyValue);
    if (parsed.length !== columnCount) {
      throw new Error(`COPY column mismatch for ${tableName}: ${row}`);
    }

    values.push(...parsed);
    const offset = rowIndex * columnCount;
    const params = parsed.map((_value, columnIndex) => `$${offset + columnIndex + 1}`);
    return `(${params.join(", ")})`;
  });

  await client.query(
    `INSERT INTO ${tableName} (${columns}) VALUES ${placeholders.join(", ")}`,
    values,
  );
}

async function copyRows(client, copySql, rows) {
  const batchSize = 250;
  for (let index = 0; index < rows.length; index += batchSize) {
    await insertCopyBatch(client, copySql, rows.slice(index, index + batchSize));
  }
}

async function restore() {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  await ensureDatabase();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("GRANT ALL ON SCHEMA public TO postgres");
    await client.query("GRANT ALL ON SCHEMA public TO public");

    const rl = readline.createInterface({
      input: fs.createReadStream(backupPath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });

    let statement = "";
    let copySql = null;
    let copyRowsBuffer = [];
    let statements = 0;
    let copyBlocks = 0;

    for await (const line of rl) {
      if (shouldSkipMeta(line)) continue;

      if (copySql) {
        if (line === "\\.") {
          await copyRows(client, copySql, copyRowsBuffer);
          copySql = null;
          copyRowsBuffer = [];
          copyBlocks += 1;
        } else {
          copyRowsBuffer.push(line);
        }
        continue;
      }

      if (line.startsWith("COPY ")) {
        await executeStatement(client, statement);
        if (statement.trim()) statements += 1;
        statement = "";
        copySql = line;
        continue;
      }

      statement += `${line}\n`;
      if (line.endsWith(";")) {
        await executeStatement(client, statement);
        statements += 1;
        statement = "";
      }
    }

    await executeStatement(client, statement);
    console.log(`restore complete: ${statements} statements, ${copyBlocks} copy blocks`);
  } finally {
    await client.end();
  }
}

restore().catch((error) => {
  console.error(error);
  process.exit(1);
});
