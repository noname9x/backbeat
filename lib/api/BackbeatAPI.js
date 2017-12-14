'use strict'; // eslint-disable-line strict

const zookeeper = require('node-zookeeper-client');

const { errors } = require('arsenal');

const Healthcheck = require('./Healthcheck');
const routes = require('./routes');

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

    _setZookeeper(cb) {
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
