const RedshiftClient = require('node-redshift');
const SQL = require('./utils/sql-string');
const tableSchemas = require('./table-schemas');

module.exports = class {
  constructor() {
    this.client = new RedshiftClient({
      host: process.env.REDSHIFT_HOST,
      port: process.env.REDSHIFT_PORT,
      database: process.env.REDSHIFT_DATABASE,
      user: process.env.REDSHIFT_USER,
      password: process.env.REDSHIFT_PASSWORD,
    });

    this.schema = process.env.NODE_ENV === 'production'
      ? process.env.REDSHIFT_SCHEMA_NAME
      : `${process.env.REDSHIFT_SCHEMA_NAME}_test`;

    this.s3 = {
      bucket: process.env.AWS_S3_BUCKET,
      accessKeyId: process.env.ACCESS_KEY_ID,
      secretAccessKey: process.env.SECRET_ACCESS_KEY,
      region: process.env.AMAZON_REGION,
    };
  }

  createSchema() {
    return this.client.query(SQL`
      CREATE SCHEMA IF NOT EXISTS ${this.schema}
    `);
  }

  createTable(tableName, sortKey) {
    return this.client.query(SQL`
      CREATE TABLE IF NOT EXISTS ${this.schema}.${tableName} (
        ${tableSchemas[tableName]}
      ) DISTSTYLE EVEN SORTKEY(${sortKey || 'created_at'})
    `);
  }

  copyFromS3(tableName, fileName) {
    const copyStatement = SQL`
      COPY ${this.schema}.${tableName}
      FROM 's3://${this.s3.bucket}/${fileName}'
      ACCESS_KEY_ID '${this.s3.accessKeyId}'
      SECRET_ACCESS_KEY '${this.s3.secretAccessKey}'
      REGION '${this.s3.region}'
      ESCAPE
      DELIMITER '|'
      MAXERROR 100
    `;
    return this.client.query(copyStatement);
  }

  async createdAtTimestamps(tableName) {
    const [{ min, max }] = await this.client.query(SQL`
      SELECT
        min(date_trunc('minute', created_at)) AS min,
        max(date_trunc('minute', created_at)) AS max
      FROM ${this.schema}.${tableName}
    `, { raw: true });

    return { min: min || new Date(), max: max || new Date() };
  }

  async dropDupes(tableName) {
    await this.client.query(SQL`
      BEGIN;

      CREATE TEMP TABLE dupe_${tableName} AS
      SELECT id
      FROM ${this.schema}.${tableName}
      GROUP BY 1
      HAVING COUNT(*) > 1;

      CREATE TEMP TABLE temp_${tableName}
      (LIKE ${this.schema}.${tableName});

      INSERT INTO temp_${tableName}
      SELECT DISTINCT *
      FROM ${this.schema}.${tableName}
      WHERE id IN (
        SELECT id
        FROM dupe_${tableName}
      );

      DELETE FROM ${this.schema}.${tableName}
      WHERE id IN (
        SELECT id
        FROM dupe_${tableName}
      );

      INSERT INTO ${this.schema}.${tableName}
      SELECT *
      FROM temp_${tableName};

      DROP TABLE dupe_${tableName};
      DROP TABLE temp_${tableName};

      COMMIT;
    `);
  }
};
