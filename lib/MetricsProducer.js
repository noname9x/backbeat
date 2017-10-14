const BackbeatProducer = require('./BackbeatProducer');
const { Logger } = require('werelogs');
const MetricsModel = require('./MetricsModel');

class MetricsProducer {
    constructor(config) {
        const { zookeeper, topic, extension } = config;
        this._zkConfig = zookeeper;
        this._topic = topic;
        this._extension = extension;
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
