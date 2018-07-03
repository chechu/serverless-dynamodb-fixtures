const asyncPool = require('tiny-async-pool');
const AWS = require('aws-sdk');

// DynamoDB has a 25 item limit in batch requests
// https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchWriteItem.html
const MAX_MIGRATION_CHUNK = 25;

const CONCURRENT_WRITES = 5;

class ServerlessPlugin {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;
        this.provider = this.serverless.getProvider(this.serverless.service.provider.name);
        this.concurrentWrites = this.options.concurrentWrites || CONCURRENT_WRITES;

        this.commands = {
            fixtures: {
                usage: 'Load the configured fixtures',
                lifecycleEvents: [
                    'load',
                ],
            },
        };

        this.hooks = {
            'after:deploy:deploy': this.loadFixtures.bind(this),
            'fixtures:load': this.loadFixtures.bind(this),
        };
    }

    loadFixtures() {
        const { fixtures } = this.serverless.service.custom;
        if (!fixtures || !fixtures.length) {
            return Promise.resolve();
        }

        this.setUpAWS();
        return Promise.all(fixtures.map(fixtureConfig => this.loadFixture(fixtureConfig)));
    }

    loadFixture(fixtureConfig) {
        if (!fixtureConfig.table) {
            return Promise.reject(new Error('Table name not defined'));
        }

        if (!(fixtureConfig.sources && fixtureConfig.sources.length)
            && !(fixtureConfig.rawsources && fixtureConfig.rawsources.length)) {
            return Promise.reject(new Error(`Source files not defined for table ${fixtureConfig.table}`));
        }

        if (fixtureConfig.stage && fixtureConfig.stage !== this.getStage()) {
            this.serverless.cli.log(`Ignoring fixtures for stage ${fixtureConfig.stage}`);
            return Promise.resolve();
        }

        this.serverless.cli.log(`Loading fixtures for table ${fixtureConfig.table}`);

        const dynamoFunctions = this.getDynamoFunctions();
        const promises = [];
        if (fixtureConfig.sources && fixtureConfig.sources.length) {
            promises.push(Promise.all(fixtureConfig.sources.map(source => this.loadSource(source, fixtureConfig.table, dynamoFunctions.doc))));
        }

        if (fixtureConfig.rawsources && fixtureConfig.rawsources.length) {
            promises.push(Promise.all(fixtureConfig.rawsources.map(source => this.loadSource(source, fixtureConfig.table, dynamoFunctions.raw))));
        }
        return Promise.all(promises);
    }

    loadSource(sourceFilePath, tableName, dynamoFunction) {
        if (!this.serverless.utils.fileExistsSync(sourceFilePath)) {
            return Promise.reject(new Error(`${sourceFilePath} doesn't exist`));
        }

        const chunks = this.getSeedChunks(sourceFilePath);
        return asyncPool(this.concurrentWrites, chunks, this.writeSeedBatch.bind(this, dynamoFunction, tableName));
    }

    setUpAWS() {
        const region = this.provider.getRegionSourceValue().value;
        const credentials = this.provider.getCredentials();

        AWS.config.region = region;
        AWS.config.credentials = credentials.credentials;
    }

    getStage() {
        return this.provider.getStageSourceValue().value;
    }

    getDynamoFunctions() {
        const doc = new AWS.DynamoDB.DocumentClient();
        const raw = new AWS.DynamoDB();

        return {
            doc: doc.batchWrite.bind(doc),
            raw: raw.batchWriteItem.bind(raw),
        };
    }

    getSeedChunks(sourceFilePath) {
        // This util function parses directly the files with .json o .yml extensions
        const data = this.serverless.utils.readFileSync(sourceFilePath);
        return this.chunk(data, MAX_MIGRATION_CHUNK);
    }

    chunk(arr, chunkSize, cache = []) {
        const tmp = [...arr];
        while (tmp.length) cache.push(tmp.splice(0, chunkSize));
        return cache;
    }

    /**
     * Writes a batch chunk of migration seeds to DynamoDB. DynamoDB has a limit on the number of
     * items that may be written in a batch operation.
     * @param {function} dynamodbWriteFunction The DynamoDB DocumentClient.batchWrite or DynamoDB.batchWriteItem function
     * @param {string} tableName The table name being written to
     * @param {any[]} seeds The migration seeds being written to the table
     */
    writeSeedBatch(dynamodbWriteFunction, tableName, seeds) {
        const params = {
            RequestItems: {
                [tableName]: seeds.map(seed => ({
                    PutRequest: {
                        Item: seed,
                    },
                })),
            },
        };

        return new Promise((resolve, reject) => {
            // interval lets us know how much time we have burnt so far. This lets us have a backoff mechanism to try
            // again a few times in case the Database resources are in the middle of provisioning.
            function execute(interval) {
                setTimeout(() => {
                    dynamodbWriteFunction(params, (err) => {
                        if (err) {
                            if (err.code === 'ResourceNotFoundException' && interval <= 5000) {
                                execute(interval + 1000);
                            } else {
                                reject(err);
                            }
                        } else {
                            resolve();
                        }
                    });
                }, interval);
            }
            execute(0);
        });
    }
}

module.exports = ServerlessPlugin;
