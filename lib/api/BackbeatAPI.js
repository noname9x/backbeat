'use strict'; // eslint-disable-line strict

const async = require('async');
const { EventEmitter } = require('events');
const zookeeper = require('node-zookeeper-client');
const uuid = require('uuid/v4');

const { errors } = require('arsenal');

const { errors } = require('arsenal');

const Healthcheck = require('./Healthcheck');
const BackbeatConsumer = require('../BackbeatConsumer');
const routes = require('./routes');

const CONSUMER_FETCH_MAX_BYTES = 5000020;

// Time limit for deep healthcheck
const DH_TIMELIMIT = 60000;  // 1 minute
const DH_INTERVAL = 500; // retry intervals

class _Probe extends EventEmitter {
    constructor(id) {
        super();
        this.id = id;
        this.store = null;
    }

    checkStore() {
        // get length of undefined values (still to be set)
        let count = 0;
        Object.keys(this.store).forEach(partition => {
            if (this.store[partition] === undefined) {
                count++;
            }
        });
        return count;
    }

    getId() {
        return this.id;
    }

    getStore() {
        return this.store;
    }

    setStoreData(partition, value) {
        this.store[partition] = value;
    }

    setStoreErrors() {
        for (const partition in this.store) {
            if (this.store[partition] === undefined) {
                this.store[partition] = 'error';
            }
        }
    }

    setStorePartition(partition) {
        this.store[partition] = 'ok';
    }

    setupStore(partitions) {
        this.store = partitions.reduce((store, partition) => {
            // eslint-disable-next-line
            store[partition] = undefined;
            return store;
        }, {});
    }
}

/**
 * Class representing Backbeat API endpoints and internals
 *
 * @class
 */
class BackbeatAPI {
    /**
     * @constructor
     * @param {object} config - configurations for setup
     * @param {werelogs.Logger} logger - Logger object
     * @param {BackbeatProducer} crrProducer - producer for CRR topic
     * @param {BackbeatProducer} metricProducer - producer for metric topic
     */
    constructor(config, logger, crrProducer, metricProducer) {
        this._zkConfig = config.zookeeper;
        this._repConfig = config.extensions.replication;
        this._queuePopulator = config.queuePopulator;
        this._logger = logger;

        this._crrProducer = crrProducer;
        this._metricProducer = metricProducer;
        this._healthcheck = null;
        this._zkClient = null;
        this._probe = null;
    }

    /**
     * Check if incoming request is valid
     * @param {string} route - request route
     * @return {boolean} true/false
     */
    isValidRoute(route) {
        return routes.map(route => route.path).includes(route);
    }

    /**
     * Check if Zookeeper and Producer are connected
     * @return {boolean} true/false
     */
    isConnected() {
        return this._zkClient.getState().name === 'SYNC_CONNECTED'
            && this._crrProducer.isReady() && this._metricProducer.isReady();
    }

    /**
     * Get Kafka healthcheck
     * @param {function} cb - callback(error, data)
     * @return {undefined}
     */
    healthcheck(cb) {
        return this._healthcheck.getHealthcheck((err, data) => {
            if (err) {
                this._logger.error('error getting healthcheck', err);
                return cb(errors.InternalError);
            }
            return cb(null, data);
        });
    }

    /**
     * Setup internals
     * @param {function} cb - callback(error, data)
     * @return {undefined}
     */
    setup(cb) {
        this._setZookeeper(err => {
            if (err) {
                this._logger.error('error setting up internal clients');
                return cb(err);
            }
            this._healthcheck = new Healthcheck(this._repConfig, this._zkClient,
                this._crrProducer, this._metricProducer);
            this._logger.info('BackbeatAPI setup ready');
            return cb();
        });
    }

    /**
     * Get deep healthcheck
     * A deep healthcheck will send entries to BackbeatProducer to produce to
     * Kafka, catch these entries using the same global Kafka topic used for
     * Backbeat CRR, but using a new BackbeatConsumer for each health request
     * @param {function} cb - callback(error, data)
     * @return {undefined}
     */
    getDeepHealthcheck(cb) {
        if (!this._producer) {
            this._logger.error('error getting deep healthcheck', {
                method: 'BackbeatAPI.getDeepHealthcheck',
                error: 'Backbeat Producer not set',
            });
            return cb(errors.InternalError);
        }

        const start = Date.now();
        const id = `deephealthcheck-${uuid().replace(/-/g, '')}`;
        this._probe = new _Probe(id);

        return async.waterfall([
            done => this._getTopicPartitions(done),
            (partitions, done) => {
                this._probe.setupStore(partitions);
                this._createEntries(id, partitions, done);
            },
            (entries, done) => this._producer.send(entries, done),
            done => this._createConsumer('deephealthcheck-group', done),
        ], (err, consumer) => {
            if (err || consumer === undefined) {
                this._logger.error('error getting deep healthcheck', {
                    method: 'BackbeatAPI.getDeepHealthcheck',
                    error: err,
                });
                return cb(errors.InternalError);
            }
            this._probe.on('collect', (partition, id) => {
                if (id === this._probe.getId()) {
                    this._probe.setStorePartition(partition);
                }
            });

            return async.retry({
                times: Number.parseInt(DH_TIMELIMIT / DH_INTERVAL, 10),
                interval: DH_INTERVAL,
                errorFilter: err => err === 'retry',
            },
            this._waitAndCheck.bind(this, start),
            (err, data) => {
                if (err) {
                    // replace all undefined values as 'error'
                    this._probe.setStoreErrors();
                }
                if (data) {
                    this._probe.setStoreData('timeElapsed', data.time);
                }

                // cleanup
                const response = this._probe.getStore();
                this._probe.removeAllListeners();
                this._probe = null;
                consumer.close(() => {});

                return cb(null, response);
            });
        });
    }

    _waitAndCheck(start, cb) {
        setTimeout(() => {
            const now = Date.now();
            const diff = now - start;
            if (this._probe.checkStore() === 0) {
                // all done, success
                return cb(null, { time: (now - start) });
            }

            if (diff > DH_TIMELIMIT) {
                // time limit exceeded
                return cb('stop');
            }
            return cb('retry');
        });
    }

    /**
     * Create a new Backbeat Consumer
     * @param {string} groupId - group id name
     * @param {function} cb - callback(error, response)
     * @return {undefined}
     */
    _createConsumer(groupId, cb) {
        const consumer = new BackbeatConsumer({
            zookeeper: { connectionString: this._zkConfig.connectionString },
            topic: this._repConfig.topic,
            groupId,
            concurrency: this._repConfig.queueProcessor.concurrency,
            queueProcessor: this.processKafkaEntry,
            fetchMaxBytes: CONSUMER_FETCH_MAX_BYTES,
        });
        consumer.on('error', () => {});
        consumer.subscribe();
        return cb(null, consumer);
    }

    _processKafkaEntry(kafkaEntry) {
        // Here, I will be receiving all kafka entries
        // ignore legit entries and only capture deephealthchecks
        if (kafkaEntry.topic === this._repConfig.topic
        && kafkaEntry.key && kafkaEntry.key.startsWith('deephealthcheck')) {
            // I want to access partition # and return healthy for
            // that partition
            this._probe.emit('collect', kafkaEntry.partition, kafkaEntry.key);
        }
    }

    /**
     * Get kafka topic partitions
     * @param {function} cb - callback(error, data)
     * @return {undefined}
     */
    _getTopicPartitions(cb) {
        const client = this._producer.getProducer().client;

        client.loadMetadataForTopics([], (err, res) => {
            if (err) {
                this._logger.trace('error getting topic partitions');
                return cb(errors.InternalError);
            }
            const partitions = Object.keys(res[0]).map(i =>
                Number.parseInt(i, 10));
            return cb(null, partitions);
        });
    }

    /**
     * Create kafka entries to send to BackbeatProducer for deep healthcheck
     * @param {string} id - unique identifier for the deep healthcheck request
     * @param {array} partitions - array of kafka topic partitions
     * @param {function} cb - callback(error, data)
     * @return {undefined}
     */
    _createEntries(id, partitions, cb) {
        const entries = partitions.map(partition => ({
            partition,
            message: '',
            key: id,
        }));

        return cb(null, entries);
    }

    setZookeeper(cb) {
        const populatorZkPath = this._queuePopulator.zookeeperPath;
        const zookeeperUrl =
            `${this._zkConfig.connectionString}${populatorZkPath}`;

        const zkClient = zookeeper.createClient(zookeeperUrl, {
            autoCreateNamespace: this._zkConfig.autoCreateNamespace,
        });
        zkClient.connect();

        zkClient.once('error', cb);
        zkClient.once('state', event => {
            if (event.name !== 'SYNC_CONNECTED' || event.code !== 3) {
                return cb('error setting up zookeeper');
            }
            zkClient.removeAllListeners('error');
            this._zkClient = zkClient;
            return cb();
        });
    }
}

module.exports = BackbeatAPI;
