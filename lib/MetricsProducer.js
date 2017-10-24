'use strict'; // eslint-disable-line strict

const { Logger } = require('werelogs');

const BackbeatProducer = require('./BackbeatProducer');
const MetricsModel = require('./MetricsModel');

class MetricsProducer {
    /**
    * @constructor
    * @param {object} zkConfig - zookeeper configurations
    * @param {object} mConfig - metrics configurations
    */
    constructor(zkConfig, mConfig) {
        this._zkConfig = zkConfig;
        this._topic = mConfig.topic;

        // Idea is to batch up to-be-soon consumed entries.
        // On BackbeatConsumer queue.drain event, we trigger to flush  and
        // process currently saved batch
        this.batch = [];

        this._producer = null;
        this._log = new Logger('MetricsProducer');
    }

    getBatch() {
        return this.batch;
    }

    processQueueEntry(sourceEntry, done) {
        const entryBytes = sourceEntry.getLocation().location.reduce(
            (sum, item) => sum + item.size, 0);
        const metricsEntry = MetricsModel.serialize('processed', entryBytes,
            sourceEntry.getBucket(), this._topic);

        this.batch.push(metricsEntry);
        done();
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

    /**
     * @param {array} entries - array of entry objects
     * @param {function} cb - callback
     * @return {undefined}
     */
    send(entries, cb) {
        if (this.batch.length === 0 && entries.length === 0) {
            return cb();
        }
        const allEntries = this.batch.concat(entries);
        const batchToProcess = JSON.parse(JSON.stringify(allEntries));
        this.batch = [];

        return this._producer.send(batchToProcess, cb);
    }
}

module.exports = MetricsProducer;
