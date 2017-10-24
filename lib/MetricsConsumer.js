'use strict'; // eslint-disable-line strict

const async = require('async');
const Redis = require('ioredis');

const BackbeatConsumer = require('./BackbeatConsumer');
// TODO: Reflect new changes in arsenal:
const RedisClient = require('./clients/RedisClient');
const StatsClient = require('./clients/StatsClient');

const MetricsModel = require('../../lib/MetricsModel');

// StatsClient constant defaults
const INTERVAL = 300; // 5 minutes;
const EXPIRY = 900; // 15 minutes

// Purpose:
//    Consume from Kafka Topic and store in Redis

class MetricsConsumer {
    /**
     * @constructor
     * @param {object} rConfig - redis configurations
     * @param {string} rConfig.host - redis host
     * @param {number} rConfig.port - redis port
     * @param {number} rConfig.keepAlive - redis optional config
     * @param {boolean} rConfig.enableReadyCheck - redis optional config
     * @param {boolean} rConfig.enableOfflineQueue - redis optional config
     * @param {object} mConfig - metrics configurations
     * @param {string} mConfig.topic - metrics topic name
     */
    constructor(rConfig, mConfig) {
        this.mConfig = mConfig;
        this._redisClient = new RedisClient(rConfig);
        this._statsClient = new StatsClient(this._redisClient, INTERVAL,
            EXPIRY);
    }

    processBatch(data) {
        // determine key & value, and use StatsClient to store in proper key
        // async.each(batchToProcess, (entry, cb) => {
        //     if (entry.ops === 'queued') {
        //         this._statsClient.reportNewRequest('bb:crr:ops');
        //         this._statsClient.reportNewRequest('bb:crr:bytes', null,
        //             entry.dataBytes);
        //     } else if (entry.ops === 'processed') {
        //         this._statsClient.reportNewRequest('bb:crr:opsdone');
        //         this._statsClient.reportNewRequest('bb:crr:bytesdone', null,
        //             entry.dataBytes);
        //     }
        //     cb();
        // });
    }
}

module.exports = MetricsConsumer;

// {
//     timestamp: Date.now(),
//     ops,
//     dataBytes,
//     bucket,
//     ext,
//     type,
//     key,
// }
