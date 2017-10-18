'use strict'; // eslint-disable-line strict

const { Logger } = require('werelogs');

const BackbeatProducer = require('./BackbeatProducer');
const MetricsModel = require('./MetricsModel');

class MetricsProducer {
    /**
    * @constructor
    * @param {object} config - configurations for setup
    * @param {object} config.zookeeper - zookeeper configs
    * @param {object} config.metrics - metrics configs
    * @param {object} config.extensions - extensions configs
    */
    constructor(config) {
        this._zkConfig = config.zookeeper;
        this._topic = config.metrics.topic;
        // configurable extension?
        this._extension = config.extensions.replication;

        this._producer = null;
        this._log = new Logger('MetricsProducer');
    }

    _setupProducer(done) {
        const producer = new BackbeatProducer({
            zookeeper: { connectionString: this._zkConfig.connectionString },
            topic: this._topic,
        });
        producer.once('error', done);
        producer.once('ready', () => {
            producer.removeAllListeners('error');
            producer.on('error', err => {
                this._log.error('error from backbeat producer',
                               { error: err });
            });
            this._producer = producer;
            done();
        });
    }

    pub(bucket, mdLen, dataLen, op, type, cb) {
        // opType, dataLen, mdLen, bucket, extension
        const message = new MetricsModel(op, bucket, mdLen, bucket,
            this._extension, type).serialize();
        const entry = { key: `${bucket}-metric`, message };
        this._producer.send([entry], cb);
    }

}

module.exports = MetricsProducer;
