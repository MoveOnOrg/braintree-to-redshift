if (!process.env.NO_ENV_CHANGE) {
  require('dotenv-safe').load(); // eslint-disable-line
}
const logger = require('./utils/logger');
const { fatal, finished } = require('./utils/handlers');
const Braintree = require('./Braintree');
const Redshift = require('./Redshift');

const braintree = new Braintree();
const redshift = new Redshift();

const nodeEnv = process.env.NODE_ENV;

/* run the script in prod OR
  export initialized classes for testing in dev */

if (nodeEnv !== 'development') {
exports.start = async () => {
    logger.info('starting in', nodeEnv);
    const tables = ['transactions'];
    const batchTimestamp = Date.now();

    try {
      await redshift.createSchema();
      await Promise.all(tables.map(async (table) => {
        try {
          const fileName = `transactions_${batchTimestamp}.csv`;
          await redshift.createTable(table);
          console.log('created redshift table');
          const redshiftTimestamps = await redshift.createdAtTimestamps(table);
          console.log('processed redshift createdAtTimestamps');
          await braintree.uploadToS3(table, redshiftTimestamps, fileName);
          console.log('uploaded ' + fileName + ' to s3');
          await redshift.copyFromS3(table, fileName);
          console.log('copied file from s3');
          await redshift.dropDupes(table);
          console.log('created redshift table');
        } catch (err) { fatal(err); }
      }));
      finished();
    } catch (err) { console.log(err); fatal(err); }
  };
} else {
  exports.braintree = braintree;
  exports.redshift = redshift;
}
