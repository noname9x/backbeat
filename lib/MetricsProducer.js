'use strict'; // eslint-disable-line strict

const { Logger } = require('werelogs');

const BackbeatProducer = require('./BackbeatProducer');
const MetricsModel = require('./MetricsModel');

/*
    NOTE: Using this MetricsProducer only on QueueProcessor side
*/
class MetricsProducer {
    /**
    * @constructor
    * @param {object} zkConfig - zookeeper configurations
    * @param {object} mConfig - metrics configurations
    */
    constructor(zkConfig, mConfig) {
        this._zkConfig = zkConfig;
        this._topic = mConfig.topic;

        this._producer = null;
        this._log = new Logger('MetricsProducer');
    }

    setupProducer(done) {
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

    publish(op, dataBytes, mdBytes, bucket, ext, type, cb) {
        // opType, dataLen, mdLen, bucket, extension
        const message = MetricsModel.serialize(op, dataBytes, mdBytes, bucket,
            ext, type);
        const entry = { key: `${bucket}-metric`, message };
        this._producer.send([entry], cb);
    }

}

module.exports = MetricsProducer;
