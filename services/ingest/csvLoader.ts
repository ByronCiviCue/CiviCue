import { env } from '../../src/lib/env.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import * as csv from 'fast-csv';
import { Client } from 'pg';
import copyFrom from 'pg-copy-streams';
import pino from 'pino';
import { stableRowHash } from './lib/hash.js';

const logger = pino({ level: 'info' });

interface DatasetConfig {
  rawDir: string;
  landingTable: string;
  stagingTable: string;
  coreTable: string;
  businessKey: string[];
  dateFields: string[];
}

interface DatasetsConfig {
  [key: string]: DatasetConfig;
}

async function loadDatasetConfig(): Promise<DatasetConfig> {
  const configPath = path.join(process.cwd(), 'config', 'datasets.json');
  const configContent = await fs.readFile(configPath, 'utf8');
  const config: DatasetsConfig = JSON.parse(configContent);
  
  if (!config.evictions) {
    throw new Error('Evictions dataset not found in config');
  }
  
  return config.evictions;
}

async function ensureLogDir(): Promise<void> {
  const logDir = path.join(process.cwd(), 'logs');
  await fs.mkdir(logDir, { recursive: true });
}

async function appendLog(message: string): Promise<void> {
  const logPath = path.join(process.cwd(), 'logs', 'ingest.log');
  const timestamp = new Date().toISOString();
  const logLine = `${timestamp}\t${message}\n`;
  await fs.appendFile(logPath, logLine);
}

async function getCSVFiles(rawDir: string): Promise<string[]> {
  try {
    const fullPath = path.resolve(rawDir);
    const files = await fs.readdir(fullPath);
    return files
      .filter(file => file.toLowerCase().endsWith('.csv'))
      .map(file => path.join(fullPath, file));
  } catch {
    logger.info(`Directory ${rawDir} not found or inaccessible`);
    return [];
  }
}

async function countCSVRows(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let rowCount = 0;
    createReadStream(filePath)
      .pipe(csv.parse({ headers: true, objectMode: true }))
      .on('data', () => rowCount++)
      .on('end', () => resolve(rowCount))
      .on('error', reject);
  });
}

async function processCSVFile(filePath: string, dataset: DatasetConfig, dryRun: boolean): Promise<void> {
  const basename = path.basename(filePath);
  logger.info(`Processing file: ${basename}`);
  
  if (dryRun) {
    const rowCount = await countCSVRows(filePath);
    await appendLog(`file=${basename}\trows=${rowCount}\tstatus=prepared`);
    logger.info(`Dry run: ${basename} has ${rowCount} rows`);
    return;
  }

  // Non-dry run: process and load to database
  const client = new Client({
    connectionString: env.db.url
  });

  try {
    await client.connect();
    
    // Create a temporary CSV file for COPY
    const tempCsvPath = path.join(process.cwd(), 'tmp', `${basename}_temp.csv`);
    await fs.mkdir(path.dirname(tempCsvPath), { recursive: true });
    
    let rowCount = 0;
    const copyData: string[][] = [];
    
    await new Promise<void>((resolve, reject) => {
      createReadStream(filePath)
        .pipe(csv.parse({ headers: true, objectMode: true }))
        .on('data', (row: Record<string, unknown>) => {
          rowCount++;
          const jsonData = JSON.stringify(row);
          const hash = stableRowHash(row);
          copyData.push([basename, rowCount.toString(), jsonData, hash]);
        })
        .on('end', () => resolve())
        .on('error', reject);
    });

    // Write COPY data to temp CSV
    await new Promise<void>((resolve, reject) => {
      const writeStream = createWriteStream(tempCsvPath);
      csv.write(copyData, { headers: false })
        .pipe(writeStream)
        .on('finish', () => resolve())
        .on('error', reject);
    });

    // Execute COPY command
    const copyQuery = `COPY ${dataset.landingTable} (source_file, row_number, data, row_hash) FROM STDIN WITH (FORMAT csv)`;
    const copyStream = client.query(copyFrom.from(copyQuery));
    const fileStream = createReadStream(tempCsvPath);
    
    await new Promise<void>((resolve, reject) => {
      fileStream.pipe(copyStream)
        .on('finish', () => resolve())
        .on('error', reject);
    });

    // Clean up temp file
    await fs.unlink(tempCsvPath);
    
    await appendLog(`file=${basename}\trows=${rowCount}\tstatus=prepared`);
    logger.info(`Loaded ${rowCount} rows from ${basename}`);
    
  } catch (error) {
    logger.error(error, `Failed to process ${basename}`);
    throw error;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  try {
    const dryRun = env.runtime.nodeEnv !== 'production';
    logger.info(`Starting CSV loader in ${dryRun ? 'dry-run' : 'write'} mode`);
    
    await ensureLogDir();
    const dataset = await loadDatasetConfig();
    const csvFiles = await getCSVFiles(dataset.rawDir);
    
    if (csvFiles.length === 0) {
      logger.info(`No CSV files found in ${dataset.rawDir}`);
      return;
    }
    
    logger.info(`Found ${csvFiles.length} CSV files`);
    
    for (const filePath of csvFiles) {
      await processCSVFile(filePath, dataset, dryRun);
    }
    
    logger.info('CSV loader completed successfully');
    
  } catch (error) {
    logger.error(error, 'CSV loader failed');
    process.exit(1);
  }
}

// ESM equivalent of require.main === module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}