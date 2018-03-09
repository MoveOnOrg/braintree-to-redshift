const streamToPromise = require('stream-to-promise');
const { redshift, braintree } = require('./lib');
const assert = require('assert');

describe('connect to redshift', () => {
  it('create test schema', async () => {
    await redshift.createSchema();
  });

  it('create transactions table', async () => {
    await redshift.createTable('transactions');
  });

  it('create subscriptions table', async () => {
    await redshift.createTable('subscriptions');
  });

  it('create disputes table', async () => {
    await redshift.createTable('disputes');
  });
});

describe('connect to braintree', () => {
  const startedAt = new Date();

  it('create sandbox transactions', async () => {
    const testTransactions = [
      { paymentMethodNonce: 'fake-valid-nonce', amount: '5' },
      { paymentMethodNonce: 'fake-valid-no-billing-address-nonce', amount: '100' },
      { paymentMethodNonce: 'fake-valid-visa-nonce', amount: '5' },
      { paymentMethodNonce: 'fake-valid-visa-nonce', amount: '33.12' },
      { paymentMethodNonce: 'fake-valid-amex-nonce', amount: '5.50' },
      { paymentMethodNonce: 'fake-valid-mastercard-nonce', amount: '12.11' },
      { paymentMethodNonce: 'fake-valid-discover-nonce', amount: '1' },
      { paymentMethodNonce: 'fake-processor-declined-visa-nonce', amount: '5' },
      { paymentMethodNonce: 'fake-processor-declined-mastercard-nonce', amount: '5.50' },
      { paymentMethodNonce: 'fake-processor-declined-amex-nonce', amount: '33.33' },
      { paymentMethodNonce: 'fake-gateway-rejected-fraud-nonce', amount: '500.12' },
    ];

    await Promise.all(testTransactions.map(async ({ paymentMethodNonce, amount }) => (
      braintree.client.transaction.sale({
        paymentMethodNonce,
        amount,
        options: { submitForSettlement: true },
      })
    )));

    const searchStream = braintree.client.transaction.search(search => (
      search.createdAt().min(startedAt)
    ));

    const results = await streamToPromise(searchStream);

    assert.equal(results.length, testTransactions.length);
    assert.ok(1);
  }).timeout(200000);
});

describe('upload braintree transaction data to csv', () => {
  const batchTimestamp = Date.now();
  const fileName = `transactions_${batchTimestamp}.csv`;
  let redshiftTimestamps = null;

  it('gets min/max transaction timestamps from redshift', async () => {
    redshiftTimestamps = await redshift.createdAtTimestamps('transactions');
  }).timeout(200000);

  it('writes braintree transaction data to csv and uploads to s3', async () => {
    await braintree.uploadToS3('transactions', redshiftTimestamps, fileName);
  }).timeout(200000);

  it('copies data from s3 to redshift table', async () => {
    await redshift.copyFromS3('transactions', fileName);
  }).timeout(200000);

  it('drops transaction dupes from redshift', async () => {
    await redshift.dropDupes('transactions');
  }).timeout(200000);
});


describe('finish', async () => {
  it('drop test schema', async () => {
    await redshift.client.query(`DROP SCHEMA ${redshift.schema} CASCADE`);
  });
});
